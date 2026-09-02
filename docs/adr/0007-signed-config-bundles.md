# ADR-0007 - Ed25519-signed immutable config bundles with manifest pointer

Date: 2026-09-02. Status: accepted.

## Context
Config delivery must be versioned, immutable, signed, activated within 60 s and fail closed on tampering while never breaking the customer site.

## Decision
Publishing produces an immutable bundle `config/{siteId}/{version}.json` plus an Ed25519 signature (key in KMS or local). A small manifest (TTL 30 s) points at the active version. `tracker.js` embeds the public key at build time (`CONFIG_SIGNING_PUBLIC_KEY`), verifies with Web Crypto Ed25519 and refuses unsigned or invalid bundles (tracking off, page unaffected). Bundles contain only declarative connector templates, triggers and JSONLogic transforms (allow-list + complexity limit).

## Consequences
Key rotation requires an SDK rebuild carrying both keys for an overlap window; browsers without Ed25519 Web Crypto fall back to no tracking (fail closed).
