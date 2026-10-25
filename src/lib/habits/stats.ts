import { DateTime } from "luxon";
import { isValidTimeZone } from "@/lib/time";

/**
 * Habit statistics work with local calendar dates (`YYYY-MM-DD`) rather than
 * instants. Date-only arithmetic is done in UTC so DST transitions never
 * change the number of calendar days between two local dates.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function safeZone(zone: string): string {
  return isValidTimeZone(zone) ? zone : "UTC";
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = DateTime.fromISO(value, { zone: "UTC" });
  return parsed.isValid && parsed.toISODate() === value;
}

/** Current local calendar date for a user's IANA time zone. */
export function todayInZone(zone: string, now: Date = new Date()): string {
  const local = DateTime.fromJSDate(now, { zone: safeZone(zone) });
  const date = local.toISODate();
  if (!date) throw new Error("Could not determine local date");
  return date;
}

/** Local calendar date of an instant (habit creation timestamps). */
export function localDateInZone(instant: Date, zone: string): string {
  const local = DateTime.fromJSDate(instant, { zone: safeZone(zone) });
  const date = local.toISODate();
  if (!date) throw new Error("Could not determine local date");
  return date;
}

export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new Error("Invalid date");
  const shifted = DateTime.fromISO(date, { zone: "UTC" }).plus({ days });
  const result = shifted.toISODate();
  if (!result) throw new Error("Could not shift date");
  return result;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  if (!isIsoDate(date)) throw new Error("Invalid date");
  const dt = DateTime.fromISO(date, { zone: "UTC" });
  return addDays(date, -(dt.weekday - 1));
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6);
}

export function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Number of calendar days in the inclusive range; 0 when `to` is before `from`. */
export function daysInclusive(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error("Invalid date");
  if (to < from) return 0;
  const start = DateTime.fromISO(from, { zone: "UTC" });
  const end = DateTime.fromISO(to, { zone: "UTC" });
  return Math.floor(end.diff(start, "days").days) + 1;
}

/** Percentage rounded to one decimal place, safe for an empty period. */
export function completionRate(completed: number, eligible: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(eligible) || eligible <= 0) return 0;
  return Math.round((completed / eligible) * 1000) / 10;
}

/** Number of eligible days for a habit inside an inclusive window. */
export function eligibleDays(createdDate: string, windowStart: string, today: string): number {
  if (!isIsoDate(createdDate) || !isIsoDate(windowStart) || !isIsoDate(today)) {
    throw new Error("Invalid date");
  }
  if (today < createdDate) return 0;
  return daysInclusive(maxIsoDate(createdDate, windowStart), today);
}
