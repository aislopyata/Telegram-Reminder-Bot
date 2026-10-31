import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { cb } from "@/lib/telegram/callbacks";
import { InMemoryTelegramSender } from "@/lib/telegram/api";
import type { EditResult, InlineKeyboard } from "@/lib/telegram/types";
import { handleTelegramUpdate } from "@/lib/bot/dispatcher";
import { orderedPair, removeFriend } from "@/lib/services/friends";
import { setUserTimezone, upsertUser, type UserRecord } from "@/lib/services/users";
import {
  ListServiceError,
  addTodoItem,
  addTodoItems,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  disableTodoListReminder,
  ensureDefaultTodoList,
  getTodoItemForUser,
  getTodoListForUser,
  getTodoListReminderSettings,
  listTodoItems,
  listTodoListsForUser,
  listTodoShares,
  renameTodoList,
  setTodoItemCompleted,
  setTodoListReminder,
  shareTodoList,
  unshareTodoList,
  updateTodoItem,
} from "@/lib/services/todoLists";
import { processTodoRemindersOnce } from "@/lib/scheduler/todoReminders";
import {
  WishListServiceError,
  addWishItem,
  addWishItems,
  createWishList,
  deleteWishItem,
  deleteWishList,
  ensureDefaultWishList,
  getWishListForUser,
  listWishItems,
  listWishListsForUser,
  listWishShares,
  renameWishList,
  shareWishList,
  unshareWishList,
  updateWishItem,
} from "@/lib/services/wishLists";
import type { TelegramUpdate } from "@/lib/telegram/types";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const integration = TEST_DATABASE_URL ? describe : describe.skip;

const TG_A = 991200001;
const TG_B = 991200002;
const TG_C = 991200003;
const TG_IDS = [TG_A, TG_B, TG_C].map(String);
const PROFILE_A = { id: TG_A, is_bot: false, first_name: "Списки A", username: "lists_a" };
const PROFILE_B = { id: TG_B, is_bot: false, first_name: "Списки B", username: "lists_b" };
const PROFILE_C = { id: TG_C, is_bot: false, first_name: "Списки C", username: "lists_c" };

function callbackUpdate(tgUserId: number, data: string, messageId = 100): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: `callback-${tgUserId}-${data}`,
      from: tgUserId === TG_A ? PROFILE_A : tgUserId === TG_B ? PROFILE_B : PROFILE_C,
      message: {
        message_id: messageId,
        chat: { id: tgUserId, type: "private" },
        date: Math.floor(Date.now() / 1000),
      },
      data,
    },
  };
}

function messageUpdate(tgUserId: number, text: string, messageId = 200): TelegramUpdate {
  return {
    update_id: 2,
    message: {
      message_id: messageId,
      from: tgUserId === TG_A ? PROFILE_A : tgUserId === TG_B ? PROFILE_B : PROFILE_C,
      chat: { id: tgUserId, type: "private" },
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

type SentScreen = { chatId: string; text: string; keyboard?: InlineKeyboard };

/** Collect only the messages produced by one update (send or in-place edit). */
async function runUpdate(
  db: Pool,
  sender: InMemoryTelegramSender,
  update: TelegramUpdate,
): Promise<{ sent: SentScreen[]; edited: Array<SentScreen & { messageId: number }>; last: SentScreen | null }> {
  const sentBefore = sender.sent.length;
  const editedBefore = sender.edited.length;
  await handleTelegramUpdate(db, update, sender);
  const sent = sender.sent.slice(sentBefore);
  const edited = sender.edited.slice(editedBefore);
  return { sent, edited, last: edited.at(-1) ?? sent.at(-1) ?? null };
}

class FlakySender extends InMemoryTelegramSender {
  readonly failEditIds = new Set<number>();

  override async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult> {
    if (this.failEditIds.has(messageId)) {
      throw new Error("Bad Request: message to edit not found");
    }
    this.edited.push({ chatId, messageId, text, keyboard });
    return "edited";
  }
}

integration("todo and wish list integration", () => {
  let db: Pool;
  let userA: UserRecord;
  let userB: UserRecord;
  let userC: UserRecord;

  async function befriend(a: string, b: string): Promise<void> {
    const [first, second] = orderedPair(a, b);
    await db.query(
      `INSERT INTO friendships (user_a_id, user_b_id, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
      [first, second],
    );
  }

  async function uiMessageId(userId: string, chatId: string): Promise<string | null> {
    const result = await db.query<{ message_id: string | null }>(
      `SELECT message_id FROM ui_state WHERE user_id = $1 AND chat_id = $2`,
      [userId, chatId],
    );
    return result.rows[0]?.message_id ?? null;
  }

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required");
    const databaseName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, "");
    if (!databaseName.includes("test")) {
      throw new Error("TEST_DATABASE_URL must point to a test database");
    }

    db = new Pool({ connectionString: TEST_DATABASE_URL });
    await db.query(`DELETE FROM users WHERE telegram_user_id = ANY($1::bigint[])`, [TG_IDS]);
    userA = await upsertUser(db, PROFILE_A);
    userB = await upsertUser(db, PROFILE_B);
    userC = await upsertUser(db, PROFILE_C);
  });

  beforeEach(async () => {
    const ids = [userA.id, userB.id, userC.id];
    await db.query(`DELETE FROM conversation_states WHERE user_id = ANY($1::bigint[])`, [ids]);
    await db.query(`DELETE FROM ui_state WHERE user_id = ANY($1::bigint[])`, [ids]);
    await db.query(`DELETE FROM todo_lists WHERE owner_user_id = ANY($1::bigint[])`, [ids]);
    await db.query(`DELETE FROM wish_lists WHERE owner_user_id = ANY($1::bigint[])`, [ids]);
    await db.query(
      `DELETE FROM friendships WHERE user_a_id = ANY($1::bigint[]) OR user_b_id = ANY($1::bigint[])`,
      [ids],
    );
    await db.query(
      `DELETE FROM friend_requests WHERE requester_id = ANY($1::bigint[]) OR recipient_id = ANY($1::bigint[])`,
      [ids],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM users WHERE telegram_user_id = ANY($1::bigint[])`, [TG_IDS]);
    await db.end();
  });

  it("creates personal default lists lazily and lists them before shared ones", async () => {
    await expect(ensureDefaultTodoList(db, userA.id)).resolves.toMatchObject({
      name: "Мои задачи",
      isDefault: true,
      role: "OWNER",
    });
    const todoDefault = await ensureDefaultTodoList(db, userA.id);
    expect((await listTodoListsForUser(db, userA.id)).own).toHaveLength(1);

    await expect(ensureDefaultWishList(db, userA.id)).resolves.toMatchObject({
      name: "Мои желания",
      isDefault: true,
      role: "OWNER",
    });
    expect((await listWishListsForUser(db, userA.id)).own).toHaveLength(1);

    const work = await createTodoList(db, userA.id, "  Работа   и дом ");
    expect(work.name).toBe("Работа и дом");
    await expect(createTodoList(db, userA.id, "   ")).rejects.toMatchObject({
      code: "INVALID_NAME",
    });

    const ownTodo = await listTodoListsForUser(db, userA.id);
    expect(ownTodo.own.map((list) => list.name)).toEqual(["Мои задачи", "Работа и дом"]);
    expect(ownTodo.shared).toEqual([]);

    expect(await deleteTodoList(db, todoDefault.id, userA.id)).toBe("default");
    const wishDefault = await ensureDefaultWishList(db, userA.id);
    expect(await deleteWishList(db, wishDefault.id, userA.id)).toBe("default");
    expect(await deleteTodoList(db, work.id, userA.id)).toBe("deleted");
  });

  it("enforces ToDo READ/EDIT permissions and owner-only management", async () => {
    const list = await ensureDefaultTodoList(db, userA.id);
    const item = await addTodoItem(db, list.id, userA.id, {
      title: "  Купить   молоко ",
      description: " 2 литра ",
      url: "https://example.com/milk?a=1&b=2",
    });
    expect(item).toMatchObject({
      title: "Купить молоко",
      description: "2 литра",
      url: "https://example.com/milk?a=1&b=2",
      isCompleted: false,
    });
    await expect(
      addTodoItem(db, list.id, userA.id, { title: "Bad", url: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });

    // Not shared yet, and not a friend either.
    expect(await getTodoListForUser(db, list.id, userB.id)).toBeNull();
    await expect(addTodoItem(db, list.id, userB.id, { title: "Чужое" })).rejects.toBeInstanceOf(
      ListServiceError,
    );
    expect(await shareTodoList(db, list.id, userA.id, userC.id, "READ")).toBe("not_friend");

    await befriend(userA.id, userB.id);
    expect(await shareTodoList(db, list.id, userA.id, userB.id, "READ")).toBe("shared");

    const bLists = await listTodoListsForUser(db, userB.id);
    expect(bLists.own.map((entry) => entry.name)).toEqual(["Мои задачи"]);
    expect(bLists.shared).toEqual([expect.objectContaining({ id: list.id, role: "READ" })]);

    const visible = await listTodoItems(db, list.id, userB.id);
    expect(visible?.items.map((entry) => entry.title)).toEqual(["Купить молоко"]);
    expect((await getTodoItemForUser(db, list.id, item.id, userB.id))?.list.role).toBe("READ");

    await expect(addTodoItem(db, list.id, userB.id, { title: "Нельзя" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      updateTodoItem(db, list.id, item.id, userB.id, { title: "Нельзя" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setTodoItemCompleted(db, list.id, item.id, userB.id, true),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTodoItem(db, list.id, item.id, userB.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(renameTodoList(db, list.id, userB.id, "Чужое имя")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await deleteTodoList(db, list.id, userB.id)).toBe("not_found");
    await expect(listTodoShares(db, list.id, userB.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // READ can be upgraded to EDIT, which allows item changes but not sharing.
    expect(await shareTodoList(db, list.id, userA.id, userB.id, "EDIT")).toBe("shared");
    const editedItem = await updateTodoItem(db, list.id, item.id, userB.id, {
      title: "Купить молоко и хлеб",
      description: null,
      url: null,
    });
    expect(editedItem).toMatchObject({
      title: "Купить молоко и хлеб",
      description: null,
      url: null,
    });
    expect((await setTodoItemCompleted(db, list.id, item.id, userB.id, true)).isCompleted).toBe(
      true,
    );
    const bItem = await addTodoItem(db, list.id, userB.id, { title: "Добавлено другом" });
    await deleteTodoItem(db, list.id, bItem.id, userB.id);
    expect(await shareTodoList(db, list.id, userB.id, userC.id, "READ")).toBe("not_found");

    expect((await listTodoShares(db, list.id, userA.id)).map((share) => share.permission)).toEqual([
      "EDIT",
    ]);

    expect(await unshareTodoList(db, list.id, userA.id, userB.id)).toBe(true);
    expect(await getTodoListForUser(db, list.id, userB.id)).toBeNull();
  });

  it("keeps wish lists read-only for everyone except the owner", async () => {
    await ensureDefaultWishList(db, userA.id);
    const list = await createWishList(db, userA.id, "Подарки");
    const item = await addWishItem(db, list.id, userA.id, {
      title: "Наушники <pro>",
      description: "Беспроводные",
      url: "https://shop.example/item?a=1&b=2",
    });
    await expect(
      addWishItem(db, list.id, userA.id, { title: "Bad", url: "data:text/html,x" }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });

    await befriend(userA.id, userB.id);
    expect(await shareWishList(db, list.id, userA.id, userC.id)).toBe("not_friend");
    expect(await shareWishList(db, list.id, userA.id, userB.id)).toBe("shared");

    const bLists = await listWishListsForUser(db, userB.id);
    expect(bLists.own.map((entry) => entry.name)).toEqual(["Мои желания"]);
    expect(bLists.shared).toEqual([expect.objectContaining({ id: list.id, role: "READ" })]);
    expect((await listWishItems(db, list.id, userB.id))?.items[0].title).toBe("Наушники <pro>");

    await expect(
      addWishItem(db, list.id, userB.id, { title: "Нельзя" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateWishItem(db, list.id, item.id, userB.id, { title: "Нельзя" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteWishItem(db, list.id, item.id, userB.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(renameWishList(db, list.id, userB.id, "Чужое имя")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await deleteWishList(db, list.id, userB.id)).toBe("not_found");
    await expect(shareWishList(db, list.id, userB.id, userC.id)).resolves.toBe("not_found");
    await expect(listWishShares(db, list.id, userB.id)).rejects.toBeInstanceOf(
      WishListServiceError,
    );

    const updated = await updateWishItem(db, list.id, item.id, userA.id, {
      title: "Наушники Pro",
      url: null,
    });
    expect(updated).toMatchObject({ title: "Наушники Pro", url: null });
    expect((await listWishShares(db, list.id, userA.id)).map((share) => share.userId)).toEqual([
      userB.id,
    ]);

    expect(await unshareWishList(db, list.id, userA.id, userB.id)).toBe(true);
    expect(await getWishListForUser(db, list.id, userB.id)).toBeNull();
  });

  it("bulk-inserts list items atomically and enforces permissions", async () => {
    const todo = await ensureDefaultTodoList(db, userA.id);
    const created = await addTodoItems(db, todo.id, userA.id, [
      { title: "  Первая  ", url: "https://example.com/a" },
      { title: "Вторая" },
    ]);
    expect(created.map((item) => item.title)).toEqual(["Первая", "Вторая"]);
    expect(created[0].url).toBe("https://example.com/a");
    expect((await listTodoItems(db, todo.id, userA.id))?.items.map((item) => item.title)).toEqual([
      "Первая",
      "Вторая",
    ]);

    // A failure on the second item rolls the first insert back.
    await expect(
      addTodoItems(db, todo.id, userA.id, [
        { title: "Третья" },
        { title: "x".repeat(201) },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_TITLE" });
    expect((await listTodoItems(db, todo.id, userA.id))?.items.map((item) => item.title)).toEqual([
      "Первая",
      "Вторая",
    ]);

    await befriend(userA.id, userB.id);
    await shareTodoList(db, todo.id, userA.id, userB.id, "READ");
    await expect(
      addTodoItems(db, todo.id, userB.id, [{ title: "Нельзя" }]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await shareTodoList(db, todo.id, userA.id, userB.id, "EDIT");
    const addedByFriend = await addTodoItems(db, todo.id, userB.id, [{ title: "Добавлено другом" }]);
    expect(addedByFriend.map((item) => item.title)).toEqual(["Добавлено другом"]);

    const wish = await createWishList(db, userA.id, "Подарки");
    const wishItems = await addWishItems(db, wish.id, userA.id, [
      { title: "Наушники", url: "https://shop.example/item" },
      { title: "Книга" },
    ]);
    expect(wishItems.map((item) => item.title)).toEqual(["Наушники", "Книга"]);
    expect(wishItems[0].url).toBe("https://shop.example/item");

    expect(await shareWishList(db, wish.id, userA.id, userB.id)).toBe("shared");
    await expect(
      addWishItems(db, wish.id, userB.id, [{ title: "Нельзя" }]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("revokes shared list access in both directions when a friendship is removed", async () => {
    await befriend(userA.id, userB.id);
    const aTodo = await createTodoList(db, userA.id, "Задачи A");
    const bTodo = await createTodoList(db, userB.id, "Задачи B");
    const aWish = await createWishList(db, userA.id, "Желания A");
    const bWish = await createWishList(db, userB.id, "Желания B");

    expect(await shareTodoList(db, aTodo.id, userA.id, userB.id, "EDIT")).toBe("shared");
    expect(await shareTodoList(db, bTodo.id, userB.id, userA.id, "READ")).toBe("shared");
    expect(await shareWishList(db, aWish.id, userA.id, userB.id)).toBe("shared");
    expect(await shareWishList(db, bWish.id, userB.id, userA.id)).toBe("shared");

    const removed = await removeFriend(db, userA.id, userB.id);
    expect(removed.status).toBe("removed");

    const todoShares = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM todo_list_shares WHERE list_id = ANY($1::bigint[])`,
      [[aTodo.id, bTodo.id]],
    );
    const wishShares = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM wish_list_shares WHERE list_id = ANY($1::bigint[])`,
      [[aWish.id, bWish.id]],
    );
    expect(todoShares.rows[0].count).toBe("0");
    expect(wishShares.rows[0].count).toBe("0");

    expect(await getTodoListForUser(db, aTodo.id, userB.id)).toBeNull();
    expect(await getTodoListForUser(db, bTodo.id, userA.id)).toBeNull();
    expect(await getWishListForUser(db, aWish.id, userB.id)).toBeNull();
    expect(await getWishListForUser(db, bWish.id, userA.id)).toBeNull();
    expect((await removeFriend(db, userA.id, userB.id)).status).toBe("not_friends");
  });

  it("edits one persisted primary message and replaces it when it becomes stale", async () => {
    const sender = new FlakySender();

    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoMenu()));
    expect(result.sent).toHaveLength(1);
    expect(result.sent[0]).toMatchObject({ chatId: String(TG_A) });
    expect(result.sent[0].text).toContain("Мои задачи");
    expect(await uiMessageId(userA.id, String(TG_A))).toBe("1");

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishMenu()));
    expect(result.sent).toHaveLength(0);
    expect(result.edited).toHaveLength(1);
    expect(result.edited[0]).toMatchObject({ chatId: String(TG_A), messageId: 1 });
    expect(result.edited[0].text).toContain("Мои желания");
    expect(await uiMessageId(userA.id, String(TG_A))).toBe("1");

    // Telegram reports the message as deleted/too old to edit.
    sender.failEditIds.add(1);
    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoMenu()));
    expect(result.sent).toHaveLength(1);
    expect(result.edited).toHaveLength(0);
    expect(await uiMessageId(userA.id, String(TG_A))).toBe("2");

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishMenu()));
    expect(result.sent).toHaveLength(0);
    expect(result.edited.at(-1)?.messageId).toBe(2);
    expect(sender.sent).toHaveLength(2);
  });

  it("opens the multiline add flow by default and supports edit, complete and delete", async () => {
    const sender = new InMemoryTelegramSender();
    const list = await ensureDefaultTodoList(db, userA.id);

    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoAdd(list.id)));
    expect(result.last?.text).toContain("по одной на строку");

    const item = await addTodoItem(db, list.id, userA.id, {
      title: "Купить <молоко> & хлеб",
      description: "2 литра",
      url: "https://example.com/milk?a=1&b=2",
    });

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoToggle(list.id, item.id)));
    expect(result.last?.text).toContain("☑️ Выполнено");

    result = await runUpdate(
      db,
      sender,
      callbackUpdate(TG_A, cb.todoEditField(list.id, item.id, "t")),
    );
    expect(result.last?.text).toContain("Новое название");
    result = await runUpdate(db, sender, messageUpdate(TG_A, "Купить молоко"));
    expect(result.last?.text).toContain("<b>Купить молоко</b>");

    result = await runUpdate(
      db,
      sender,
      callbackUpdate(TG_A, cb.todoDeleteItemConfirm(list.id, item.id)),
    );
    expect(result.last?.text).toContain("В этом списке пока нет задач");
    expect((await listTodoItems(db, list.id, userA.id))?.items).toEqual([]);
  });

  it("bulk-adds ToDo items from a pasted multiline message", async () => {
    const sender = new InMemoryTelegramSender();
    const list = await ensureDefaultTodoList(db, userA.id);

    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoAdd(list.id)));
    expect(result.last?.text).toContain("по одной на строку");

    result = await runUpdate(
      db,
      sender,
      messageUpdate(
        TG_A,
        [
          "",
          "1. Buy a keyboard",
          "2) Get running shoes - https://example.com/shoes",
          "- Read a book about AI",
          "* Exercise daily",
          "[x] Learn TypeScript",
          "",
        ].join("\n"),
      ),
    );

    expect(result.last?.text).toContain("Добавлено задач: 5");
    expect(result.last?.text).toContain("Buy a keyboard");
    expect(result.last?.text).toContain(
      '<a href="https://example.com/shoes">https://example.com/shoes</a>',
    );

    const items = (await listTodoItems(db, list.id, userA.id))?.items ?? [];
    expect(items.map((item) => item.title)).toEqual([
      "Buy a keyboard",
      "Get running shoes",
      "Read a book about AI",
      "Exercise daily",
      "Learn TypeScript",
    ]);
    expect(items[1].url).toBe("https://example.com/shoes");
    const state = await db.query(`SELECT 1 FROM conversation_states WHERE user_id = $1`, [
      userA.id,
    ]);
    expect(state.rowCount).toBe(0);
  });

  it("bulk-adds Wish List items from a pasted multiline message", async () => {
    const sender = new InMemoryTelegramSender();
    const wish = await createWishList(db, userA.id, "Подарки");

    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishAdd(wish.id)));
    expect(result.last?.text).toContain("по одному на строку");

    result = await runUpdate(
      db,
      sender,
      messageUpdate(
        TG_A,
        ["1. Наушники", "- Книга - https://shop.example/book", "", "• Кофемолка"].join("\n"),
      ),
    );

    expect(result.last?.text).toContain("Добавлено желаний: 3");
    expect(result.last?.text).toContain(
      '<a href="https://shop.example/book">https://shop.example/book</a>',
    );

    const items = (await listWishItems(db, wish.id, userA.id))?.items ?? [];
    expect(items.map((item) => item.title)).toEqual(["Наушники", "Книга", "Кофемолка"]);
    expect(items[1].url).toBe("https://shop.example/book");
  });

  it("shows the first new items after a bulk add larger than one page", async () => {
    const sender = new InMemoryTelegramSender();
    const wish = await createWishList(db, userA.id, "Подарки");

    await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishAdd(wish.id)));
    const text = Array.from({ length: 11 }, (_, index) => `Подарок ${index + 1}`).join("\n");
    const result = await runUpdate(db, sender, messageUpdate(TG_A, text));

    expect(result.last?.text).toContain("Добавлено желаний: 11");
    expect(result.last?.text).toContain("Подарок 1");
    expect(result.last?.text).not.toContain("Подарок 11");

    const items = (await listWishItems(db, wish.id, userA.id))?.items ?? [];
    expect(items).toHaveLength(11);
    expect(items[10].title).toBe("Подарок 11");
  });

  it("enforces permissions and reports invalid bulk lines without losing valid ones", async () => {
    const sender = new InMemoryTelegramSender();
    const todo = await ensureDefaultTodoList(db, userA.id);
    const wish = await createWishList(db, userA.id, "Подарки");
    await befriend(userA.id, userB.id);
    await shareTodoList(db, todo.id, userA.id, userB.id, "READ");
    await shareWishList(db, wish.id, userA.id, userB.id);

    let result = await runUpdate(db, sender, callbackUpdate(TG_B, cb.todoAdd(todo.id)));
    expect(result.last?.text).toContain("нет прав");

    result = await runUpdate(db, sender, callbackUpdate(TG_B, cb.wishAdd(wish.id)));
    expect(result.last?.text).toContain("нет прав");

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoAdd(todo.id)));
    expect(result.last?.text).toContain("по одной на строку");

    result = await runUpdate(
      db,
      sender,
      messageUpdate(
        TG_A,
        ["Valid one", "x".repeat(201), "Bad http://?", "Valid two"].join("\n"),
      ),
    );

    expect(result.last?.text).toContain("Добавлено задач: 2");
    expect(result.last?.text).toContain("строка 2");
    expect(result.last?.text).toContain("строка 3");
    const items = (await listTodoItems(db, todo.id, userA.id))?.items ?? [];
    expect(items.map((item) => item.title)).toEqual(["Valid one", "Valid two"]);
  });

  it("keeps the bulk prompt when no valid items are found", async () => {
    const sender = new InMemoryTelegramSender();
    const list = await ensureDefaultTodoList(db, userA.id);

    await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoAdd(list.id)));
    const result = await runUpdate(db, sender, messageUpdate(TG_A, "1.\n- \n[ ]"));

    expect(result.last?.text).toContain("Не найдено ни одного элемента");
    expect(result.last?.text).toContain("по одной на строку");
    expect((await listTodoItems(db, list.id, userA.id))?.items).toEqual([]);
    const state = await db.query(`SELECT 1 FROM conversation_states WHERE user_id = $1`, [
      userA.id,
    ]);
    expect(state.rowCount).toBe(1);
  });

  it("rejects oversized bulk messages without saving anything", async () => {
    const sender = new InMemoryTelegramSender();
    const list = await ensureDefaultTodoList(db, userA.id);

    await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoAdd(list.id)));
    const text = Array.from({ length: 101 }, (_, index) => `Задача ${index + 1}`).join("\n");
    const result = await runUpdate(db, sender, messageUpdate(TG_A, text));

    expect(result.last?.text).toContain("Слишком много элементов");
    expect((await listTodoItems(db, list.id, userA.id))?.items).toEqual([]);
  });

  it("creates a wish list and item through the UI", async () => {
    const sender = new InMemoryTelegramSender();

    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishCreate()));
    expect(result.last?.text).toContain("Новый список желаний");

    result = await runUpdate(db, sender, messageUpdate(TG_A, "Подарки"));
    expect(result.last?.text).toContain("Подарки");

    const lists = await listWishListsForUser(db, userA.id);
    const wish = lists.own.find((entry) => entry.name === "Подарки");
    expect(wish).toBeDefined();
    if (!wish) throw new Error("wish list was not created");

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.wishAdd(wish.id)));
    expect(result.last?.text).toContain("по одному на строку");

    result = await runUpdate(
      db,
      sender,
      messageUpdate(TG_A, "Наушники https://shop.example/item"),
    );
    expect(result.last?.text).toContain("Добавлено желаний: 1.");
    expect(result.last?.text).toContain("<b>Наушники</b>");
    expect(result.last?.text).toContain('<a href="https://shop.example/item">');

    const items = (await listWishItems(db, wish.id, userA.id))?.items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Наушники",
      description: null,
      url: "https://shop.example/item",
    });
  });

  it("stores a daily ToDo reminder for the owner only", async () => {
    const list = await ensureDefaultTodoList(db, userA.id);

    await expect(getTodoListReminderSettings(db, list.id, userB.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(setTodoListReminder(db, list.id, userB.id, "21:05")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(setTodoListReminder(db, list.id, userA.id, "24:00")).rejects.toMatchObject({
      code: "INVALID_TIME",
    });
    const enabled = await setTodoListReminder(db, list.id, userA.id, "21:05");
    expect(enabled).toMatchObject({ enabled: true, reminderTime: "21:05" });

    const disabled = await disableTodoListReminder(db, list.id, userA.id);
    expect(disabled.enabled).toBe(false);
  });

  it("sends the complete ToDo list once per owner-local day", async () => {
    await setUserTimezone(db, userA.id, "Europe/Moscow");
    const list = await ensureDefaultTodoList(db, userA.id);
    await addTodoItems(
      db,
      list.id,
      userA.id,
      Array.from({ length: 8 }, (_, index) => ({ title: `Задача ${index + 1}` })),
    );
    await setTodoListReminder(db, list.id, userA.id, "21:00");

    const sender = new InMemoryTelegramSender();
    // 18:00 UTC is 21:00 in Moscow.
    let result = await processTodoRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T18:00:00.000Z"),
    );
    expect(result.todoRemindersSent).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].chatId).toBe(String(TG_A));
    expect(sender.sent[0].keyboard).toBeUndefined();
    for (let index = 1; index <= 8; index += 1) {
      expect(sender.sent[0].text).toContain(`Задача ${index}`);
    }

    result = await processTodoRemindersOnce(
      db,
      sender,
      new Date("2026-10-25T18:00:00.000Z"),
    );
    expect(result.todoRemindersSent).toBe(0);
    expect(sender.sent).toHaveLength(1);

    // Before the local reminder time on the next day nothing is sent.
    result = await processTodoRemindersOnce(
      db,
      sender,
      new Date("2026-10-26T17:59:00.000Z"),
    );
    expect(result.todoRemindersSent).toBe(0);

    result = await processTodoRemindersOnce(
      db,
      sender,
      new Date("2026-10-26T18:00:00.000Z"),
    );
    expect(result.todoRemindersSent).toBe(1);
    expect(sender.sent).toHaveLength(2);

    await disableTodoListReminder(db, list.id, userA.id);
    result = await processTodoRemindersOnce(
      db,
      sender,
      new Date("2026-10-27T18:00:00.000Z"),
    );
    expect(result.todoRemindersSent).toBe(0);
    expect(sender.sent).toHaveLength(2);
  });

  it("configures a reminder through list callbacks and rejects shared access", async () => {
    const list = await ensureDefaultTodoList(db, userA.id);
    const sender = new InMemoryTelegramSender();

    await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoMenu()));
    let result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoReminder(list.id)));
    expect(result.last?.text).toContain("Ежедневное напоминание");
    expect(
      result.last?.keyboard?.inline_keyboard.flat().map((button) => button.callback_data),
    ).toContain(cb.todoReminderHour(list.id, 21));

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoReminderHour(list.id, 21)));
    expect(result.last?.text).toContain("Выберите минуты");

    result = await runUpdate(
      db,
      sender,
      callbackUpdate(TG_A, cb.todoReminderMinute(list.id, 21, 5)),
    );
    expect(result.last?.text).toContain("21:05");
    expect(await getTodoListReminderSettings(db, list.id, userA.id)).toMatchObject({
      enabled: true,
      reminderTime: "21:05",
    });

    result = await runUpdate(db, sender, callbackUpdate(TG_A, cb.todoReminderDisable(list.id)));
    expect(result.last?.text).toContain("выключено");
    expect((await getTodoListReminderSettings(db, list.id, userA.id)).enabled).toBe(false);

    result = await runUpdate(db, sender, callbackUpdate(TG_B, cb.todoReminder(list.id)));
    expect(result.last?.text).toContain("нет прав");
  });
});
