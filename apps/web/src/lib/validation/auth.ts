import { z } from "zod";

/** Shared client/server validation for auth forms (better-auth enforces the same limits server-side). */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(12).max(128);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  company: z.string().trim().max(120).optional(),
  domain: z.string().trim().max(253).optional(),
  /** honeypot: must stay empty */
  website: z.string().max(0).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email: emailSchema });

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "passwordMatch" });

export const totpSchema = z.object({ code: z.string().regex(/^\d{6}$/), trust: z.boolean().optional() });

/**
 * Backup code as issued by the two-factor plugin: alphanumeric groups, optionally joined with dashes
 * (`abcde-12345`). Deliberately separate from `totpSchema`, whose six-digit rule stays strict.
 */
export const backupCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(8)
    .max(32)
    .regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
  trust: z.boolean().optional(),
});

/** One form, two modes: the authenticator code (six digits) or a backup code (alphanumeric). */
export const twoFactorSchema = z.discriminatedUnion("mode", [totpSchema.extend({ mode: z.literal("totp") }), backupCodeSchema.extend({ mode: z.literal("backup") })]);
export type TwoFactorInput = z.infer<typeof twoFactorSchema>;
