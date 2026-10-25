import { randomBytes } from "node:crypto";

/** Lease tokens are server-generated and only stored/passed internally. */
export function generateClaimToken(): string {
  return randomBytes(16).toString("hex");
}

export function calculateBackoffMs(attempts: number): number {
  // attempts is the number of failed attempts already recorded (after first failure, attempts==1 etc).
  // Use bounded exponential backoff: 30s, 2m, 10m, ~40m capped.
  const base = 30_000;
  const max = 60 * 60 * 1000;
  const exponent = Math.max(0, Math.min(attempts - 1, 10));
  const ms = base * 2 ** exponent;
  return Math.min(ms, max);
}
