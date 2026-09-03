-- additional credential kinds for OAuth 1.0a token secrets and client-credential vendors (Yahoo DSP)
ALTER TYPE "public"."credential_kind" ADD VALUE IF NOT EXISTS 'oauth_token_secret';
ALTER TYPE "public"."credential_kind" ADD VALUE IF NOT EXISTS 'client_id';
ALTER TYPE "public"."credential_kind" ADD VALUE IF NOT EXISTS 'client_secret';
