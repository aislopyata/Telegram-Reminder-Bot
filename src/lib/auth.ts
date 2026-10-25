import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

/**
 * Compare secrets without leaking length or prefix through timing. Hashing
 * first makes both inputs the same length, so timingSafeEqual is usable even
 * when an attacker supplies a short header.
 */
export function safeEqual(actual: string | null | undefined, expected: string): boolean {
  if (typeof actual !== "string" || actual.length === 0) return false;
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function verifyWebhookSecret(header: string | null | undefined): boolean {
  const secret = getEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  return safeEqual(header, secret);
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. A custom header is
 * also accepted for manual/external schedulers. Query-string secrets are
 * deliberately not supported because URLs end up in logs.
 */
export function verifyCronRequest(headers: Headers, authorizationHeader?: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const authorization = authorizationHeader ?? headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return safeEqual(authorization.slice("Bearer ".length).trim(), secret);
  }
  const custom = headers.get("x-cron-secret");
  return safeEqual(custom, secret);
}
