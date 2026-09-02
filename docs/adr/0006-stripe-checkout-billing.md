# ADR-0006 - Stripe Checkout + Billing for subscriptions and metering

Date: 2026-09-02. Status: accepted.

## Context
Subscriptions, webhooks, entitlements and usage metering are required. Stripe Managed Payments may only be used when confirmed for the account.

## Decision
Stripe Checkout (server-created sessions) + Billing subscriptions + Customer Portal + signature-verified webhooks with an idempotent event ledger. Prices come from `STRIPE_PRICE_*` env, never hard-coded; missing IDs show an honest "not configured" state. Managed Payments is not enabled (availability unverified); the operator is merchant of record. Usage: immutable `usage_ledger` per accepted billable event, monthly aggregation, 80/100 percent alerts, soft/hard limits by plan.

## Consequences
Entitlements derive only from verified webhook truth; Stripe CLI fixtures are used in tests.
