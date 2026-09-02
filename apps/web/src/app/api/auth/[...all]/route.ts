import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

export const dynamic = "force-dynamic";

/** better-auth handles sign-up, sign-in, verification, password reset, organizations, 2FA and passkeys. */
export async function GET(request: Request) {
  return toNextJsHandler(auth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(auth()).POST(request);
}
