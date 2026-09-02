import type { ConnectorType } from "@track-site/policy";
import type { Connector, ConnectorMeta } from "./connector.ts";
import { Ga4Connector } from "./vendors/ga4.ts";
import { GoogleAdsConnector } from "./vendors/google-ads.ts";
import { LinkedInConnector } from "./vendors/linkedin.ts";
import { MetaConnector } from "./vendors/meta.ts";
import { MicrosoftConnector } from "./vendors/microsoft.ts";
import { PinterestConnector } from "./vendors/pinterest.ts";
import { RedditConnector } from "./vendors/reddit.ts";
import { SnapchatConnector } from "./vendors/snapchat.ts";
import { TikTokConnector } from "./vendors/tiktok.ts";
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

export function getConnector(type: ConnectorType): Connector | null {
  return registry.get(type) ?? null;
}

export function listConnectorMeta(): ConnectorMeta[] {
  return Array.from(registry.values()).map((c) => c.meta);
}

export function availableConnectorTypes(): ConnectorType[] {
  return Array.from(registry.keys());
}
