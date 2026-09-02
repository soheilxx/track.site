# ADR-0008 - Pin TypeScript 5.9.x instead of 7.0

Date: 2026-09-02. Status: accepted.

## Context
`typescript@latest` resolved to 7.0.2 (native compiler) on 2026-09-02. `typescript-eslint@8.69` declares `typescript >=4.8.4 <6.1.0`.

## Decision
Pin `typescript@~5.9.3` across the workspace until typescript-eslint and Next.js officially support 7.x. Revisit quarterly.
