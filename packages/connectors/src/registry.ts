import type { ConnectorType } from "@track-site/policy";
import type { Connector, ConnectorMeta } from "./connector.ts";
import { AdRollConnector } from "./vendors/adroll.ts";
import { CriteoConnector } from "./vendors/criteo.ts";
import { Ga4Connector } from "./vendors/ga4.ts";
import { GmpConnector } from "./vendors/gmp.ts";
import { GoogleAdsConnector } from "./vendors/google-ads.ts";
import { LinkedInConnector } from "./vendors/linkedin.ts";
import { MetaConnector } from "./vendors/meta.ts";
import { MicrosoftConnector } from "./vendors/microsoft.ts";
import { OutbrainConnector } from "./vendors/outbrain.ts";
import { PinterestConnector } from "./vendors/pinterest.ts";
import { RedditConnector } from "./vendors/reddit.ts";
import { SnapchatConnector } from "./vendors/snapchat.ts";
import { SpotifyConnector } from "./vendors/spotify.ts";
import { TaboolaConnector } from "./vendors/taboola.ts";
import { TikTokConnector } from "./vendors/tiktok.ts";
import { XConnector } from "./vendors/x.ts";
import { YahooConnector } from "./vendors/yahoo.ts";
import { WebhookConnector } from "./webhook.ts";

const registry = new Map<ConnectorType, Connector>();

export function registerConnector(connector: Connector): void {
  registry.set(connector.meta.type, connector);
}

registerConnector(new WebhookConnector());
registerConnector(new MetaConnector());
registerConnector(new Ga4Connector());
registerConnector(new GoogleAdsConnector());
registerConnector(new MicrosoftConnector());
registerConnector(new LinkedInConnector());
registerConnector(new PinterestConnector());
registerConnector(new SnapchatConnector());
registerConnector(new TikTokConnector());
registerConnector(new RedditConnector());
registerConnector(new XConnector());
registerConnector(new TaboolaConnector());
registerConnector(new OutbrainConnector());
registerConnector(new YahooConnector());
registerConnector(new GmpConnector());
registerConnector(new AdRollConnector());
registerConnector(new SpotifyConnector());
registerConnector(new CriteoConnector());

export function getConnector(type: ConnectorType): Connector | null {
  return registry.get(type) ?? null;
}

export function listConnectorMeta(): ConnectorMeta[] {
  return Array.from(registry.values()).map((c) => c.meta);
}

export function availableConnectorTypes(): ConnectorType[] {
  return Array.from(registry.keys());
}
