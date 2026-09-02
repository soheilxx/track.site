# ADR-0003 - better-auth for authentication, organizations and MFA

Date: 2026-09-02. Status: accepted.

## Context
Secure registration, email verification, login, password reset, invitations, session management and MFA/WebAuthn are required. Inventing session cryptography is forbidden.

## Decision
better-auth 1.7 (stable, Next.js 16 support, Drizzle adapter) with plugins `organization` (organizations, memberships, invitations, custom roles), `twoFactor` (TOTP + backup codes) and `passkey` (WebAuthn). Platform admins use a separate `platform_role` column with step-up, not the generic admin plugin. Roles: OWNER, ADMIN, DEVELOPER, ANALYST, BILLING, READ_ONLY.

## Alternatives
Auth.js (weaker organization/MFA story), Lucia (now a guide), custom (forbidden).

## Consequences
Auth tables are part of the baseline migration; RBAC helpers wrap the access control so every server action calls `requireRole`.
