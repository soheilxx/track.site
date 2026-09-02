# ADR-0001 - pnpm/Turborepo monorepo: modular monolith plus data-plane services

Date: 2026-09-02. Status: accepted.

## Context
The target repository was empty. The spec requires a strict control-plane/data-plane split, a browser SDK, connectors, an AI package and shop integrations, while forbidding unnecessary microservice sprawl.

## Decision
One TypeScript monorepo (pnpm workspaces, Turborepo). `apps/web` is a modular monolith (Next.js 16) for everything user-facing plus the control API. The data plane consists of two small services, `apps/collector` (Hono) and `apps/worker`, because high-volume ingestion must not run through Next.js routes and workers need long-running processes. Domain logic lives in `packages/*` so both planes share schemas, policies and adapters.

## Consequences
Single toolchain, shared types, one CI. Services deploy and scale independently. Further services can be added without restructuring.
