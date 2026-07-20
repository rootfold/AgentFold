import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateCapabilityToken(): string {
  return randomBytes(32).toString("base64url");
}

function tokenDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function capabilityTokensEqual(expected: string, received: string): boolean {
  return timingSafeEqual(tokenDigest(expected), tokenDigest(received));
}
