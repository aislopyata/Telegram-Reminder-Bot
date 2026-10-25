import type { Db } from "@/lib/db";
import { normalizeTelegramUsername } from "@/lib/validation";

export type TelegramProfile = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type UserRecord = {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string;
  timeZone: string | null;
  timezoneConfirmed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type UserRow = {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string;
  time_zone: string | null;
  timezone_set: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    telegramUserId: row.telegram_user_id,
    telegramUsername: row.telegram_username,
    firstName: row.first_name,
    timeZone: row.time_zone,
    timezoneConfirmed: row.timezone_set,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Register or refresh the profile. Telegram is the source of truth for names. */
export async function upsertUser(db: Db, profile: TelegramProfile): Promise<UserRecord> {
  const telegramUserId = String(profile.id);
  if (!/^\d{1,20}$/.test(telegramUserId)) throw new Error("Invalid Telegram user id");

  const firstName = profile.first_name.trim().slice(0, 128) || "Пользователь";
  const telegramUsername = profile.username ? normalizeTelegramUsername(profile.username) : null;

  const existing = await db.query<UserRow>(
    `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at
     FROM users
     WHERE telegram_user_id = $1`,
    [telegramUserId],
  );

  if (existing.rowCount && existing.rows.length > 0) {
    const row = existing.rows[0];
    const updatedAt = new Date();
    const updated = await db.query<UserRow>(
      `UPDATE users
       SET first_name = $2, telegram_username = $3, updated_at = $4
       WHERE telegram_user_id = $1
       RETURNING id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at`,
      [telegramUserId, firstName, telegramUsername, updatedAt],
    );
    const target = updated.rowCount && updated.rows.length > 0 ? updated.rows[0] : row;
    return mapUser({
      ...target,
      updated_at: updated.rowCount && updated.rows.length > 0 ? updated.rows[0].updated_at : updatedAt,
    });
  }

  const inserted = await db.query<UserRow>(
    `INSERT INTO users (telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at)
     VALUES ($1, $2, $3, 'UTC', false, now(), now())
     RETURNING id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at`,
    [telegramUserId, telegramUsername, firstName],
  );
  const row = inserted.rows[0];
  if (!row) throw new Error("Failed to create user");
  return mapUser(row);
}

export async function setUserTimezone(db: Db, userId: string, timeZone: string): Promise<UserRecord> {
  const result = await db.query<UserRow>(
    `UPDATE users SET time_zone = $2, timezone_set = true, updated_at = now() WHERE id = $1
     RETURNING id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at`,
    [userId, timeZone],
  );
  const row = result.rows[0];
  if (!row) throw new Error("User not found");
  return mapUser(row);
}

export async function findUserByUsername(db: Db, username: string): Promise<UserRecord | null> {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) return null;
  const result = await db.query<UserRow>(
    `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at
     FROM users
     WHERE telegram_username = $1
     LIMIT 1`,
    [normalized],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

export async function findUserByTelegramId(db: Db, telegramUserId: string): Promise<UserRecord | null> {
  const result = await db.query<UserRow>(
    `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, timezone_set, created_at, updated_at
     FROM users
     WHERE telegram_user_id = $1
     LIMIT 1`,
    [telegramUserId],
  );
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}
