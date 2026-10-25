import { DateTime } from "luxon";
import type { Db } from "@/lib/db";
import type { TelegramSender } from "@/lib/telegram/types";
import { isValidTimeZone, parseLocalTime } from "@/lib/time";
import { habitPromptKeyboard } from "@/lib/telegram/ui";
import { ru } from "@/lib/i18n/ru";
import { logger } from "@/lib/logger";

const HABIT_REMINDER_BATCH = 500;

export type HabitSchedulerStats = {
  habitRemindersDue: number;
  habitRemindersSent: number;
  habitRemindersFailed: number;
  habitRemindersSkipped: number;
};

type DueRow = {
  user_id: string;
  reminder_time: string;
  last_notified_date: string | null;
  telegram_user_id: string;
  time_zone: string;
  has_habits: boolean;
};

/**
 * Sends at most one habit prompt per user per local calendar day.
 *
 * Deduplication is entirely database-backed: the conditional UPDATE claims the
 * day before the message is sent. Overlapping scheduler runs and process
 * restarts therefore cannot produce a duplicate; the trade-off is at-most-once
 * delivery if Telegram is unreachable after the claim.
 */
export async function processHabitRemindersOnce(
  db: Db,
  sender: TelegramSender,
  now: Date = new Date(),
): Promise<HabitSchedulerStats> {
  const stats: HabitSchedulerStats = {
    habitRemindersDue: 0,
    habitRemindersSent: 0,
    habitRemindersFailed: 0,
    habitRemindersSkipped: 0,
  };

  const result = await db.query<DueRow>(
    `SELECT s.user_id, s.reminder_time::text AS reminder_time,
            s.last_notified_date::text AS last_notified_date,
            u.telegram_user_id, u.time_zone,
            EXISTS (
              SELECT 1 FROM habits h
              WHERE h.user_id = s.user_id AND h.is_active = true
            ) AS has_habits
     FROM habit_reminder_settings s
     JOIN users u ON u.id = s.user_id
     WHERE s.is_enabled = true AND s.reminder_time IS NOT NULL
     ORDER BY s.user_id
     LIMIT $1`,
    [HABIT_REMINDER_BATCH],
  );

  for (const row of result.rows) {
    const zone = isValidTimeZone(row.time_zone) ? row.time_zone : "UTC";
    const local = DateTime.fromJSDate(now, { zone });
    const today = local.toISODate();
    const time = parseLocalTime(row.reminder_time);
    if (!today || !time) {
      stats.habitRemindersSkipped += 1;
      continue;
    }

    if (row.last_notified_date === today) {
      stats.habitRemindersSkipped += 1;
      continue;
    }

    const nowMinutes = local.hour * 60 + local.minute;
    const dueMinutes = time.hour * 60 + time.minute;
    if (nowMinutes < dueMinutes) {
      stats.habitRemindersSkipped += 1;
      continue;
    }

    if (!row.has_habits) {
      stats.habitRemindersSkipped += 1;
      continue;
    }

    stats.habitRemindersDue += 1;

    const claimed = await db.query(
      `UPDATE habit_reminder_settings
       SET last_notified_date = $2::date
       WHERE user_id = $1
         AND is_enabled = true
         AND (last_notified_date IS NULL OR last_notified_date <> $2::date)
       RETURNING user_id`,
      [row.user_id, today],
    );
    if ((claimed.rowCount ?? 0) === 0) {
      stats.habitRemindersSkipped += 1;
      continue;
    }

    try {
      await sender.sendMessage(String(row.telegram_user_id), ru.habits.dailyPrompt, habitPromptKeyboard());
      stats.habitRemindersSent += 1;
    } catch (error) {
      stats.habitRemindersFailed += 1;
      logger.warn("habit_reminder_send_failed", {
        userId: row.user_id,
        error: String(error).slice(0, 200),
      });
    }
  }

  return stats;
}
