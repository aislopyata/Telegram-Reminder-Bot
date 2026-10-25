import type { Db } from "@/lib/db";
import { areFriends } from "./friends";
import { computeNextRun, isValidTimeZone, parseLocalTime } from "@/lib/time";
import { reminderFieldsSchema, type ReminderFields } from "@/lib/validation";

export const REMINDERS_PAGE_SIZE = 5;

export type ReminderServiceErrorCode =
  | "INVALID_INPUT"
  | "PAST_TIME"
  | "FRIEND_NOT_CONFIRMED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_SCHEDULE";

export class ReminderServiceError extends Error {
  constructor(public readonly code: ReminderServiceErrorCode) {
    super(code);
    this.name = "ReminderServiceError";
  }
}

export type ReminderRecipientRef = {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string;
  timeZone: string | null;
};

export type ReminderWithPeople = {
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
  createdAt: Date;
  updatedAt: Date;
  recipients: Array<{
    recipientUserId: string;
    recipient: ReminderRecipientRef | null;
  }>;
};

export type ResolvedReminderInput = {
  text: string;
  type: "ONCE" | "RECURRING";
  recurrenceType: "WEEKLY" | "MONTHLY" | null;
  scheduledAtUtc: Date | null;
  localTime: string | null;
  timeZone: string;
  recurrenceDays: number[];
  friendUserId: string | null;
};

type ReminderRow = {
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
  created_at: Date;
  updated_at: Date;
};

function mapRecipients(
  rows: Array<{ user_id: string; recipient_user_id: string; telegram_user_id: string; telegram_username: string | null; first_name: string; time_zone: string | null }>,
  ownerId: string,
): ReminderWithPeople["recipients"] {
  return rows.map((row) => ({
    recipientUserId: row.recipient_user_id,
    recipient:
      row.recipient_user_id === ownerId
        ? null
        : {
            id: row.user_id,
            telegramUserId: row.telegram_user_id,
            telegramUsername: row.telegram_username,
            firstName: row.first_name,
            timeZone: row.time_zone,
          },
  }));
}

function toReminderWithPeople(row: ReminderRow, recipients: ReminderWithPeople["recipients"]): ReminderWithPeople {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipients,
  };
}

function validateFields(fields: ReminderFields, now: Date): void {
  if (!isValidTimeZone(fields.timeZone)) throw new ReminderServiceError("INVALID_INPUT");
  if (fields.type === "ONCE") {
    if (!fields.scheduledAtUtc) throw new ReminderServiceError("INVALID_SCHEDULE");
    if (fields.scheduledAtUtc.getTime() <= now.getTime()) throw new ReminderServiceError("PAST_TIME");
    if (fields.recurrenceType !== null || fields.recurrenceDays.length > 0) {
      throw new ReminderServiceError("INVALID_INPUT");
    }
    return;
  }
  if (!fields.recurrenceType || !fields.localTime) throw new ReminderServiceError("INVALID_SCHEDULE");
  if (!parseLocalTime(fields.localTime)) throw new ReminderServiceError("INVALID_SCHEDULE");
  if (fields.recurrenceDays.length === 0) throw new ReminderServiceError("INVALID_SCHEDULE");
}

function normalizeInput(raw: ResolvedReminderInput): ReminderFields {
  const parsed = reminderFieldsSchema.safeParse(raw);
  if (!parsed.success) throw new ReminderServiceError("INVALID_INPUT");
  return parsed.data;
}

async function assertFriendEligible(db: Db, ownerId: string, friendUserId: string | null): Promise<void> {
  if (!friendUserId) return;
  if (friendUserId === ownerId) throw new ReminderServiceError("FRIEND_NOT_CONFIRMED");
  if (!(await areFriends(db, ownerId, friendUserId))) {
    throw new ReminderServiceError("FRIEND_NOT_CONFIRMED");
  }
}

async function replaceRecipients(
  db: Db,
  reminderId: string,
  ownerId: string,
  friendUserId: string | null,
): Promise<ReminderWithPeople["recipients"]> {
  await db.query(`DELETE FROM reminder_recipients WHERE reminder_id = $1`, [reminderId]);
  const sharedWith = friendUserId && friendUserId !== ownerId ? friendUserId : null;
  // The owner always receives their own reminder; a shared reminder additionally
  // goes to the confirmed friend.
  await db.query(
    `INSERT INTO reminder_recipients (reminder_id, recipient_user_id)
     VALUES ($1, $2)${sharedWith ? ", ($1, $3)" : ""}`,
    sharedWith ? [reminderId, ownerId, sharedWith] : [reminderId, ownerId],
  );
  const recipientsResult = await db.query<{
    user_id: string;
    recipient_user_id: string;
    telegram_user_id: string;
    telegram_username: string | null;
    first_name: string;
    time_zone: string | null;
  }>(
    `SELECT u.id AS user_id, rr.recipient_user_id, u.telegram_user_id, u.telegram_username, u.first_name, u.time_zone
     FROM reminder_recipients rr
     JOIN users u ON u.id = rr.recipient_user_id
     WHERE rr.reminder_id = $1`,
    [reminderId],
  );
  return mapRecipients(recipientsResult.rows, ownerId);
}

export async function createReminder(
  db: Db,
  ownerId: string,
  input: ResolvedReminderInput,
): Promise<{ id: string; recipients: ReminderWithPeople["recipients"] }> {
  const fields = normalizeInput(input);
  const friendUserId = input.friendUserId;
  validateFields(fields, new Date());
  await assertFriendEligible(db, ownerId, friendUserId);

  const nextRunAtUtc =
    fields.type === "ONCE" && fields.scheduledAtUtc
      ? fields.scheduledAtUtc
      : await computeNextRun(
          {
            type: "RECURRING",
            recurrenceType: fields.recurrenceType,
            scheduledAtUtc: null,
            localTime: fields.localTime,
            timeZone: fields.timeZone,
            recurrenceDays: fields.recurrenceDays,
          },
          new Date(),
        );

  const inserted = await db.query<ReminderRow>(
    `INSERT INTO reminders (owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', now(), now())
     RETURNING id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at`,
    [
      ownerId,
      fields.text,
      fields.type,
      fields.recurrenceType,
      fields.scheduledAtUtc,
      fields.localTime,
      fields.timeZone,
      fields.type === "ONCE" ? null : fields.recurrenceDays,
      nextRunAtUtc,
    ],
  );
  const row = inserted.rows[0];
  if (!row) throw new ReminderServiceError("INVALID_INPUT");
  const recipients = await replaceRecipients(db, row.id, ownerId, friendUserId);
  return { id: row.id, recipients };
}

export async function updateReminder(
  db: Db,
  reminderId: string,
  ownerId: string,
  input: ResolvedReminderInput,
): Promise<{ id: string; recipients: ReminderWithPeople["recipients"] }> {
  const fields = normalizeInput(input);
  const friendUserId = input.friendUserId;
  validateFields(fields, new Date());
  await assertFriendEligible(db, ownerId, friendUserId);

  const nextRunAtUtc =
    fields.type === "ONCE" && fields.scheduledAtUtc
      ? fields.scheduledAtUtc
      : await computeNextRun(
          {
            type: "RECURRING",
            recurrenceType: fields.recurrenceType,
            scheduledAtUtc: null,
            localTime: fields.localTime,
            timeZone: fields.timeZone,
            recurrenceDays: fields.recurrenceDays,
          },
          new Date(),
        );

  const updated = await db.query<ReminderRow>(
    `UPDATE reminders
     SET text = $2, type = $3, recurrence_type = $4, scheduled_at = $5, local_time = $6, time_zone = $7, recurrence_days = $8, next_run_at = $9, updated_at = now()
     WHERE id = $10 AND owner_id = $11
     RETURNING id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at`,
    [
      fields.text,
      fields.type,
      fields.recurrenceType,
      fields.scheduledAtUtc,
      fields.localTime,
      fields.timeZone,
      fields.type === "ONCE" ? null : fields.recurrenceDays,
      nextRunAtUtc,
      reminderId,
      ownerId,
    ],
  );
  const row = updated.rows[0];
  if (!row) throw new ReminderServiceError("NOT_FOUND");
  const recipients = await replaceRecipients(db, row.id, ownerId, friendUserId);
  return { id: row.id, recipients };
}

export async function setReminderEnabled(
  db: Db,
  reminderId: string,
  ownerId: string,
  enabled: boolean,
): Promise<{ id: string; status: string } | null> {
  const current = await db.query<ReminderRow>(
    `SELECT id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at
     FROM reminders
     WHERE id = $1 AND owner_id = $2
     LIMIT 1`,
    [reminderId, ownerId],
  );
  const row = current.rows[0];
  if (!row) return null;

  const status = enabled ? "ACTIVE" : "DISABLED";
  let nextRunAtUtc = row.next_run_at;
  if (enabled) {
    if (row.type === "ONCE") {
      nextRunAtUtc = row.scheduled_at;
    } else if (row.type === "RECURRING") {
      nextRunAtUtc = await computeNextRun(
        {
          type: "RECURRING",
          recurrenceType: row.recurrence_type === "WEEKLY" || row.recurrence_type === "MONTHLY" ? row.recurrence_type : "WEEKLY",
          scheduledAtUtc: null,
          localTime: row.local_time,
          timeZone: row.time_zone,
          recurrenceDays: row.recurrence_days ?? [],
        },
        new Date(),
      );
    }
  }

  const updated = await db.query<ReminderRow>(
    `UPDATE reminders
     SET status = $1, next_run_at = $2, updated_at = now()
     WHERE id = $3 AND owner_id = $4
     RETURNING id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at`,
    [status, nextRunAtUtc, reminderId, ownerId],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) return null;
  return { id: updatedRow.id, status: updatedRow.status };
}

export async function deleteReminder(db: Db, reminderId: string, ownerId: string): Promise<void> {
  await db.query(`DELETE FROM reminders WHERE id = $1 AND owner_id = $2`, [reminderId, ownerId]);
}

export async function listReminders(
  db: Db,
  userId: string,
  page: number,
): Promise<{ items: ReminderWithPeople[]; page: number; total: number; totalPages: number }> {
  const pageSize = REMINDERS_PAGE_SIZE;

  // Completed one-time reminders are history: the scheduler has already
  // delivered them, so they no longer belong in the active list.
  const countResult = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM reminders
     WHERE owner_id = $1 AND status <> 'COMPLETED'`,
    [userId],
  );
  const total = Number(countResult.rows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;

  const result = await db.query<ReminderRow>(
    `SELECT id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at
     FROM reminders
     WHERE owner_id = $1 AND status <> 'COMPLETED'
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, pageSize, offset],
  );

  const items: ReminderWithPeople[] = result.rows.map((row) =>
    toReminderWithPeople(row, []),
  );

  return { items, page: safePage, total, totalPages };
}

export async function getReminderForOwner(
  db: Db,
  reminderId: string,
  ownerId: string,
): Promise<ReminderWithPeople | null> {
  const result = await db.query<ReminderRow>(
    `SELECT id, owner_id, text, type, recurrence_type, scheduled_at, local_time, time_zone, recurrence_days, next_run_at, status, created_at, updated_at
     FROM reminders
     WHERE id = $1 AND owner_id = $2
     LIMIT 1`,
    [reminderId, ownerId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const recipientsResult = await db.query<{
    user_id: string;
    recipient_user_id: string;
    telegram_user_id: string;
    telegram_username: string | null;
    first_name: string;
    time_zone: string | null;
  }>(
    `SELECT u.id AS user_id, rr.recipient_user_id, u.telegram_user_id, u.telegram_username, u.first_name, u.time_zone
     FROM reminder_recipients rr
     JOIN users u ON u.id = rr.recipient_user_id
     WHERE rr.reminder_id = $1`,
    [reminderId],
  );

  return toReminderWithPeople(row, mapRecipients(recipientsResult.rows, ownerId));
}

export function friendRecipient(reminder: ReminderWithPeople): ReminderRecipientRef | null {
  const friendRow = reminder.recipients.find((item) => item.recipientUserId !== reminder.ownerId);
  const friend = friendRow?.recipient;
  if (!friend) return null;
  return friend;
}
