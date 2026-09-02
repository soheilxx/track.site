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
import { db } from "./db";
import { sendMail } from "./mail";

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
    appName: "track.site",
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
        await sendMail({ to: user.email, subject: "Reset your track.site password", text: `Reset your password: ${url}\n\nIf you did not request this, ignore this e-mail.` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({ to: user.email, subject: "Verify your e-mail for track.site", text: `Welcome to track.site. Confirm your e-mail address: ${url}` });
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
          await sendMail({ to: email, subject: `${inviter.user.name} invited you to ${org.name} on track.site`, text: `Accept the invitation: ${baseURL}/accept-invitation/${id}` });
        },
      }),
      twoFactor({ issuer: "track.site" }),
      passkey({ rpID: safeHost(baseURL), rpName: "track.site", origin: baseURL }),
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
