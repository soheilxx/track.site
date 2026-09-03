<?php
/**
 * Plugin Name: track.site
 * Plugin URI:  https://track.site/en/integrations/woocommerce
 * Description: Browser snippet, purchase data layer on the thank-you page and signed order webhooks for track.site.
 * Version:     1.0.0
 * Author:      track.site
 * License:     MIT
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * WC requires at least: 8.0
 * Text Domain: track-site
 */

if (!defined('ABSPATH')) {
    exit;
}

final class TrackSite_Plugin
{
    private const OPTION = 'track_site_settings';
    private const WEBHOOK_OPTION = 'track_site_webhook_ids';
    private const TOPICS = ['order.created', 'order.updated'];

    public static function boot(): void
    {
        $self = new self();
        add_action('admin_menu', [$self, 'menu']);
        add_action('admin_init', [$self, 'register_settings']);
        add_action('wp_head', [$self, 'snippet'], 1);
        add_action('woocommerce_thankyou', [$self, 'purchase_data_layer'], 20);
        add_action('update_option_' . self::OPTION, [$self, 'sync_webhooks'], 10, 0);
        add_action('before_woocommerce_init', static function (): void {
            if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
            }
        });
        register_deactivation_hook(__FILE__, [$self, 'remove_webhooks']);
    }

    /** @return array{tracking_id:string,cdn:string,ingest:string,webhook_url:string,secret:string,data_layer:string} */
    private function settings(): array
    {
        $defaults = ['tracking_id' => '', 'cdn' => 'https://cdn.track.site', 'ingest' => 'https://ingest.track.site', 'webhook_url' => '', 'secret' => '', 'data_layer' => '1'];
        $stored = get_option(self::OPTION, []);
        return array_merge($defaults, is_array($stored) ? $stored : []);
    }

    public function menu(): void
    {
        add_options_page('track.site', 'track.site', 'manage_options', 'track-site', [$this, 'render_settings']);
    }

    public function register_settings(): void
    {
        register_setting('track_site', self::OPTION, ['type' => 'array', 'sanitize_callback' => [$this, 'sanitize']]);
    }

    /** @param mixed $input */
    public function sanitize($input): array
    {
        $in = is_array($input) ? $input : [];
        $current = $this->settings();
        $out = [
            'tracking_id' => preg_match('/^[A-Za-z0-9]{6}$/', (string) ($in['tracking_id'] ?? '')) ? (string) $in['tracking_id'] : '',
            'cdn' => esc_url_raw((string) ($in['cdn'] ?? 'https://cdn.track.site')),
            'ingest' => esc_url_raw((string) ($in['ingest'] ?? 'https://ingest.track.site')),
            'webhook_url' => esc_url_raw((string) ($in['webhook_url'] ?? '')),
            // an empty secret field keeps the stored secret; the value is never printed back into the form
            'secret' => ($in['secret'] ?? '') !== '' ? sanitize_text_field((string) $in['secret']) : $current['secret'],
            'data_layer' => empty($in['data_layer']) ? '0' : '1',
        ];
        if (strlen($out['secret']) > 0 && strlen($out['secret']) < 8) {
            add_settings_error('track_site', 'secret', __('The webhook secret must be at least 8 characters.', 'track-site'));
            $out['secret'] = $current['secret'];
        }
        return $out;
    }

    public function render_settings(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $s = $this->settings();
        $ids = get_option(self::WEBHOOK_OPTION, []);
        ?>
        <div class="wrap">
            <h1>track.site</h1>
            <p><?php esc_html_e('One snippet for the browser, a purchase data layer on the thank-you page and signed order webhooks. Payment details are never sent.', 'track-site'); ?></p>
            <form method="post" action="options.php">
                <?php settings_fields('track_site'); ?>
                <table class="form-table" role="presentation">
                    <tr><th scope="row"><label for="ts_tracking_id"><?php esc_html_e('Tracking ID', 'track-site'); ?></label></th>
                        <td><input id="ts_tracking_id" name="<?php echo esc_attr(self::OPTION); ?>[tracking_id]" type="text" class="regular-text" value="<?php echo esc_attr($s['tracking_id']); ?>" pattern="[A-Za-z0-9]{6}" required></td></tr>
                    <tr><th scope="row"><label for="ts_webhook_url"><?php esc_html_e('Webhook URL', 'track-site'); ?></label></th>
                        <td><input id="ts_webhook_url" name="<?php echo esc_attr(self::OPTION); ?>[webhook_url]" type="url" class="large-text" value="<?php echo esc_attr($s['webhook_url']); ?>">
                            <p class="description"><?php esc_html_e('From the site\'s "Shop connection" page in track.site (WooCommerce).', 'track-site'); ?></p></td></tr>
                    <tr><th scope="row"><label for="ts_secret"><?php esc_html_e('Webhook secret', 'track-site'); ?></label></th>
                        <td><input id="ts_secret" name="<?php echo esc_attr(self::OPTION); ?>[secret]" type="password" class="regular-text" autocomplete="new-password" placeholder="<?php echo $s['secret'] !== '' ? esc_attr__('(stored — leave empty to keep)', 'track-site') : ''; ?>">
                            <p class="description"><?php esc_html_e('Store the same secret in track.site. The plugin signs every webhook with it.', 'track-site'); ?></p></td></tr>
                    <tr><th scope="row"><label for="ts_cdn"><?php esc_html_e('SDK host', 'track-site'); ?></label></th>
                        <td><input id="ts_cdn" name="<?php echo esc_attr(self::OPTION); ?>[cdn]" type="url" class="regular-text" value="<?php echo esc_attr($s['cdn']); ?>"></td></tr>
                    <tr><th scope="row"><label for="ts_ingest"><?php esc_html_e('Collector host', 'track-site'); ?></label></th>
                        <td><input id="ts_ingest" name="<?php echo esc_attr(self::OPTION); ?>[ingest]" type="url" class="regular-text" value="<?php echo esc_attr($s['ingest']); ?>"></td></tr>
                    <tr><th scope="row"><?php esc_html_e('Purchase data layer', 'track-site'); ?></th>
                        <td><label><input name="<?php echo esc_attr(self::OPTION); ?>[data_layer]" type="checkbox" value="1" <?php checked($s['data_layer'], '1'); ?>> <?php esc_html_e('Push a GA4-shaped purchase event on the thank-you page (browser path, pairs with the webhook by order id).', 'track-site'); ?></label></td></tr>
                </table>
                <?php submit_button(); ?>
            </form>
            <h2><?php esc_html_e('Webhooks', 'track-site'); ?></h2>
            <p><?php echo $ids ? esc_html(sprintf(__('%d WooCommerce webhooks are managed by this plugin (topics: %s).', 'track-site'), count($ids), implode(', ', self::TOPICS))) : esc_html__('No webhooks yet. Save the settings with a webhook URL and secret to create them.', 'track-site'); ?></p>
        </div>
        <?php
    }

    /** The standard snippet: async loader with the tracking id; custom hosts only when they differ from the defaults. */
    public function snippet(): void
    {
        $s = $this->settings();
        if ($s['tracking_id'] === '') {
            return;
        }
        $extra = '';
        if ($s['cdn'] !== 'https://cdn.track.site' || $s['ingest'] !== 'https://ingest.track.site') {
            $extra = ' data-cdn="' . esc_attr($s['cdn']) . '" data-ingest="' . esc_attr($s['ingest']) . '"';
        }
        echo '<script async src="' . esc_url(rtrim($s['cdn'], '/') . '/v1/tracker.js') . '" data-site-id="' . esc_attr($s['tracking_id']) . '"' . $extra . '></script>' . "\n";
    }

    /** GA4-shaped purchase push the SDK observes (`data_layer` trigger with key `purchase`). Guarded against reloads. */
    public function purchase_data_layer(int $order_id): void
    {
        $s = $this->settings();
        if ($s['tracking_id'] === '' || $s['data_layer'] !== '1' || !function_exists('wc_get_order')) {
            return;
        }
        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_track_site_dl_sent') === '1') {
            return;
        }
        $items = [];
        foreach ($order->get_items() as $item) {
            /** @var WC_Order_Item_Product $item */
            $product = $item->get_product();
            $items[] = [
                'item_id' => (string) ($item->get_variation_id() ?: $item->get_product_id()),
                'item_name' => $item->get_name(),
                'price' => $item->get_quantity() > 0 ? round((float) $item->get_total() / $item->get_quantity(), 2) : (float) $item->get_total(),
                'quantity' => (int) $item->get_quantity(),
                'sku' => $product ? $product->get_sku() : null,
            ];
        }
        $payload = [
            'event' => 'purchase',
            'ecommerce' => [
                'transaction_id' => (string) $order->get_id(),
                'order_id' => (string) $order->get_id(),
                'value' => (float) $order->get_total(),
                'currency' => $order->get_currency(),
                'tax' => (float) $order->get_total_tax(),
                'shipping' => (float) $order->get_shipping_total(),
                'coupon' => implode(',', $order->get_coupon_codes()) ?: null,
                'items' => $items,
            ],
        ];
        $order->update_meta_data('_track_site_dl_sent', '1');
        $order->save();
        echo '<script>window.dataLayer=window.dataLayer||[];window.dataLayer.push(' . wp_json_encode($payload) . ');</script>' . "\n";
    }

    /** Creates or updates the two native WooCommerce webhooks (REST v3 payload, HMAC-SHA256 signature with the secret). */
    public function sync_webhooks(): void
    {
        if (!class_exists('WC_Webhook')) {
            return;
        }
        $s = $this->settings();
        if ($s['webhook_url'] === '' || $s['secret'] === '') {
            $this->remove_webhooks();
            return;
        }
        $ids = get_option(self::WEBHOOK_OPTION, []);
        $ids = is_array($ids) ? $ids : [];
        $next = [];
        foreach (self::TOPICS as $topic) {
            $webhook = isset($ids[$topic]) ? new WC_Webhook((int) $ids[$topic]) : new WC_Webhook();
            if (isset($ids[$topic]) && !$webhook->get_id()) {
                $webhook = new WC_Webhook();
            }
            $webhook->set_name('track.site ' . $topic);
            $webhook->set_topic($topic);
            $webhook->set_delivery_url($s['webhook_url']);
            $webhook->set_secret($s['secret']);
            $webhook->set_api_version('wp_api_v3');
            $webhook->set_status('active');
            if (!$webhook->get_user_id()) {
                $webhook->set_user_id(get_current_user_id());
            }
            $webhook->save();
            $next[$topic] = $webhook->get_id();
        }
        update_option(self::WEBHOOK_OPTION, $next, false);
    }

    public function remove_webhooks(): void
    {
        if (!class_exists('WC_Webhook')) {
            return;
        }
        $ids = get_option(self::WEBHOOK_OPTION, []);
        foreach (is_array($ids) ? $ids : [] as $id) {
            $webhook = new WC_Webhook((int) $id);
            if ($webhook->get_id()) {
                $webhook->delete(true);
            }
        }
        delete_option(self::WEBHOOK_OPTION);
    }
}

add_action('plugins_loaded', [TrackSite_Plugin::class, 'boot']);
