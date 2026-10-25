import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { cb } from "@/lib/telegram/callbacks";
import { InMemoryTelegramSender } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/bot/dispatcher";
import { getWorkflow } from "@/lib/services/workflows";
import { setUserTimezone, upsertUser, type UserRecord } from "@/lib/services/users";
import {
  createHabit,
  disableHabitReminder,
  getActiveHabitForUser,
  getHabitReminderSettings,
  getHabitStatistics,
  listActiveHabits,
  listActiveHabitsWithCompletion,
  setHabitCompletion,
  setHabitReminder,
  softDeleteHabit,
} from "@/lib/services/habits";
import { processHabitRemindersOnce } from "@/lib/scheduler/habits";
import type { TelegramUpdate } from "@/lib/telegram/types";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integration = TEST_DATABASE_URL ? describe : describe.skip;

const TG_A = 991100001;
const TG_B = 991100002;
const TG_C = 991100003;
const TG_IDS = [TG_A, TG_B, TG_C].map(String);
const DATE = "2026-10-25";

function callbackUpdate(tgUserId: number, data: string, messageId = 100): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: `callback-${tgUserId}-${data}`,
      from: { id: tgUserId, is_bot: false, first_name: "Habit Test" },
      message: {
        message_id: messageId,
        chat: { id: tgUserId, type: "private" },
        date: Math.floor(Date.now() / 1000),
      },
      data,
    },
  };
}

function messageUpdate(tgUserId: number, text: string): TelegramUpdate {
  return {
    update_id: 2,
    message: {
      message_id: 200,
      from: { id: tgUserId, is_bot: false, first_name: "Habit Test" },
      chat: { id: tgUserId, type: "private" },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

integration("habit tracker integration", () => {
  let db: Pool;
  let userA: UserRecord;
  let userB: UserRecord;
  let userC: UserRecord;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required");
    const databaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
    if (!databaseName.includes("test")) {
      throw new Error("TEST_DATABASE_URL must point to a test database");
    }

    db = new Pool({ connectionString: TEST_DATABASE_URL });
    await db.query(`DELETE FROM users WHERE telegram_user_id = ANY($1::bigint[])`, [TG_IDS]);
    userA = await upsertUser(db, { id: TG_A, first_name: "Habit A" });
    userB = await upsertUser(db, { id: TG_B, first_name: "Habit B" });
    userC = await upsertUser(db, { id: TG_C, first_name: "Habit C" });
    await db.query(`UPDATE users SET time_zone = 'UTC', timezone_set = true`);
  });

  beforeEach(async () => {
    const ids = [userA.id, userB.id, userC.id];
    await db.query(`DELETE FROM conversation_states WHERE user_id = ANY($1::bigint[])`, [ids]);
    await db.query(`DELETE FROM habits WHERE user_id = ANY($1::bigint[])`, [ids]);
    await db.query(`DELETE FROM habit_reminder_settings WHERE user_id = ANY($1::bigint[])`, [ids]);
    await db.query(
      `UPDATE users SET time_zone = 'UTC', timezone_set = true WHERE id = ANY($1::bigint[])`,
      [ids],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM users WHERE telegram_user_id = ANY($1::bigint[])`, [TG_IDS]);
    await db.end();
  });

  it("creates, lists, validates and soft-deletes habits", async () => {
    const habit = await createHabit(db, userA.id, "  Утренняя   пробежка  ");
    expect(habit.name).toBe("Утренняя пробежка");
    expect(habit.isActive).toBe(true);

    await expect(createHabit(db, userA.id, "   ")).rejects.toMatchObject({
      code: "INVALID_NAME",
    });
    await expect(createHabit(db, userA.id, "x".repeat(101))).rejects.toMatchObject({
      code: "INVALID_NAME",
    });

    const second = await createHabit(db, userA.id, "Чтение");
    await createHabit(db, userB.id, "Чужая привычка");

    const aHabits = await listActiveHabits(db, userA.id);
    expect(aHabits.map((item) => item.name)).toEqual(["Утренняя пробежка", "Чтение"]);
    const bHabits = await listActiveHabits(db, userB.id);
    expect(bHabits).toHaveLength(1);
    expect(bHabits[0].name).toBe("Чужая привычка");

    expect(await softDeleteHabit(db, second.id, userB.id)).toBe(false);
    expect(await getActiveHabitForUser(db, second.id, userA.id)).not.toBeNull();
    expect(await softDeleteHabit(db, second.id, userA.id)).toBe(true);
    expect(await softDeleteHabit(db, second.id, userA.id)).toBe(false);
    expect((await listActiveHabits(db, userA.id)).map((item) => item.name)).toEqual([
      "Утренняя пробежка",
    ]);
  });

  it("marks completions idempotently and scopes them to the owner", async () => {
    const habit = await createHabit(db, userA.id, "Зарядка");

    expect(await setHabitCompletion(db, userA.id, habit.id, DATE, true)).toBe("saved");
    expect(await setHabitCompletion(db, userA.id, habit.id, DATE, true)).toBe("saved");
    const countAfterMark = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = $1`,
      [habit.id],
    );
    expect(countAfterMark.rows[0].count).toBe("1");

    const tracking = await listActiveHabitsWithCompletion(db, userA.id, DATE);
    expect(tracking).toHaveLength(1);
    expect(tracking[0].completed).toBe(true);

    expect(await setHabitCompletion(db, userB.id, habit.id, DATE, true)).toBe("not_found");

    expect(await setHabitCompletion(db, userA.id, habit.id, DATE, false)).toBe("saved");
    expect(await setHabitCompletion(db, userA.id, habit.id, DATE, false)).toBe("saved");
    const countAfterUnmark = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = $1`,
      [habit.id],
    );
    expect(countAfterUnmark.rows[0].count).toBe("0");
  });

  it("soft delete keeps historical completions but hides the habit from tracking", async () => {
    const habit = await createHabit(db, userA.id, "История");
    await setHabitCompletion(db, userA.id, habit.id, DATE, true);
    expect(await softDeleteHabit(db, habit.id, userA.id)).toBe(true);

    const history = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = $1`,
      [habit.id],
    );
    expect(history.rows[0].count).toBe("1");
    expect(await listActiveHabits(db, userA.id)).toHaveLength(0);
    expect(await listActiveHabitsWithCompletion(db, userA.id, DATE)).toHaveLength(0);
  });

  it("computes weekly and all-time statistics from each habit creation date", async () => {
    const a = await createHabit(db, userA.id, "Пробежка");
    const b = await createHabit(db, userA.id, "Чтение");
    const c = await createHabit(db, userA.id, "Медитация");

    await db.query(`UPDATE habits SET created_at = $2 WHERE id = $1`, [
      a.id,
      new Date("2026-10-19T00:00:00.000Z"),
    ]);
    await db.query(`UPDATE habits SET created_at = $2 WHERE id = $1`, [
      b.id,
      new Date("2026-10-22T00:00:00.000Z"),
    ]);
    await db.query(`UPDATE habits SET created_at = $2 WHERE id = $1`, [
      c.id,
      new Date("2026-10-25T00:00:00.000Z"),
    ]);

    const addCompletion = (habitId: string, date: string) =>
      db.query(
        `INSERT INTO habit_completions (habit_id, completion_date) VALUES ($1, $2::date)`,
        [habitId, date],
      );
    await addCompletion(a.id, "2026-10-19");
    await addCompletion(a.id, "2026-10-20");
    await addCompletion(a.id, "2026-10-21");
    await addCompletion(b.id, "2026-10-23");
    await addCompletion(b.id, "2026-10-24");
    // Future completions are ignored by both views.
    await addCompletion(a.id, "2026-10-26");

    const stats = await getHabitStatistics(
      db,
      userA.id,
      "UTC",
      new Date("2026-10-25T12:00:00.000Z"),
    );
    expect(stats.today).toBe("2026-10-25");
    expect(stats.weekStart).toBe("2026-10-19");
    expect(stats.weekEnd).toBe("2026-10-25");
    expect(stats.habits).toHaveLength(3);

    const byName = new Map(stats.habits.map((item) => [item.name, item]));
    expect(byName.get("Пробежка")).toMatchObject({
      weekCompleted: 3,
      weekEligible: 7,
      weekRate: 42.9,
      totalCompleted: 3,
      totalEligible: 7,
      totalRate: 42.9,
    });
    expect(byName.get("Чтение")).toMatchObject({
      weekCompleted: 2,
      weekEligible: 4,
      weekRate: 50,
      totalCompleted: 2,
      totalEligible: 4,
      totalRate: 50,
    });
    expect(byName.get("Медитация")).toMatchObject({
      weekCompleted: 0,
      weekEligible: 1,
      weekRate: 0,
      totalCompleted: 0,
      totalEligible: 1,
      totalRate: 0,
    });

    await softDeleteHabit(db, b.id, userA.id);
    const afterDelete = await getHabitStatistics(
      db,
      userA.id,
      "UTC",
      new Date("2026-10-25T12:00:00.000Z"),
    );
    expect(afterDelete.habits.map((item) => item.name)).toEqual(["Пробежка", "Медитация"]);
  });

  it("sends at most one habit prompt per local day and respects time zones", async () => {
    const a = await createHabit(db, userA.id, "Пробежка");
    await setHabitReminder(db, userA.id, "21:00");
    expect(a).not.toBeNull();

    // B has an enabled reminder but no active habits.
    await setHabitReminder(db, userB.id, "21:00");

    await setUserTimezone(db, userC.id, "Europe/Moscow");
    await createHabit(db, userC.id, "Медитация");
    await setHabitReminder(db, userC.id, "21:00");

    const sender = new InMemoryTelegramSender();

    // 18:05 UTC = 21:05 in Moscow, C is due; A is not due yet.
    let result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T18:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(1);
    expect(sender.sent.map((item) => item.chatId)).toEqual([String(TG_C)]);
    const promptButtons = sender.sent[0].keyboard?.inline_keyboard.flat() ?? [];
    expect(promptButtons.map((item) => item.callback_data)).toEqual([
      cb.habitTrack(),
      cb.habitNotNow(),
    ]);

    // Repeated run for the same local day does not duplicate the prompt.
    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T18:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(0);

    // 21:05 UTC = A's local reminder time.
    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T21:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(1);
    expect(sender.sent.at(-1)?.chatId).toBe(String(TG_A));
    expect(sender.sent.some((item) => item.chatId === String(TG_B))).toBe(false);

    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T21:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(0);

    // Next local day can notify C again.
    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-26T18:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(1);
    expect(sender.sent.at(-1)?.chatId).toBe(String(TG_C));

    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-26T21:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(1);
    expect(sender.sent.at(-1)?.chatId).toBe(String(TG_A));

    await disableHabitReminder(db, userC.id);
    result = await processHabitRemindersOnce(
      db,
      sender,
      new Date("2026-10-27T18:05:00.000Z"),
    );
    expect(result.habitRemindersSent).toBe(0);
  });

  it("handles add, track, done, delete, statistics and reminder callbacks", async () => {
    const first = await createHabit(db, userA.id, "Пробежка");
    const second = await createHabit(db, userA.id, "Чтение");
    const sender = new InMemoryTelegramSender();

    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitTrack()), sender);
    expect(sender.edited.at(-1)?.text).toContain("Пробежка");
    expect(sender.edited.at(-1)?.text).toContain("Чтение");

    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitToggle(first.id, true)), sender);
    let count = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = ANY($1::bigint[])`,
      [[first.id, second.id]],
    );
    expect(count.rows[0].count).toBe("1");

    // Done must not mark the unchecked habit.
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitDone()), sender);
    count = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = ANY($1::bigint[])`,
      [[first.id, second.id]],
    );
    expect(count.rows[0].count).toBe("1");

    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitToggle(second.id, true)), sender);
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitToggle(second.id, false)), sender);
    count = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM habit_completions WHERE habit_id = ANY($1::bigint[])`,
      [[first.id, second.id]],
    );
    expect(count.rows[0].count).toBe("1");

    // Add flow: prompt is persisted as a workflow; plain text becomes a habit.
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitAdd(), 101), sender);
    expect((await getWorkflow(db, userA.id))?.data).toEqual({ kind: "habit_name" });
    await handleTelegramUpdate(db, messageUpdate(TG_A, "  Вечерняя   прогулка  "), sender);
    expect(await getWorkflow(db, userA.id)).toBeNull();
    const afterAdd = await listActiveHabits(db, userA.id);
    expect(afterAdd.map((item) => item.name)).toContain("Вечерняя прогулка");

    // Delete flow soft-deletes after confirmation.
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitDelete(second.id)), sender);
    await handleTelegramUpdate(
      db,
      callbackUpdate(TG_A, cb.habitDeleteConfirm(second.id)),
      sender,
    );
    expect((await listActiveHabits(db, userA.id)).map((item) => item.name)).not.toContain(
      "Чтение",
    );
    expect(await softDeleteHabit(db, second.id, userA.id)).toBe(false);

    // Reminder time flow persists an enabled H:M and can be disabled.
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitReminder()), sender);
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitReminderHour(21)), sender);
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitReminderMinute(21, 5)), sender);
    expect(await getHabitReminderSettings(db, userA.id)).toMatchObject({
      enabled: true,
      reminderTime: "21:05",
    });
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitReminderDisable()), sender);
    expect((await getHabitReminderSettings(db, userA.id)).enabled).toBe(false);

    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitStats()), sender);
    expect(sender.edited.at(-1)?.text).toContain("эта неделя");
    await handleTelegramUpdate(db, callbackUpdate(TG_A, cb.habitStatsAll()), sender);
    expect(sender.edited.at(-1)?.text).toContain("всё время");
  });
});
