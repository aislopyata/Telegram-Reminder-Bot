import type { Db } from "@/lib/db";
import { calculateBackoffMs, generateClaimToken } from "./backoff";

const DELIVERY_LEASE_MS = 60_000;

export async function claimDueDeliveries(
  db: Db,
  batchSize: number,
  now: Date = new Date(),
): Promise<string[]> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM reminder_deliveries
     WHERE ((status = 'PENDING' AND next_attempt_at <= $1)
            OR (status = 'RETRYABLE' AND next_attempt_at <= $1))
       AND (claim_token IS NULL OR locked_until < $1)
     ORDER BY next_attempt_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [now, batchSize],
  );

  const ids = (result.rows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (ids.length === 0) return [];

  const token = generateClaimToken();
  const lockedUntil = new Date(now.getTime() + DELIVERY_LEASE_MS);
  await db.query(
    `UPDATE reminder_deliveries
     SET status = 'PROCESSING', claim_token = $2, locked_until = $3
     WHERE id = ANY($1::bigint[])`,
    [ids, token, lockedUntil],
  );

  return ids;
}

export async function releaseDeliveryClaim(
  db: Db,
  deliveryId: string,
  token: string,
): Promise<void> {
  await db.query(
    `UPDATE reminder_deliveries
     SET claim_token = NULL, locked_until = NULL
     WHERE id = $1 AND claim_token = $2`,
    [deliveryId, token],
  );
}

export async function releaseExpiredDeliveryClaims(
  db: Db,
  now: Date = new Date(),
): Promise<number> {
  const result = await db.query(
    `UPDATE reminder_deliveries
     SET claim_token = NULL, locked_until = NULL, status = 'PENDING'
     WHERE claim_token IS NOT NULL AND locked_until < $1`,
    [now],
  );
  return result.rowCount ?? 0;
}

export async function markDeliverySent(
  db: Db,
  deliveryId: string,
  token: string,
  sentAt: Date = new Date(),
): Promise<void> {
  await db.query(
    `UPDATE reminder_deliveries
     SET status = 'SENT', sent_at = $2, claim_token = NULL, locked_until = NULL, last_error = NULL
     WHERE id = $1 AND claim_token = $3`,
    [deliveryId, sentAt, token],
  );
}

export async function markDeliveryPermanent(
  db: Db,
  deliveryId: string,
  token: string,
  lastError: string,
): Promise<void> {
  await db.query(
    `UPDATE reminder_deliveries
     SET status = 'PERMANENT', claim_token = NULL, locked_until = NULL, last_error = $2
     WHERE id = $1 AND claim_token = $3`,
    [deliveryId, lastError.slice(0, 500), token],
  );
}

export async function markDeliveryRetryable(
  db: Db,
  deliveryId: string,
  token: string,
  attempts: number,
  maxAttempts: number,
  lastError: string,
  now: Date = new Date(),
): Promise<void> {
  const nextAttempts = attempts + 1;
  if (nextAttempts >= maxAttempts) {
    await db.query(
      `UPDATE reminder_deliveries
       SET status = 'PERMANENT', attempts = $2, claim_token = NULL, locked_until = NULL, last_error = $3
       WHERE id = $1 AND claim_token = $4`,
      [deliveryId, nextAttempts, lastError.slice(0, 500), token],
    );
    return;
  }
  await db.query(
    `UPDATE reminder_deliveries
     SET status = 'RETRYABLE', attempts = $2, next_attempt_at = $3, claim_token = NULL, locked_until = NULL, last_error = $4
     WHERE id = $1 AND claim_token = $5`,
    [deliveryId, nextAttempts, new Date(now.getTime() + calculateBackoffMs(nextAttempts)), lastError.slice(0, 500), token],
  );
}

/**
 * Fold delivery progress back into the parent occurrence so list/reporting
 * queries do not see forever-PENDING occurrences. Occurrences with any
 * outstanding delivery stay PROCESSING; fully attempted ones become SENT,
 * FAILED, or SKIPPED.
 */
export async function syncOccurrenceStatuses(db: Db): Promise<void> {
  await db.query(
    `UPDATE reminder_occurrences o
     SET status = CASE
       WHEN EXISTS (
         SELECT 1 FROM reminder_deliveries d
         WHERE d.occurrence_id = o.id AND d.status IN ('PENDING', 'PROCESSING', 'RETRYABLE')
       ) THEN 'PROCESSING'
       WHEN EXISTS (
         SELECT 1 FROM reminder_deliveries d
         WHERE d.occurrence_id = o.id AND d.status = 'SENT'
       ) THEN 'SENT'
       WHEN EXISTS (
         SELECT 1 FROM reminder_deliveries d
         WHERE d.occurrence_id = o.id AND d.status IN ('PERMANENT', 'FAILED')
       ) THEN 'FAILED'
       ELSE 'SKIPPED'
     END
     WHERE o.status IN ('PENDING', 'PROCESSING')`,
  );
}
