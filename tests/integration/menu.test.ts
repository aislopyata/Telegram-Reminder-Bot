import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { cb } from "@/lib/telegram/callbacks";
import { InMemoryTelegramSender } from "@/lib/telegram/api";
import { handleTelegramUpdate } from "@/lib/bot/dispatcher";
import { upsertUser, type UserRecord } from "@/lib/services/users";
import type { TelegramUpdate } from "@/lib/telegram/types";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integration = TEST_DATABASE_URL ? describe : describe.skip;

const TG = 991300001;
const PROFILE = { id: TG, is_bot: false, first_name: "Menu Test", username: "menu_test" };

function callbackUpdate(data: string, messageId = 100): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: `callback-${data}`,
      from: PROFILE,
      message: {
        message_id: messageId,
        chat: { id: TG, type: "private" },
        date: Math.floor(Date.now() / 1000),
      },
      data,
    },
  };
}

async function runUpdate(
  db: Pool,
  sender: InMemoryTelegramSender,
  update: TelegramUpdate,
) {
  const sentBefore = sender.sent.length;
  const editedBefore = sender.edited.length;
  await handleTelegramUpdate(db, update, sender);
  const sent = sender.sent.slice(sentBefore);
  const edited = sender.edited.slice(editedBefore);
  return { sent, edited, last: edited.at(-1) ?? sent.at(-1) ?? null };
}

integration("compact menu integration", () => {
  let db: Pool;
  let user: UserRecord;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required");
    const databaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
    if (!databaseName.includes("test")) {
      throw new Error("TEST_DATABASE_URL must point to a test database");
    }
    db = new Pool({ connectionString: TEST_DATABASE_URL });
    await db.query(`DELETE FROM users WHERE telegram_user_id = $1`, [String(TG)]);
    user = await upsertUser(db, PROFILE);
  });

  beforeEach(async () => {
    await db.query(`DELETE FROM reminders WHERE owner_id = $1`, [user.id]);
    await db.query(`DELETE FROM conversation_states WHERE user_id = $1`, [user.id]);
    await db.query(`DELETE FROM ui_state WHERE user_id = $1`, [user.id]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM users WHERE telegram_user_id = $1`, [String(TG)]);
    await db.end();
  });

  it("keeps the main menu compact and free of moved actions", async () => {
    const sender = new InMemoryTelegramSender();
    const result = await runUpdate(db, sender, callbackUpdate(cb.main()));
    const rows = result.last?.keyboard?.inline_keyboard ?? [];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === 2)).toBe(true);

    const callbacks = rows.flat().map((button) => button.callback_data);
    expect(callbacks).toContain(cb.habitsMenu());
    expect(callbacks).not.toContain(cb.createType());
    expect(callbacks).not.toContain(cb.habitStats());
  });

  it("offers create reminder from an empty reminders list and reuses the create flow", async () => {
    const sender = new InMemoryTelegramSender();

    let result = await runUpdate(db, sender, callbackUpdate(cb.reminders(1)));
    expect(result.last?.text).toContain("У вас пока нет напоминаний");
    const callbacks =
      result.last?.keyboard?.inline_keyboard.flat().map((button) => button.callback_data) ?? [];
    expect(callbacks).toContain(cb.createType());
    expect(result.last?.keyboard?.inline_keyboard[0][0].callback_data).toBe(cb.createType());

    result = await runUpdate(db, sender, callbackUpdate(cb.createType()));
    expect(result.last?.text).toContain("Какое напоминание создать?");
    const createCallbacks =
      result.last?.keyboard?.inline_keyboard.flat().map((button) => button.callback_data) ?? [];
    expect(createCallbacks).toContain(cb.createOnce());
    expect(createCallbacks).toContain(cb.createRecurring());
  });
});
