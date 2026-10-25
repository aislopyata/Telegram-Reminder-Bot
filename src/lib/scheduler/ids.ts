import { randomBytes } from "node:crypto";

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function generateClaimToken(): string {
  return randomToken(16);
}
