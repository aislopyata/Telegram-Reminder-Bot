import type { Db } from "@/lib/db";
import { isValidTimeZone, parseLocalTime } from "@/lib/time";
import {
  eligibleDays,
  endOfWeek,
  isIsoDate,
  localDateInZone,
  startOfWeek,
  completionRate,
  todayInZone,
} from "@/lib/habits/stats";

export const HABIT_NAME_MAX = 100;

export type Habit = {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  isActive: boolean;
};

export type HabitWithCompletion = Habit & { completed: boolean };

export type HabitReminderSettings = {
  enabled: boolean;
  reminderTime: string | null;
  lastNotifiedDate: string | null;
  updatedAt: Date | null;
};

export type HabitStat = {
  id: string;
  name: string;
  createdDate: string;
  weekCompleted: number;
  weekEligible: number;
  weekRate: number;
  totalCompleted: number;
  totalEligible: number;
  totalRate: number;
};

export type HabitStatistics = {
  zone: string;
  today: string;
  weekStart: string;
  weekEnd: string;
  habits: HabitStat[];
};

export type HabitNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "too_long" };

export type HabitServiceErrorCode = "INVALID_NAME" | "INVALID_TIME" | "NOT_FOUND";

export class HabitServiceError extends Error {
  constructor(public readonly code: HabitServiceErrorCode) {
    super(code);
    this.name = "HabitServiceError";
  }
}

type HabitRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
  is_active: boolean;
};

type StatsRow = {
  id: string;
  name: string;
  created_at: Date;
  week_completed: number;
  total_completed: number;
};

function mapHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    isActive: row.is_active,
  };
}

/**
 * Habit names are plain text. Whitespace is collapsed and trimmed; the length
 * limit is measured in Unicode code points to match PostgreSQL char_length.
 */
export function validateHabitName(raw: string): HabitNameResult {
  const name = String(raw ?? "").replace(/\s+/gu, " ").trim();
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (Array.from(name).length > HABIT_NAME_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, name };
}

function requireHabitName(raw: string): string {
  const result = validateHabitName(raw);
  if (!result.ok) throw new HabitServiceError("INVALID_NAME");
  return result.name;
}

function safeZone(zone: string | null | undefined): string {
  return zone && isValidTimeZone(zone) ? zone : "UTC";
}

export async function listActiveHabits(db: Db, userId: string): Promise<Habit[]> {
  const result = await db.query<HabitRow>(
    `SELECT id, user_id, name, created_at, is_active
     FROM habits
     WHERE user_id = $1 AND is_active = true
     ORDER BY created_at ASC, id ASC`,
    [userId],
  );
  return result.rows.map(mapHabit);
}

export async function getActiveHabitForUser(
  db: Db,
  habitId: string,
  userId: string,
): Promise<Habit | null> {
  const result = await db.query<HabitRow>(
    `SELECT id, user_id, name, created_at, is_active
     FROM habits
     WHERE id = $1 AND user_id = $2 AND is_active = true
     LIMIT 1`,
    [habitId, userId],
  );
  const row = result.rows[0];
  return row ? mapHabit(row) : null;
}

export async function createHabit(db: Db, userId: string, rawName: string): Promise<Habit> {
  const name = requireHabitName(rawName);
  const result = await db.query<HabitRow>(
    `INSERT INTO habits (user_id, name, created_at, is_active)
     VALUES ($1, $2, now(), true)
     RETURNING id, user_id, name, created_at, is_active`,
    [userId, name],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to create habit");
  return mapHabit(row);
}

/** Soft delete keeps completion history for statistics and audits. */
export async function softDeleteHabit(
  db: Db,
  habitId: string,
  userId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE habits
     SET is_active = false
     WHERE id = $1 AND user_id = $2 AND is_active = true`,
    [habitId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listActiveHabitsWithCompletion(
  db: Db,
  userId: string,
  date: string,
): Promise<HabitWithCompletion[]> {
  if (!isIsoDate(date)) throw new Error("Invalid completion date");
  const result = await db.query<HabitRow & { completed: boolean }>(
    `SELECT h.id, h.user_id, h.name, h.created_at, h.is_active,
            (c.habit_id IS NOT NULL) AS completed
     FROM habits h
     LEFT JOIN habit_completions c
       ON c.habit_id = h.id AND c.completion_date = $2::date
     WHERE h.user_id = $1 AND h.is_active = true
     ORDER BY h.created_at ASC, h.id ASC`,
    [userId, date],
  );
  return result.rows.map((row) => ({ ...mapHabit(row), completed: row.completed }));
}

export type SetHabitCompletionResult = "saved" | "not_found";

/**
 * Idempotent set (not blind toggle): the callback carries the desired state, so
 * a redelivered Telegram update cannot flip a completion twice.
 */
export async function setHabitCompletion(
  db: Db,
  userId: string,
  habitId: string,
  date: string,
  completed: boolean,
): Promise<SetHabitCompletionResult> {
  if (!isIsoDate(date)) throw new Error("Invalid completion date");
  const habit = await getActiveHabitForUser(db, habitId, userId);
  if (!habit) return "not_found";

  if (completed) {
    await db.query(
      `INSERT INTO habit_completions (habit_id, completion_date, completed_at)
       VALUES ($1, $2::date, now())
       ON CONFLICT (habit_id, completion_date) DO NOTHING`,
      [habitId, date],
    );
  } else {
    await db.query(
      `DELETE FROM habit_completions
       WHERE habit_id = $1 AND completion_date = $2::date`,
      [habitId, date],
    );
  }
  return "saved";
}

export async function getHabitReminderSettings(
  db: Db,
  userId: string,
): Promise<HabitReminderSettings> {
  const result = await db.query<{
    reminder_time: string | null;
    is_enabled: boolean;
    last_notified_date: string | null;
    updated_at: Date;
  }>(
    `SELECT reminder_time::text AS reminder_time, is_enabled,
            last_notified_date::text AS last_notified_date, updated_at
     FROM habit_reminder_settings
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return { enabled: false, reminderTime: null, lastNotifiedDate: null, updatedAt: null };
  return {
    enabled: row.is_enabled,
    reminderTime: row.reminder_time ? row.reminder_time.slice(0, 5) : null,
    lastNotifiedDate: row.last_notified_date,
    updatedAt: row.updated_at,
  };
}

export async function setHabitReminder(
  db: Db,
  userId: string,
  time: string,
): Promise<HabitReminderSettings> {
  const parsed = parseLocalTime(time);
  if (!parsed) throw new HabitServiceError("INVALID_TIME");
  const normalized = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;

  await db.query(
    `INSERT INTO habit_reminder_settings (user_id, reminder_time, is_enabled, updated_at)
     VALUES ($1, $2::time, true, now())
     ON CONFLICT (user_id) DO UPDATE
       SET reminder_time = EXCLUDED.reminder_time,
           is_enabled = true,
           updated_at = now()`,
    [userId, normalized],
  );
  return getHabitReminderSettings(db, userId);
}

export async function disableHabitReminder(
  db: Db,
  userId: string,
): Promise<HabitReminderSettings> {
  await db.query(
    `INSERT INTO habit_reminder_settings (user_id, reminder_time, is_enabled, updated_at)
     VALUES ($1, NULL, false, now())
     ON CONFLICT (user_id) DO UPDATE
       SET is_enabled = false,
           updated_at = now()`,
    [userId],
  );
  return getHabitReminderSettings(db, userId);
}

/** Active habits plus completion counts for the current week and all time. */
export async function getHabitStatistics(
  db: Db,
  userId: string,
  zone: string | null | undefined,
  now: Date = new Date(),
): Promise<HabitStatistics> {
  const safe = safeZone(zone);
  const today = todayInZone(safe, now);
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);

  const result = await db.query<StatsRow>(
    `SELECT h.id, h.name, h.created_at,
            COUNT(c.id) FILTER (
              WHERE c.completion_date >= GREATEST($2::date, (h.created_at AT TIME ZONE $4)::date)
                AND c.completion_date <= $3::date
            )::int AS week_completed,
            COUNT(c.id) FILTER (
              WHERE c.completion_date >= (h.created_at AT TIME ZONE $4)::date
                AND c.completion_date <= $3::date
            )::int AS total_completed
     FROM habits h
     LEFT JOIN habit_completions c ON c.habit_id = h.id
     WHERE h.user_id = $1 AND h.is_active = true
     GROUP BY h.id
     ORDER BY h.created_at ASC, h.id ASC`,
    [userId, weekStart, today, safe],
  );

  const habits = result.rows.map((row) => {
    const createdDate = localDateInZone(row.created_at, safe);
    const weekEligible = eligibleDays(createdDate, weekStart, today);
    const totalEligible = eligibleDays(createdDate, createdDate, today);
    return {
      id: row.id,
      name: row.name,
      createdDate,
      weekCompleted: Number(row.week_completed),
      weekEligible,
      weekRate: completionRate(Number(row.week_completed), weekEligible),
      totalCompleted: Number(row.total_completed),
      totalEligible,
      totalRate: completionRate(Number(row.total_completed), totalEligible),
    };
  });

  return { zone: safe, today, weekStart, weekEnd, habits };
}
