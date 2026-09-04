import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { ORG_ROLES, PERMISSIONS, ROLE_PERMISSIONS, type OrgRole } from "@track-site/core";
import { schema } from "@track-site/db";
import { createAccessControl } from "better-auth/plugins/access";
import { env } from "../env";
import { db, logger } from "./db";
import { sendMail } from "./mail";
import { getMailCopy, renderMail } from "./mail/templates";

/** Stored language preference of a user record (additional field `locale`); undefined → English templates. */
function userLocale(user: unknown): string | undefined {
  const locale = (user as { locale?: unknown } | null)?.locale;
  return typeof locale === "string" ? locale : undefined;
}

/** Transactional mails must not fail silently: a transport error is logged (without addresses) and surfaced to the caller. */
async function mustSend(mail: Parameters<typeof sendMail>[0]): Promise<void> {
  const result = await sendMail(mail);
  if (!result.ok) {
    logger.error({ transport: result.transport, error: result.error, subject: mail.subject }, "transactional mail failed");
    throw new Error(`mail transport ${result.transport} failed: ${result.error}`);
  }
}

/** Access-control statements derived from the shared permission matrix (resource.action). */
function buildStatements(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of PERMISSIONS) {
    const [resource, action] = p.split(".") as [string, string];
    (out[resource] ??= []).push(action);
  }
  return out;
}
const statements = buildStatements();
export const ac = createAccessControl(statements as Record<string, readonly string[]>);

function roleStatements(role: OrgRole): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of ROLE_PERMISSIONS[role]) {
    const [resource, action] = p.split(".") as [string, string];
    (out[resource] ??= []).push(action);
  }
  return out;
}
export const roles = Object.fromEntries(ORG_ROLES.map((r) => [r, ac.newRole(roleStatements(r) as never)])) as unknown as Record<OrgRole, ReturnType<typeof ac.newRole>>;

function createAuth() {
  const e = env();
  const baseURL = e.HOST_MARKETING;
  return betterAuth({
    appName: "Track",
    baseURL,
    basePath: "/api/auth",
    secret: e.AUTH_SECRET ?? undefined,
    trustedOrigins: [e.HOST_MARKETING, e.HOST_APP.replace(/\/app$/, "")],
    database: drizzleAdapter(db(), { provider: "pg", schema }),
    advanced: {
      database: { generateId: "uuid" },
      cookiePrefix: "ts",
      useSecureCookies: e.APP_ENV === "production" || e.APP_ENV === "staging",
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, window: 60, max: 60 },
    user: {
      additionalFields: {
        platformRole: { type: "string", required: false, defaultValue: "NONE", input: false },
        locale: { type: "string", required: false, defaultValue: "en" },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      sendResetPassword: async ({ user, url }) => {
        await mustSend({ to: user.email, ...renderMail(getMailCopy(userLocale(user)).resetPassword, { url }) });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await mustSend({ to: user.email, ...renderMail(getMailCopy(userLocale(user)).verifyEmail, { url }) });
      },
    },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "OWNER",
        allowUserToCreateOrganization: true,
        organizationLimit: 5,
        membershipLimit: 100,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        sendInvitationEmail: async ({ email, organization: org, inviter, id }) => {
          // the invitee has no account yet, so the inviter's language (the organisation's working language) is used
          await mustSend({ to: email, ...renderMail(getMailCopy(userLocale(inviter.user)).invitation, { inviter: inviter.user.name, organization: org.name, url: `${baseURL}/accept-invitation/${id}` }) });
        },
      }),
      twoFactor({ issuer: "Track" }),
      passkey({ rpID: safeHost(baseURL), rpName: "Track", origin: baseURL }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | null = null;

/** Lazily constructed singleton so builds without env do not fail at import time. */
export function auth(): ReturnType<typeof createAuth> {
  instance ??= createAuth();
  return instance;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

export type Auth = ReturnType<typeof createAuth>;
