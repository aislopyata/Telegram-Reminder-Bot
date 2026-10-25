import type { Db } from "@/lib/db";
import { generateClaimToken } from "./ids";
import { computeNextRun, type RecurrenceRule } from "@/lib/time";

const LEASE_MS = 60_000;

export type ClaimedReminder = {
  id: string;
  ownerId: string;
  text: string;
  type: "ONCE" | "RECURRING";
  recurrenceType: "WEEKLY" | "MONTHLY" | null;
  scheduledAtUtc: Date | null;
  localTime: string | null;
  timeZone: string;
  recurrenceDays: number[];
  nextRunAtUtc: Date | null;
  status: string;
};

export async function claimDueReminders(
  db: Db,
  batchSize: number,
  now: Date = new Date(),
): Promise<Array<{ id: string; token: string }>> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM reminders
     WHERE status = 'ACTIVE'
       AND next_run_at IS NOT NULL
       AND next_run_at <= $1
       AND (claim_token IS NULL OR claim_expires_at < $1)
     ORDER BY next_run_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT $2`,
    [now, batchSize],
  );

  const ids = (result.rows ?? []).map((row) => String(row.id)).filter(Boolean);
  if (ids.length === 0) return [];

  const token = generateClaimToken();
  const expiresAt = new Date(now.getTime() + LEASE_MS);
  await db.query(
    `UPDATE reminders
     SET claim_token = $2, claim_expires_at = $3
     WHERE id = ANY($1::bigint[]) AND status = 'ACTIVE'`,
    [ids, token, expiresAt],
  );

  return ids.map((id) => ({ id, token }));
}

export async function releaseReminderClaim(
  db: Db,
  reminderId: string,
  token: string,
): Promise<void> {
  await db.query(
    `UPDATE reminders
     SET claim_token = NULL, claim_expires_at = NULL
     WHERE id = $1 AND claim_token = $2`,
    [reminderId, token],
  );
}

export async function releaseExpiredClaims(db: Db, now: Date = new Date()): Promise<number> {
  const result = await db.query(
    `UPDATE reminders
     SET claim_token = NULL, claim_expires_at = NULL
     WHERE claim_token IS NOT NULL AND claim_expires_at < $1`,
    [now],
  );
  return result.rowCount ?? 0;
}

export function ruleFromReminder(reminder: ClaimedReminder): RecurrenceRule {
  return {
    type: reminder.type,
    recurrenceType: reminder.recurrenceType,
    scheduledAtUtc: reminder.scheduledAtUtc,
    localTime: reminder.localTime,
    timeZone: reminder.timeZone,
    recurrenceDays: reminder.recurrenceDays,
  };
}

export function advanceRecurring(
  reminder: ClaimedReminder,
  occurrenceAt: Date,
  now: Date = new Date(),
): Date | null {
  if (reminder.type !== "RECURRING") return null;
  try {
    return computeNextRun(ruleFromReminder(reminder), occurrenceAt);
  } catch {
    try {
      return computeNextRun(ruleFromReminder(reminder), now);
    } catch {
      return null;
    }
  }
}
