import { randomBytes } from "node:crypto";
import { generateSigningKeyPair } from "../crypto/signing.ts";

/** Prints fresh local keys for .env (never commits them). */
const signing = generateSigningKeyPair("cfg-v1");
const lines = [
  `AUTH_SECRET=${randomBytes(32).toString("base64")}`,
  `MASTER_KEY=${randomBytes(32).toString("base64")}`,
  `MASTER_KEY_ID=local-v1`,
  `APPROVAL_TOKEN_SECRET=${randomBytes(32).toString("base64")}`,
  `CONFIG_SIGNING_KEY_ID=${signing.keyId}`,
  `CONFIG_SIGNING_PRIVATE_KEY=${signing.privateKeyBase64}`,
  `CONFIG_SIGNING_PUBLIC_KEY=${signing.publicKeyBase64}`,
  `NEXT_PUBLIC_CONFIG_SIGNING_PUBLIC_KEY=${signing.publicKeyBase64}`,
];
process.stdout.write(lines.join("\n") + "\n");
