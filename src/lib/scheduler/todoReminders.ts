import { DateTime } from "luxon";
import type { Db } from "@/lib/db";
import type { TelegramSender } from "@/lib/telegram/types";
import { isValidTimeZone, parseLocalTime } from "@/lib/time";
import { escapeHtml, truncate } from "@/lib/telegram/html";
import { ru } from "@/lib/i18n/ru";
import { logger } from "@/lib/logger";

const TODO_REMINDER_BATCH = 100;
// Telegram accepts 4096 characters; leave headroom for HTML parsing and emoji.
const MESSAGE_LIMIT = 3800;
const DESCRIPTION_PREVIEW = 300;

export type TodoReminderSchedulerStats = {
  todoRemindersDue: number;
  todoRemindersSent: number;
  todoRemindersFailed: number;
  todoRemindersSkipped: number;
};

type DueRow = {
  list_id: string;
  list_name: string;
  reminder_time: string;
  last_notified_date: string | null;
  owner_user_id: string;
  telegram_user_id: string;
  time_zone: string;
};

type ItemRow = {
  title: string;
  description: string | null;
  url: string | null;
  is_completed: boolean;
};

/**
 * Build one or more messages containing the complete list. Telegram has a
 * hard message-size limit, so a long list is split between items. The output
 * is never paginated and carries no inline keyboard.
 */
export function buildTodoReminderMessages(
  listName: string,
  items: Array<{ title: string; description: string | null; url: string | null; isCompleted: boolean }>,
): string[] {
  const lines: string[] = [
    `🔔 Напоминание: ${listName}`,
    `📋 Задач: ${items.length}`,
    "",
  ];

  if (items.length === 0) {
    lines.push(ru.lists.todoEmptyItems);
  } else {
    items.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.isCompleted ? "☑️" : "⬜️"} ${item.title}`);
      if (item.description) {
        lines.push(`   ${truncate(item.description.replace(/\s+/g, " "), DESCRIPTION_PREVIEW)}`);
      }
      if (item.url) lines.push(`   🔗 ${item.url}`);
    });
  }

  const messages: string[] = [];
  let current = "";
  for (const line of lines) {
    const escaped = escapeHtml(line);
    if (current && current.length + 1 + escaped.length > MESSAGE_LIMIT) {
      messages.push(current);
      current = escaped;
    } else {
      current = current ? `${current}\n${escaped}` : escaped;
    }
  }
  if (current) messages.push(current);
  return messages.length > 0 ? messages : [escapeHtml(ru.lists.todoEmptyItems)];
}

/**
 * Sends each enabled ToDo list reminder once per owner-local calendar day.
 *
 * Like habit reminders, the day is claimed with a conditional UPDATE before
 * sending, so overlapping scheduler runs cannot produce duplicates.
 */
export async function processTodoRemindersOnce(
  db: Db,
  sender: TelegramSender,
  now: Date = new Date(),
): Promise<TodoReminderSchedulerStats> {
  const stats: TodoReminderSchedulerStats = {
    todoRemindersDue: 0,
    todoRemindersSent: 0,
    todoRemindersFailed: 0,
    todoRemindersSkipped: 0,
  };

  const result = await db.query<DueRow>(
    `SELECT s.list_id, l.name AS list_name, s.reminder_time::text AS reminder_time,
            s.last_notified_date::text AS last_notified_date,
            l.owner_user_id, u.telegram_user_id, u.time_zone
     FROM todo_list_reminders s
     JOIN todo_lists l ON l.id = s.list_id
     JOIN users u ON u.id = l.owner_user_id
     WHERE s.is_enabled = true AND s.reminder_time IS NOT NULL
     ORDER BY s.list_id
     LIMIT $1`,
    [TODO_REMINDER_BATCH],
  );

  for (const row of result.rows) {
    const zone = isValidTimeZone(row.time_zone) ? row.time_zone : "UTC";
    const local = DateTime.fromJSDate(now, { zone });
    const today = local.toISODate();
    const time = parseLocalTime(row.reminder_time);
    if (!today || !time) {
      stats.todoRemindersSkipped += 1;
      continue;
    }

    if (row.last_notified_date === today) {
      stats.todoRemindersSkipped += 1;
      continue;
    }

    const nowMinutes = local.hour * 60 + local.minute;
    const dueMinutes = time.hour * 60 + time.minute;
    if (nowMinutes < dueMinutes) {
      stats.todoRemindersSkipped += 1;
      continue;
    }

    stats.todoRemindersDue += 1;

    const claimed = await db.query(
      `UPDATE todo_list_reminders
       SET last_notified_date = $2::date
       WHERE list_id = $1
         AND is_enabled = true
         AND (last_notified_date IS NULL OR last_notified_date <> $2::date)
       RETURNING list_id`,
      [row.list_id, today],
    );
    if ((claimed.rowCount ?? 0) === 0) {
      stats.todoRemindersSkipped += 1;
      continue;
    }

    try {
      const items = await db.query<ItemRow>(
        `SELECT title, description, url, is_completed
         FROM todo_items
         WHERE list_id = $1
         ORDER BY created_at ASC, id ASC`,
        [row.list_id],
      );
      const messages = buildTodoReminderMessages(
        row.list_name,
        items.rows.map((item) => ({
          title: item.title,
          description: item.description,
          url: item.url,
          isCompleted: item.is_completed,
        })),
      );
      for (const text of messages) {
        await sender.sendMessage(String(row.telegram_user_id), text);
      }
      stats.todoRemindersSent += 1;
    } catch (error) {
      stats.todoRemindersFailed += 1;
      logger.warn("todo_reminder_send_failed", {
        listId: row.list_id,
        userId: row.owner_user_id,
        error: String(error).slice(0, 200),
      });
    }
  }

  return stats;
}
