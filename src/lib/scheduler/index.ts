import type { Db } from "@/lib/db";
import type { TelegramSender } from "@/lib/telegram/types";
import { areFriends } from "@/lib/services/friends";
import { advanceRecurring, claimDueReminders, releaseExpiredClaims, releaseReminderClaim } from "./claims";
import {
  claimDueDeliveries,
  markDeliveryPermanent,
  markDeliveryRetryable,
  markDeliverySent,
  releaseExpiredDeliveryClaims,
  syncOccurrenceStatuses,
} from "./deliveries";
import { TelegramApiError } from "@/lib/telegram/errors";
import { logger } from "@/lib/logger";
import { ru } from "@/lib/i18n/ru";
import { escapeHtml } from "@/lib/telegram/html";
import { processHabitRemindersOnce } from "./habits";

const REMINDER_BATCH = 25;
const DELIVERY_BATCH = 50;
const MAX_ATTEMPTS = 5;

export type SchedulerStats = {
  remindersClaimed: number;
  occurrencesCreated: number;
  deliveriesCreated: number;
  deliveriesSent: number;
  deliveriesRetryable: number;
  deliveriesPermanent: number;
  remindersCompleted: number;
  remindersAdvanced: number;
  habitRemindersDue: number;
  habitRemindersSent: number;
  habitRemindersFailed: number;
  habitRemindersSkipped: number;
};

type FetchedReminder = {
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
  claimToken: string | null;
  claimExpiresAt: Date | null;
  occurrenceAt: Date;
  recipients: string[];
};

async function fetchReminderContext(db: Db, reminderId: string): Promise<FetchedReminder | null> {
  const result = await db.query<{
    id: string;
    owner_id: string;
    text: string;
    type: string;
    recurrence_type: string | null;
    scheduled_at: Date | null;
    local_time: string | null;
    time_zone: string;
    recurrence_days: number[];
    next_run_at: Date | null;
    status: string;
    claim_token: string | null;
    claim_expires_at: Date | null;
  }>(
    `SELECT id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone,
            recurrence_days, next_run_at, status, claim_token, claim_expires_at
     FROM reminders
     WHERE id = $1
     LIMIT 1`,
    [reminderId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const recipients = await db.query<{ recipient_user_id: string }>(
    `SELECT recipient_user_id FROM reminder_recipients WHERE reminder_id = $1`,
    [reminderId],
  );

  const occurrenceAt =
    row.type === "ONCE" ? (row.scheduled_at ?? new Date()) : (row.next_run_at ?? new Date());

  return {
    id: row.id,
    ownerId: row.owner_id,
    text: row.text,
    type: row.type === "ONCE" ? "ONCE" : "RECURRING",
    recurrenceType: row.recurrence_type === "WEEKLY" || row.recurrence_type === "MONTHLY" ? row.recurrence_type : null,
    scheduledAtUtc: row.scheduled_at,
    localTime: row.local_time,
    timeZone: row.time_zone,
    recurrenceDays: row.recurrence_days ?? [],
    nextRunAtUtc: row.next_run_at,
    status: row.status,
    claimToken: row.claim_token,
    claimExpiresAt: row.claim_expires_at,
    occurrenceAt,
    recipients: (recipients.rows ?? []).map((item) => String(item.recipient_user_id)).filter(Boolean),
  };
}

async function processClaimedReminder(
  db: Db,
  reminderId: string,
  token: string,
  now: Date,
): Promise<{ occurrenceCreated: boolean; deliveriesCreated: number; advanced: boolean; completed: boolean }> {
  const reminder = await fetchReminderContext(db, reminderId);
  if (!reminder) return { occurrenceCreated: false, deliveriesCreated: 0, advanced: false, completed: false };
  if (reminder.claimToken !== token || reminder.status !== "ACTIVE") {
    return { occurrenceCreated: false, deliveriesCreated: 0, advanced: false, completed: false };
  }

  const occurrenceAt = reminder.occurrenceAt;
  const occResult = await db.query<{ id: string }>(
    `INSERT INTO reminder_occurrences (reminder_id, scheduled_at, status)
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT (reminder_id, scheduled_at) DO NOTHING
     RETURNING id`,
    [reminder.id, occurrenceAt],
  );
  let occurrenceId: string | null = null;
  const occurrenceCreated = (occResult.rowCount ?? 0) > 0;
  if (occurrenceCreated) {
    occurrenceId = String(occResult.rows[0].id);
  }
  if (!occurrenceId) {
    const sel = await db.query<{ id: string }>(
      `SELECT id FROM reminder_occurrences WHERE reminder_id = $1 AND scheduled_at = $2 LIMIT 1`,
      [reminder.id, occurrenceAt],
    );
    occurrenceId = sel.rows[0] ? String(sel.rows[0].id) : null;
  }
  if (!occurrenceId) return { occurrenceCreated: false, deliveriesCreated: 0, advanced: false, completed: false };

  const eligible: string[] = [];
  const dropped: Array<{ telegramUserId: string; friendName: string }> = [];
  for (const recipientUserId of reminder.recipients) {
    if (recipientUserId === reminder.ownerId) {
      eligible.push(recipientUserId);
      continue;
    }
    const friends = await areFriends(db, reminder.ownerId, recipientUserId);
    if (!friends) {
      dropped.push({ telegramUserId: reminder.ownerId, friendName: reminder.text });
      await db.query(
        `DELETE FROM reminder_recipients WHERE reminder_id = $1 AND recipient_user_id = $2`,
        [reminder.id, recipientUserId],
      );
      continue;
    }
    eligible.push(recipientUserId);
  }

  let deliveriesCreated = 0;
  const uniqueEligible = [...new Set(eligible)];
  for (const recipientUserId of uniqueEligible) {
    const ins = await db.query(
      `INSERT INTO reminder_deliveries (occurrence_id, recipient_user_id, status, attempts, next_attempt_at, sent_at, last_error)
       VALUES ($1, $2, 'PENDING', 0, $3, NULL, NULL)
       ON CONFLICT (occurrence_id, recipient_user_id) DO NOTHING`,
      [occurrenceId, recipientUserId, occurrenceAt],
    );
    if ((ins.rowCount ?? 0) > 0) deliveriesCreated += 1;
  }

  await db.query(
    `UPDATE reminder_occurrences SET status = $2 WHERE id = $1`,
    [occurrenceId, deliveriesCreated > 0 ? "PENDING" : "COMPLETED"],
  );

  if (reminder.type === "ONCE") {
    await db.query(
      `UPDATE reminders SET status = 'COMPLETED', next_run_at = NULL, claim_token = NULL, claim_expires_at = NULL WHERE id = $1`,
      [reminder.id],
    );
    return { occurrenceCreated, deliveriesCreated, advanced: false, completed: true };
  }

  const next = advanceRecurring(reminder, occurrenceAt, now);
  if (next) {
    await db.query(
      `UPDATE reminders SET next_run_at = $2, claim_token = NULL, claim_expires_at = NULL WHERE id = $1`,
      [reminder.id, next],
    );
    return { occurrenceCreated, deliveriesCreated, advanced: true, completed: false };
  }

  await db.query(
    `UPDATE reminders SET status = 'DISABLED', next_run_at = NULL, claim_token = NULL, claim_expires_at = NULL WHERE id = $1`,
    [reminder.id],
  );
  return { occurrenceCreated, deliveriesCreated, advanced: false, completed: false };
}

async function sendDelivery(
  db: Db,
  sender: TelegramSender,
  deliveryId: string,
  token: string,
  maxAttempts: number,
  now: Date,
): Promise<"sent" | "retryable" | "permanent"> {
  const result = await db.query<{
    id: string;
    occurrence_id: string;
    recipient_user_id: string;
    owner_id: string;
    recipient_telegram_user_id: string;
    status: string;
    attempts: number;
    next_attempt_at: Date;
    sent_at: Date | null;
    last_error: string | null;
    text: string;
  }>(
    `SELECT d.id, d.occurrence_id AS occurrence_id, d.recipient_user_id AS recipient_user_id, r.owner_id AS owner_id,
            u.telegram_user_id AS recipient_telegram_user_id,
            d.status, d.attempts, d.next_attempt_at AS next_attempt_at, d.sent_at AS sent_at, d.last_error AS last_error,
            r.text AS text
     FROM reminder_deliveries d
     JOIN reminder_occurrences o ON o.id = d.occurrence_id
     JOIN reminders r ON r.id = o.reminder_id
     JOIN users u ON u.id = d.recipient_user_id
     WHERE d.id = $1 AND d.claim_token = $2
     LIMIT 1`,
    [deliveryId, token],
  );
  const delivery = result.rows[0];
  if (!delivery) return "permanent";
  if (delivery.status !== "PROCESSING") return "permanent";

  const text = ru.notifications.reminder(escapeHtml(delivery.text));
  try {
    await sender.sendMessage(String(delivery.recipient_telegram_user_id), text);
    await markDeliverySent(db, deliveryId, token, now);
    return "sent";
  } catch (error) {
    if (error instanceof TelegramApiError) {
      if (error.options.permanent) {
        await markDeliveryPermanent(db, deliveryId, token, error.message);
        return "permanent";
      }
      await markDeliveryRetryable(db, deliveryId, token, delivery.attempts, maxAttempts, error.message, now);
      return "retryable";
    }
    await markDeliveryRetryable(db, deliveryId, token, delivery.attempts, maxAttempts, String(error), now);
    return "retryable";
  }
}

export async function processRemindersOnce(
  db: Db,
  sender: TelegramSender,
  options: {
    reminderBatchSize?: number;
    deliveryBatchSize?: number;
    maxDeliveryAttempts?: number;
  } = {},
  now: Date = new Date(),
): Promise<SchedulerStats> {
  const reminderBatchSize = options.reminderBatchSize ?? REMINDER_BATCH;
  const deliveryBatchSize = options.deliveryBatchSize ?? DELIVERY_BATCH;
  const maxDeliveryAttempts = options.maxDeliveryAttempts ?? MAX_ATTEMPTS;

  const stats: SchedulerStats = {
    remindersClaimed: 0,
    occurrencesCreated: 0,
    deliveriesCreated: 0,
    deliveriesSent: 0,
    deliveriesRetryable: 0,
    deliveriesPermanent: 0,
    remindersCompleted: 0,
    remindersAdvanced: 0,
    habitRemindersDue: 0,
    habitRemindersSent: 0,
    habitRemindersFailed: 0,
    habitRemindersSkipped: 0,
  };

  await releaseExpiredClaims(db, now);
  await releaseExpiredDeliveryClaims(db, now);

  const claimed = await claimDueReminders(db, reminderBatchSize, now);
  stats.remindersClaimed = claimed.length;

  for (const claim of claimed) {
    const reminder = await fetchReminderContext(db, claim.id);
    if (!reminder) continue;
    if (reminder.claimToken !== claim.token || reminder.status !== "ACTIVE") {
      await releaseReminderClaim(db, claim.id, claim.token);
      continue;
    }
    try {
      const result = await processClaimedReminder(db, claim.id, claim.token, now);
      stats.occurrencesCreated += result.occurrenceCreated ? 1 : 0;
      stats.deliveriesCreated += result.deliveriesCreated;
      if (result.completed) stats.remindersCompleted += 1;
      if (result.advanced) stats.remindersAdvanced += 1;
    } catch (error) {
      logger.error("scheduler_reminder_failed", error, { reminderId: claim.id });
      await releaseReminderClaim(db, claim.id, claim.token);
    }
  }

  const deliveries = await claimDueDeliveries(db, deliveryBatchSize, now);
  for (const deliveryId of deliveries) {
    const tokenResult = await db.query<{ claim_token: string | null }>(
      `SELECT claim_token FROM reminder_deliveries WHERE id = $1 LIMIT 1`,
      [deliveryId],
    );
    const token = tokenResult.rows[0]?.claim_token ?? "";
    const result = await sendDelivery(db, sender, deliveryId, token, maxDeliveryAttempts, now);
    if (result === "sent") stats.deliveriesSent += 1;
    if (result === "retryable") stats.deliveriesRetryable += 1;
    if (result === "permanent") stats.deliveriesPermanent += 1;
  }

  await syncOccurrenceStatuses(db);

  try {
    const habitStats = await processHabitRemindersOnce(db, sender, now);
    stats.habitRemindersDue = habitStats.habitRemindersDue;
    stats.habitRemindersSent = habitStats.habitRemindersSent;
    stats.habitRemindersFailed = habitStats.habitRemindersFailed;
    stats.habitRemindersSkipped = habitStats.habitRemindersSkipped;
  } catch (error) {
    logger.error("scheduler_habits_failed", error);
  }

  return stats;
}
