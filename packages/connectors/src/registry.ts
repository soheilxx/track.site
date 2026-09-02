import type { ConnectorType } from "@track-site/policy";
import type { Connector, ConnectorMeta } from "./connector.ts";
import { WebhookConnector } from "./webhook.ts";

const registry = new Map<ConnectorType, Connector>();

export function registerConnector(connector: Connector): void {
  registry.set(connector.meta.type, connector);
}

registerConnector(new WebhookConnector());

export function getConnector(type: ConnectorType): Connector | null {
  return registry.get(type) ?? null;
}

export function listConnectorMeta(): ConnectorMeta[] {
  return Array.from(registry.values()).map((c) => c.meta);
}

export function availableConnectorTypes(): ConnectorType[] {
  return Array.from(registry.keys());
}
