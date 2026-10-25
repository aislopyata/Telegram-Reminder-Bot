import type { ReminderDraft } from "@/lib/bot/draft";
import { calendarDays, formatReminderMoment, isValidTimeZone } from "@/lib/time";
import { WEEKDAY_SHORT } from "@/lib/i18n/ru";
import { escapeHtml } from "@/lib/telegram/html";
import type { ReminderWithPeople } from "@/lib/services/reminders";
import { friendRecipient } from "@/lib/services/reminders";
import { ru } from "@/lib/i18n/ru";

function recipientLineDraft(draft: ReminderDraft, friendName?: string): string {
  if (draft.recipientMode === "FRIEND") {
    const name = friendName ? escapeHtml(friendName) : "друг";
    return `${ru.fields.recipients} <b>${ru.reminders.recipientFriend(name)}</b>\n`;
  }
  return `${ru.fields.recipients} <b>${ru.reminders.recipientSelf}</b>\n`;
}

function recurrenceLabel(draft: ReminderDraft): string {
  if (draft.reminderType !== "RECURRING" || !draft.recurrenceType) return "";
  return draft.recurrenceType === "WEEKLY" ? "Еженедельно" : "Ежемесячно";
}

function daysLabel(draft: ReminderDraft): string {
  if (draft.reminderType !== "RECURRING" || !draft.recurrenceType) return "";
  if (draft.recurrenceType === "WEEKLY") {
    const labels = draft.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((day) => WEEKDAY_SHORT[day - 1]);
    return labels.join(", ");
  }
  const days = [...draft.monthDays].sort((a, b) => a - b);
  return days.join(", ");
}

export function formatDraftConfirmation(
  draft: ReminderDraft,
  friendName?: string,
): string {
  const zone = isValidTimeZone(draft.timeZone) ? draft.timeZone : "UTC";
  let when = "—";
  if (draft.reminderType === "ONCE" && draft.date && draft.hour !== null && draft.minute !== null) {
    when = `${draft.date} ${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`;
  }
  if (draft.reminderType === "RECURRING" && draft.hour !== null && draft.minute !== null) {
    const recurrence = recurrenceLabel(draft);
    const days = daysLabel(draft);
    when = `${recurrence}, ${days} — ${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`;
  }

  const lines: string[] = [
    ru.create.confirmTitle,
    "",
    `${ru.fields.text} <b>${escapeHtml(draft.text ?? "")}</b>`,
    "",
  ];

  if (draft.reminderType === "ONCE") {
    lines.push(`${ru.fields.date} <b>${escapeHtml(when)}</b>`);
  } else {
    lines.push(`${ru.fields.recurrence} <b>${escapeHtml(when)}</b>`);
    if (draft.recurrenceType === "WEEKLY") {
      lines.push(`${ru.fields.days} <b>${escapeHtml(daysLabel(draft))}</b>`);
    }
    if (draft.recurrenceType === "MONTHLY") {
      lines.push(`${ru.fields.days} <b>${escapeHtml(daysLabel(draft))}</b>`);
    }
  }

  lines.push(`${ru.fields.timeZone} <b>${escapeHtml(zone)}</b>`);
  lines.push(recipientLineDraft(draft, friendName));

  return lines.join("\n");
}

function formatReminderType(reminder: ReminderWithPeople): string {
  if (reminder.type === "ONCE") return ru.reminders.typeOnce;
  if (reminder.recurrenceType === "WEEKLY") return ru.reminders.typeWeekly;
  return ru.reminders.typeMonthly;
}

function formatDays(reminder: ReminderWithPeople): string {
  if (reminder.type !== "RECURRING" || !reminder.recurrenceType) return "—";
  const days = [...reminder.recurrenceDays].sort((a, b) => a - b);
  if (reminder.recurrenceType === "WEEKLY") {
    return days.map((day) => WEEKDAY_SHORT[day - 1]).join(", ");
  }
  return days.join(", ");
}

export function formatReminderSummary(reminder: ReminderWithPeople): string {
  const friend = friendRecipient(reminder);
  const lines: string[] = [
    `${ru.fields.text} <b>${escapeHtml(reminder.text)}</b>`,
    "",
    `${ru.fields.type} <b>${escapeHtml(formatReminderType(reminder))}</b>`,
  ];

  if (reminder.type === "ONCE" && reminder.scheduledAtUtc) {
    lines.push(
      `${ru.fields.date} <b>${escapeHtml(formatReminderMoment(reminder.scheduledAtUtc, reminder.timeZone))}</b>`,
    );
  }

  if (reminder.type === "RECURRING") {
    lines.push(`${ru.fields.days} <b>${escapeHtml(formatDays(reminder))}</b>`);
    if (reminder.localTime && reminder.nextRunAtUtc) {
      lines.push(
        `${ru.fields.nextRun} <b>${escapeHtml(formatReminderMoment(reminder.nextRunAtUtc, reminder.timeZone))} — ${escapeHtml(reminder.localTime)}</b>`,
      );
    }
  } else if (reminder.nextRunAtUtc) {
    lines.push(
      `${ru.fields.nextRun} <b>${escapeHtml(formatReminderMoment(reminder.nextRunAtUtc, reminder.timeZone))}</b>`,
    );
  }

  lines.push(`${ru.fields.timeZone} <b>${escapeHtml(reminder.timeZone)}</b>`);
  if (friend) {
    lines.push(
      `${ru.fields.recipients} <b>${escapeHtml(ru.reminders.recipientFriend(friend.firstName))}</b>`,
    );
  } else {
    lines.push(`${ru.fields.recipients} <b>${ru.reminders.recipientSelf}</b>`);
  }
  lines.push(
    `${ru.fields.status} <b>${reminder.status === "ACTIVE" ? "Включено" : reminder.status === "DISABLED" ? "Отключено" : "Завершено"}</b>`,
  );

  return lines.join("\n");
}

export function formatReminderListLine(reminder: ReminderWithPeople, index: number): string {
  const preview = escapeHtml(reminder.text.replace(/\n/g, " "));
  const short = preview.length > 60 ? `${preview.slice(0, 57)}...` : preview;
  const type =
    reminder.type === "ONCE"
      ? "один раз"
      : reminder.recurrenceType === "WEEKLY"
        ? "еженедельно"
        : "ежемесячно";
  const status =
    reminder.status === "ACTIVE" ? "вкл." : reminder.status === "DISABLED" ? "выкл." : "заверш.";
  return `${index}. ${short} • ${type} • ${status}`;
}

export function monthCells(year: number, month: number): Array<number | null> {
  return calendarDays(year, month);
}
