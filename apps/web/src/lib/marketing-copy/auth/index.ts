import type { AuthCopy, LocalizedCopy } from "../types";
import { AUTH_COPY_EN } from "./en";
import { AUTH_COPY_DE } from "./de";
import { AUTH_COPY_ES } from "./es";
import { AUTH_COPY_FR } from "./fr";
import { AUTH_COPY_IT } from "./it";
import { AUTH_COPY_NL } from "./nl";

/**
 * Auth shell copy (supplement §4 "Login und Registrierung": minimal Track brand, clear form flow,
 * optional product preview, short privacy/security signals, no full marketing footer).
 *
 * Field labels, errors and flow-specific strings stay in messages/{en,de}/auth.json because the auth
 * forms are client components that read it through next-intl. Everything the server-rendered shell
 * shows around the forms (chrome, setup steps, signals, the static preview, the plan hand-over note)
 * lives here, typed, en + de of one shape.
 *
 * Every signal is a verifiable product fact (passkey + TOTP plugins are wired in auth-client.ts,
 * the EU region / Art. 28 statement is the one the footer makes, consent-gated delivery is the
 * policy engine's rule). No customers, numbers or success claims.
 */

export const AUTH_COPY: LocalizedCopy<AuthCopy> = { en: AUTH_COPY_EN, de: AUTH_COPY_DE, fr: AUTH_COPY_FR, es: AUTH_COPY_ES, it: AUTH_COPY_IT, nl: AUTH_COPY_NL };
