import { DateTime, IANAZone } from "luxon";

/**
 * Time-zone rules used throughout the app:
 *
 * - All instants are stored as UTC `Date` objects.
 * - Recurring reminders store a local wall-clock time (`HH:mm`) plus an IANA
 *   zone, so weekly/monthly runs follow local time across DST changes.
 * - During the spring-forward gap (a local time that does not exist), Luxon
 *   shifts the candidate forward to the first valid instant on that day.
 * - During the autumn fold (a local time that occurs twice), the earlier
 *   offset is used. Both policies are covered by tests.
 */

export const MINUTE_MS = 60_000;
export const MAX_MONTH_LOOKAHEAD = 24;

export type RecurrenceRule = {
  type: "ONCE" | "RECURRING";
  recurrenceType: "WEEKLY" | "MONTHLY" | null;
  scheduledAtUtc: Date | null;
  localTime: string | null;
  timeZone: string;
  recurrenceDays: number[];
};

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const COMMON_TIME_ZONES = [
  "Europe/Minsk",
  "Europe/Moscow",
  "Europe/Kyiv",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Istanbul",
  "Asia/Almaty",
  "Asia/Tbilisi",
  "Asia/Yerevan",
  "Asia/Dubai",
  "Asia/Tashkent",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "UTC",
] as const;

export function isValidTimeZone(zone: string): boolean {
  return typeof zone === "string" && IANAZone.isValidZone(zone);
}

export function parseLocalTime(value: string): { hour: number; minute: number } | null {
  // Accept both "HH:mm" (user input) and PostgreSQL's "HH:mm:ss[.ffffff]".
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?$/.exec(value);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function formatLocalTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseDateString(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = DateTime.fromObject({ year, month, day }, { zone: "UTC" });
  if (!dt.isValid || dt.year !== year || dt.month !== month || dt.day !== day) return null;
  return { year, month, day };
}

export function formatDateInZone(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toFormat("yyyy-MM-dd");
}

export function localDateParts(instant: Date, zone: string): { year: number; month: number; day: number } {
  const local = DateTime.fromJSDate(instant, { zone });
  return { year: local.year, month: local.month, day: local.day };
}

/**
 * Convert a local wall-clock date/time in an IANA zone to a UTC instant.
 * Luxon handles DST gaps/folds; see the module-level policy comment.
 */
export function zonedWallClockToUtc(
  date: string,
  hour: number,
  minute: number,
  zone: string,
): Date {
  const parts = parseDateString(date);
  if (!parts) throw new Error("Invalid date string");
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Invalid hour");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("Invalid minute");
  if (!isValidTimeZone(zone)) throw new Error("Invalid time zone");

  const local = DateTime.fromObject(
    { year: parts.year, month: parts.month, day: parts.day, hour, minute, second: 0, millisecond: 0 },
    { zone },
  );

  if (!local.isValid) throw new Error("Invalid local date/time");
  return local.toUTC().toJSDate();
}

/** Format an instant in a specific reminder time zone. */
export function formatReminderMoment(instant: Date | null, zone: string): string {
  if (!instant) return "—";
  const dt = DateTime.fromJSDate(instant, { zone });
  return `${dt.toFormat("dd.MM.yyyy HH:mm")} (${zone})`;
}

export function localTimeParts(instant: Date, zone: string): { hour: number; minute: number } {
  const local = DateTime.fromJSDate(instant, { zone });
  return { hour: local.hour, minute: local.minute };
}

export function nextWeeklyOccurrence(
  zone: string,
  weekdays: number[],
  hour: number,
  minute: number,
  after: Date,
): Date {
  const days = [...new Set(weekdays)].filter((day) => day >= 1 && day <= 7);
  if (days.length === 0) throw new Error("Weekly recurrence needs at least one weekday");
  if (!isValidTimeZone(zone)) throw new Error("Invalid time zone");

  const afterMs = after.getTime();
  const localAfter = DateTime.fromJSDate(after, { zone }).plus({ seconds: 1 });

  for (let offset = 0; offset <= 8; offset += 1) {
    const candidate = localAfter
      .startOf("day")
      .plus({ days: offset })
      .set({ hour, minute, second: 0, millisecond: 0 });

    if (!candidate.isValid) continue;
    if (days.includes(candidate.weekday) && candidate.toMillis() > afterMs) {
      return candidate.toUTC().toJSDate();
    }
  }

  throw new Error("Could not calculate the next weekly occurrence");
}

export function nextMonthlyOccurrence(
  zone: string,
  monthDays: number[],
  hour: number,
  minute: number,
  after: Date,
): Date {
  const days = [...new Set(monthDays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)
    .sort((a, b) => a - b);
  if (days.length === 0) throw new Error("Monthly recurrence needs at least one day");
  if (!isValidTimeZone(zone)) throw new Error("Invalid time zone");

  const afterMs = after.getTime();
  const localAfter = DateTime.fromJSDate(after, { zone });
  const monthAnchor = localAfter.startOf("month");

  for (let offset = 0; offset <= MAX_MONTH_LOOKAHEAD; offset += 1) {
    const month = monthAnchor.plus({ months: offset });
    for (const day of days) {
      const candidate = DateTime.fromObject(
        { year: month.year, month: month.month, day, hour, minute, second: 0, millisecond: 0 },
        { zone },
      );

      // Months that are too short for the requested day are skipped entirely.
      if (!candidate.isValid || candidate.day !== day) continue;
      if (candidate.toMillis() > afterMs) return candidate.toUTC().toJSDate();
    }
  }

  throw new Error("Could not calculate the next monthly occurrence");
}

/** Next run strictly after `after`. One-time reminders never recur. */
export function computeNextRun(reminder: RecurrenceRule, after: Date): Date | null {
  if (reminder.type === "ONCE") {
    if (!reminder.scheduledAtUtc) return null;
    return reminder.scheduledAtUtc.getTime() > after.getTime() ? reminder.scheduledAtUtc : null;
  }

  if (!reminder.localTime || !reminder.recurrenceType) return null;
  const time = parseLocalTime(reminder.localTime);
  if (!time) return null;

  if (reminder.recurrenceType === "WEEKLY") {
    return nextWeeklyOccurrence(
      reminder.timeZone,
      reminder.recurrenceDays,
      time.hour,
      time.minute,
      after,
    );
  }

  return nextMonthlyOccurrence(
    reminder.timeZone,
    reminder.recurrenceDays,
    time.hour,
    time.minute,
    after,
  );
}

/** Calendar grid for the date picker, weeks starting on Monday. */
export function calendarDays(year: number, month: number): Array<number | null> {
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone: "UTC" });
  if (!first.isValid) return [];
  const leading = first.weekday - 1;
  const daysInMonth = first.daysInMonth ?? 30;
  const cells: Array<number | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const shifted = DateTime.fromObject({ year, month, day: 1 }, { zone: "UTC" }).plus({
    months: delta,
  });
  return { year: shifted.year, month: shifted.month };
}

export function toDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
