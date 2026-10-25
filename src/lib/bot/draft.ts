import { z } from "zod";
import { DateTime } from "luxon";
import {
  formatLocalTime,
  localDateParts,
  localTimeParts,
  parseLocalTime,
  parseDateString,
  toDateString,
  zonedWallClockToUtc,
} from "@/lib/time";
import { REMINDER_TEXT_MAX } from "@/lib/validation";

export const DRAFT_STEPS = [
  "type",
  "recurrence",
  "weekdays",
  "monthdays",
  "date",
  "hour",
  "minute",
  "text",
  "recipients",
  "friend",
  "confirm",
  "editmenu",
] as const;

export type DraftStep = (typeof DRAFT_STEPS)[number];

export const draftSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["create", "edit"]),
  reminderId: z.string().nullable().default(null),
  page: z.number().int().min(1).max(500).default(1),
  step: z.enum(DRAFT_STEPS),
  reminderType: z.enum(["ONCE", "RECURRING"]).nullable().default(null),
  recurrenceType: z.enum(["WEEKLY", "MONTHLY"]).nullable().default(null),
  date: z.string().nullable().default(null),
  hour: z.number().int().min(0).max(23).nullable().default(null),
  minute: z.number().int().min(0).max(59).nullable().default(null),
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  monthDays: z.array(z.number().int().min(1).max(31)).default([]),
  monthPage: z.number().int().min(1).max(3).default(1),
  text: z.string().nullable().default(null),
  recipientMode: z.enum(["SELF", "FRIEND"]).default("SELF"),
  friendUserId: z.string().nullable().default(null),
  returnToConfirm: z.boolean().default(false),
  timeZone: z.string().min(1),
  calendarYear: z.number().int().min(2000).max(2100),
  calendarMonth: z.number().int().min(1).max(12),
});

export type ReminderDraft = z.infer<typeof draftSchema>;

type ReminderForDraft = {
  id: string;
  ownerId: string;
  text: string;
  type: "ONCE" | "RECURRING";
  recurrenceType: "WEEKLY" | "MONTHLY" | null;
  scheduledAtUtc: Date | null;
  localTime: string | null;
  timeZone: string;
  recurrenceDays: number[];
  recipients: Array<{ recipientUserId: string }>;
};

function calendarFor(instant: Date, zone: string): { year: number; month: number } {
  const parts = localDateParts(instant, zone);
  return { year: parts.year, month: parts.month };
}

export function newCreateDraft(timeZone: string, now: Date): ReminderDraft {
  const { year, month } = calendarFor(now, timeZone);
  return {
    version: 1,
    kind: "create",
    reminderId: null,
    page: 1,
    step: "type",
    reminderType: null,
    recurrenceType: null,
    date: null,
    hour: null,
    minute: null,
    weekdays: [],
    monthDays: [],
    monthPage: 1,
    text: null,
    recipientMode: "SELF",
    friendUserId: null,
    returnToConfirm: false,
    timeZone,
    calendarYear: year,
    calendarMonth: month,
  };
}

export function draftFromReminder(reminder: ReminderForDraft, page: number): ReminderDraft {
  let date: string | null = null;
  let hour: number | null = null;
  let minute: number | null = null;

  if (reminder.type === "ONCE" && reminder.scheduledAtUtc) {
    const parts = localDateParts(reminder.scheduledAtUtc, reminder.timeZone);
    date = toDateString(parts.year, parts.month, parts.day);
    const time = localTimeParts(reminder.scheduledAtUtc, reminder.timeZone);
    hour = time.hour;
    minute = time.minute;
  }

  if (reminder.type === "RECURRING" && reminder.localTime) {
    const parsed = parseLocalTime(reminder.localTime);
    if (parsed) {
      hour = parsed.hour;
      minute = parsed.minute;
    }
  }

  const friend = reminder.recipients.find((r) => r.recipientUserId !== reminder.ownerId);
  const zone = reminder.timeZone;
  const calendar = date
    ? parseDateString(date)
    : calendarFor(new Date(), zone);

  return {
    version: 1,
    kind: "edit",
    reminderId: reminder.id,
    page,
    step: "editmenu",
    reminderType: reminder.type,
    recurrenceType: reminder.recurrenceType,
    date,
    hour,
    minute,
    weekdays: reminder.recurrenceType === "WEEKLY" ? [...reminder.recurrenceDays] : [],
    monthDays: reminder.recurrenceType === "MONTHLY" ? [...reminder.recurrenceDays] : [],
    monthPage: 1,
    text: reminder.text,
    recipientMode: friend ? "FRIEND" : "SELF",
    friendUserId: friend?.recipientUserId ?? null,
    returnToConfirm: false,
    timeZone: zone,
    calendarYear: calendar?.year ?? DateTime.utc().year,
    calendarMonth: calendar?.month ?? DateTime.utc().month,
  };
}

export type DraftErrorCode =
  | "NO_TYPE"
  | "NO_DAYS"
  | "NO_TEXT"
  | "INVALID_SCHEDULE"
  | "PAST_TIME";

export class DraftError extends Error {
  constructor(public readonly code: DraftErrorCode) {
    super(code);
    this.name = "DraftError";
  }
}

export type ResolvedDraft = {
  text: string;
  type: "ONCE" | "RECURRING";
  recurrenceType: "WEEKLY" | "MONTHLY" | null;
  scheduledAtUtc: Date | null;
  localTime: string | null;
  timeZone: string;
  recurrenceDays: number[];
  friendUserId: string | null;
};

/**
 * Convert a draft into service input. Throws DraftError for user-fixable
 * problems; callers translate the code via the localization module.
 */
export function resolveDraft(draft: ReminderDraft, now: Date): ResolvedDraft {
  const text = (draft.text ?? "").trim();
  if (!text) throw new DraftError("NO_TEXT");
  if (!draft.reminderType) throw new DraftError("NO_TYPE");

  if (draft.reminderType === "ONCE") {
    if (!draft.date || draft.hour === null || draft.minute === null) {
      throw new DraftError("INVALID_SCHEDULE");
    }
    const parts = parseDateString(draft.date);
    if (!parts) throw new DraftError("INVALID_SCHEDULE");
    let scheduledAtUtc: Date;
    try {
      scheduledAtUtc = zonedWallClockToUtc(
        draft.date,
        draft.hour,
        draft.minute,
        draft.timeZone,
      );
    } catch {
      throw new DraftError("INVALID_SCHEDULE");
    }
    if (scheduledAtUtc.getTime() <= now.getTime()) throw new DraftError("PAST_TIME");
    return {
      text,
      type: "ONCE",
      recurrenceType: null,
      scheduledAtUtc,
      localTime: null,
      timeZone: draft.timeZone,
      recurrenceDays: [],
      friendUserId: draft.recipientMode === "FRIEND" ? draft.friendUserId : null,
    };
  }

  if (!draft.recurrenceType) throw new DraftError("NO_TYPE");
  const days =
    draft.recurrenceType === "WEEKLY" ? [...draft.weekdays] : [...draft.monthDays];
  if (days.length === 0) throw new DraftError("NO_DAYS");
  if (draft.hour === null || draft.minute === null) {
    throw new DraftError("INVALID_SCHEDULE");
  }

  return {
    text,
    type: "RECURRING",
    recurrenceType: draft.recurrenceType,
    scheduledAtUtc: null,
    localTime: formatLocalTime(draft.hour, draft.minute),
    timeZone: draft.timeZone,
    recurrenceDays: [...new Set(days)].sort((a, b) => a - b),
    friendUserId: draft.recipientMode === "FRIEND" ? draft.friendUserId : null,
  };
}

export function draftTextTooLong(draft: ReminderDraft): boolean {
  return (draft.text?.length ?? 0) > REMINDER_TEXT_MAX;
}
