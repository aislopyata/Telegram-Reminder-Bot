import type { ReminderDraft } from "@/lib/bot/draft";
import { calendarDays, formatReminderMoment, isValidTimeZone } from "@/lib/time";
import { WEEKDAY_SHORT } from "@/lib/i18n/ru";
import { escapeHtml } from "@/lib/telegram/html";
import type { ReminderWithPeople } from "@/lib/services/reminders";
import { friendRecipient } from "@/lib/services/reminders";
import { ru } from "@/lib/i18n/ru";
import { DateTime } from "luxon";
import type {
  Habit,
  HabitReminderSettings,
  HabitStatistics,
  HabitWithCompletion,
} from "@/lib/services/habits";

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

export function formatHabitDate(date: string): string {
  const parsed = DateTime.fromISO(date, { zone: "UTC" });
  if (!parsed.isValid) return date;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parsed.toJSDate());
}

export function formatHabitWeekRange(start: string, end: string): string {
  const from = DateTime.fromISO(start, { zone: "UTC" }).setLocale("ru");
  const to = DateTime.fromISO(end, { zone: "UTC" }).setLocale("ru");
  if (!from.isValid || !to.isValid) return `${start} — ${end}`;
  if (from.month === to.month && from.year === to.year) {
    return `${from.day}–${to.toFormat("d MMMM")}`;
  }
  return `${from.toFormat("d MMMM")} — ${to.toFormat("d MMMM")}`;
}

export function formatHabitList(
  habits: Habit[],
  settings: HabitReminderSettings,
  zone: string,
): string {
  if (habits.length === 0) return ru.habits.empty;

  const lines: string[] = [ru.habits.menuTitle, ""];
  habits.forEach((habit, index) => {
    lines.push(`${index + 1}. ${escapeHtml(habit.name)}`);
  });
  lines.push("");
  lines.push(
    settings.enabled && settings.reminderTime
      ? ru.habits.reminderLine(settings.reminderTime, escapeHtml(zone))
      : ru.habits.reminderLineOff,
  );
  return lines.join("\n");
}

export function formatHabitDeleteList(habits: Habit[]): string {
  if (habits.length === 0) return ru.habits.deleteEmpty;
  const lines: string[] = [ru.habits.deleteTitle, ""];
  habits.forEach((habit, index) => {
    lines.push(`${index + 1}. ${escapeHtml(habit.name)}`);
  });
  return lines.join("\n");
}

export function formatHabitDeleteConfirmation(name: string): string {
  return ru.habits.deleteConfirm(escapeHtml(name));
}

export function formatHabitTracking(habits: HabitWithCompletion[], date: string): string {
  if (habits.length === 0) return ru.habits.trackingEmpty;
  const lines: string[] = [
    ru.habits.trackingTitle,
    "",
    ru.habits.trackingDate(formatHabitDate(date)),
    "",
  ];
  habits.forEach((habit, index) => {
    lines.push(`${habit.completed ? "☑️" : "⬜️"} ${index + 1}. ${escapeHtml(habit.name)}`);
  });
  return lines.join("\n");
}

export function formatHabitStats(stats: HabitStatistics, view: "week" | "all"): string {
  if (stats.habits.length === 0) return ru.habits.statsEmpty;

  if (view === "week") {
    const lines: string[] = [
      ru.habits.statsWeeklyTitle,
      formatHabitWeekRange(stats.weekStart, stats.weekEnd),
      "",
    ];
    stats.habits.forEach((habit, index) => {
      lines.push(
        `${index + 1}. ${ru.habits.statsWeekLine(
          escapeHtml(habit.name),
          habit.weekCompleted,
          habit.weekEligible,
          habit.weekRate.toFixed(1),
        )}`,
      );
    });
    lines.push("");
    lines.push(ru.habits.statsWeekNote);
    return lines.join("\n");
  }

  const lines: string[] = [ru.habits.statsAllTimeTitle, ""];
  stats.habits.forEach((habit, index) => {
    lines.push(`${index + 1}. <b>${escapeHtml(habit.name)}</b>`);
    lines.push(`   ${ru.habits.statsCreated(formatHabitDate(habit.createdDate))}`);
    lines.push(`   ${ru.habits.statsCompleted(habit.totalCompleted)}`);
    lines.push(`   ${ru.habits.statsPeriod(habit.totalEligible)}`);
    lines.push(`   ${ru.habits.statsRate(habit.totalRate.toFixed(1))}`);
    if (index < stats.habits.length - 1) lines.push("");
  });
  return lines.join("\n");
}

export function formatHabitReminderSettings(
  settings: HabitReminderSettings,
  zone: string,
): string {
  return [
    ru.habits.reminderTitle,
    "",
    ru.habits.reminderCurrent(settings.reminderTime, settings.enabled, escapeHtml(zone)),
  ].join("\n");
}
