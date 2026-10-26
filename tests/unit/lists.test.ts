import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { PrimaryUiSender } from "@/lib/telegram/primaryUi";
import type { EditResult, InlineKeyboard, TelegramSender } from "@/lib/telegram/types";
import { cb, parseCallback } from "@/lib/telegram/callbacks";
import { minuteKeyboard } from "@/lib/telegram/ui";
import {
  formatTodoItem,
  formatTodoList,
  formatWishItem,
} from "@/lib/telegram/listsRender";
import type { TodoItem, TodoList } from "@/lib/services/todoLists";
import type { WishItem, WishList } from "@/lib/services/wishLists";
import {
  normalizeHttpUrl,
  normalizeListItemDescription,
  normalizeListItemTitle,
  normalizeListName,
} from "@/lib/validation";

type Sent = { chatId: string; text: string; keyboard?: InlineKeyboard };
type Edited = { chatId: string; messageId: number; text: string; keyboard?: InlineKeyboard };

class FakeDb {
  readonly state = new Map<string, string>();

  async query(sql: string, params: unknown[] = []) {
    if (sql.includes("SELECT message_id FROM ui_state")) {
      const value = this.state.get(`${String(params[0])}:${String(params[1])}`);
      return {
        rows: value === undefined ? [] : [{ message_id: value }],
        rowCount: value === undefined ? 0 : 1,
      };
    }
    if (sql.includes("INSERT INTO ui_state")) {
      this.state.set(`${String(params[0])}:${String(params[1])}`, String(params[2]));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM ui_state")) {
      this.state.delete(`${String(params[0])}:${String(params[1])}`);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

class FakeSender implements TelegramSender {
  readonly sent: Sent[] = [];
  readonly edited: Edited[] = [];
  editResult: EditResult = "edited";
  failEdits = false;
  private nextId = 100;

  async sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<number> {
    this.sent.push({ chatId, text, keyboard });
    return this.nextId++;
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult> {
    if (this.failEdits) throw new Error("Bad Request: message to edit not found");
    if (this.editResult !== "unavailable") {
      this.edited.push({ chatId, messageId, text, keyboard });
    }
    return this.editResult;
  }

  async answerCallbackQuery(): Promise<void> {}
}

function makePrimary(sender: FakeSender, db = new FakeDb(), chatId = "10") {
  return {
    db,
    sender,
    primary: new PrimaryUiSender(db as unknown as Db, sender, chatId, async () => "1"),
  };
}

const list: TodoList = {
  id: "1",
  ownerUserId: "1",
  ownerName: "Алиса",
  name: "Мои задачи",
  isDefault: true,
  role: "OWNER",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const item: TodoItem = {
  id: "2",
  listId: "1",
  title: "Купить <молоко>",
  description: "Срочно & важно",
  url: "https://example.com/?a=1&b=2",
  isCompleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const wishList: WishList = {
  id: "3",
  ownerUserId: "1",
  ownerName: "Алиса",
  name: "Мои желания",
  isDefault: true,
  role: "OWNER",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const wishItem: WishItem = {
  id: "4",
  listId: "3",
  title: "Наушники <pro>",
  description: null,
  url: "https://shop.example/item?a=1&b=2",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("primary UI sender", () => {
  it("edits the stored message instead of sending a new one", async () => {
    const { sender, primary } = makePrimary(new FakeSender());

    expect(await primary.sendMessage("10", "Первый экран")).toBe(100);
    expect(await primary.sendMessage("10", "Второй экран")).toBe(100);

    expect(sender.sent).toHaveLength(1);
    expect(sender.edited).toHaveLength(1);
    expect(sender.edited[0]).toMatchObject({ chatId: "10", messageId: 100, text: "Второй экран" });
  });

  it("treats 'message is not modified' as a successful edit", async () => {
    const sender = new FakeSender();
    const { primary } = makePrimary(sender);
    await primary.sendMessage("10", "Экран");
    sender.editResult = "unchanged";

    expect(await primary.sendMessage("10", "Экран")).toBe(100);
    expect(sender.sent).toHaveLength(1);
  });

  it("replaces a deleted or stale primary message", async () => {
    const sender = new FakeSender();
    const { primary } = makePrimary(sender);
    expect(await primary.sendMessage("10", "Экран")).toBe(100);

    sender.failEdits = true;
    expect(await primary.sendMessage("10", "Новый экран")).toBe(101);
    expect(sender.sent).toHaveLength(2);

    sender.failEdits = false;
    expect(await primary.sendMessage("10", "Ещё экран")).toBe(101);
    expect(sender.sent).toHaveLength(2);
    expect(sender.edited.at(-1)?.messageId).toBe(101);
  });

  it("passes cross-chat notifications through without moving the UI cursor", async () => {
    const sender = new FakeSender();
    const { primary } = makePrimary(sender);
    await primary.sendMessage("10", "Экран");

    expect(await primary.sendMessage("20", "Напоминание другу")).toBe(101);
    expect(sender.sent.at(-1)?.chatId).toBe("20");

    expect(await primary.sendMessage("10", "Обновление")).toBe(100);
    expect(sender.edited.at(-1)?.messageId).toBe(100);
  });
});

describe("quarter-hour reminder picker", () => {
  it("only renders 00, 15, 30 and 45", () => {
    const values = minuteKeyboard(9)
      .inline_keyboard.flat()
      .map((button) => button.callback_data)
      .filter((data) => data.startsWith("time:m:"));
    expect(values).toEqual([
      cb.selectMinute(0),
      cb.selectMinute(15),
      cb.selectMinute(30),
      cb.selectMinute(45),
    ]);
  });

  it("rejects other minutes while leaving old callback data safe", () => {
    for (const minute of [0, 15, 30, 45]) {
      expect(parseCallback(cb.selectMinute(minute))).toEqual({ type: "selectMinute", minute });
    }
    for (const minute of [1, 5, 10, 29, 31, 44, 46, 59]) {
      expect(parseCallback(cb.selectMinute(minute))).toBeNull();
    }
  });
});

describe("list callbacks", () => {
  it("parses list navigation and sharing actions", () => {
    expect(parseCallback(cb.todoMenu())).toEqual({ type: "todoMenu" });
    expect(parseCallback(cb.todoOpen("12", 3))).toEqual({ type: "todoOpen", id: "12", page: 3 });
    expect(parseCallback(cb.todoEditField("12", "34", "u"))).toEqual({
      type: "todoEditField",
      id: "12",
      itemId: "34",
      field: "url",
    });
    expect(parseCallback(cb.todoSharePermission("12", "34", "e"))).toEqual({
      type: "todoSharePermission",
      id: "12",
      friendId: "34",
      permission: "EDIT",
    });
    expect(parseCallback(cb.wishShareFriend("12", "34"))).toEqual({
      type: "wishShareFriend",
      id: "12",
      friendId: "34",
    });
  });

  it("keeps every list callback within the Telegram limit", () => {
    const id = "12345678901234567890";
    const values = [
      cb.todoOpen(id, 500),
      cb.todoItem(id, id),
      cb.todoSharePermission(id, id, "e"),
      cb.wishOpen(id, 500),
      cb.wishItem(id, id),
    ];
    for (const value of values) expect(value.length).toBeLessThanOrEqual(64);
  });
});

describe("list URL safety and HTML rendering", () => {
  it("accepts only absolute http(s) URLs", () => {
    expect(normalizeHttpUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeHttpUrl(" http://example.com/path?a=1 ")).toBe(
      "http://example.com/path?a=1",
    );
    expect(normalizeHttpUrl("-")).toBeNull();
    expect(normalizeHttpUrl("   ")).toBeNull();
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://example.com/file",
      "//example.com",
      "not-a-url",
    ]) {
      expect(normalizeHttpUrl(value)).toBe("invalid");
    }
  });

  it("normalizes names and preserves multi-line descriptions", () => {
    expect(normalizeListName("  Работа   и дом ")).toBe("Работа и дом");
    expect(normalizeListName("   ")).toBeNull();
    expect(normalizeListItemTitle("  Очень   важно ")).toBe("Очень важно");
    expect(normalizeListItemDescription(" первая\nвторая ")).toBe("первая\nвторая");
    expect(normalizeListItemDescription("-")).toBeNull();
  });

  it("escapes user text and keeps http(s) links clickable", () => {
    const text = formatTodoList(list, [item], 1, 5);
    expect(text).toContain("Купить &lt;молоко&gt;");
    expect(text).toContain("Срочно &amp; важно");
    expect(text).toContain(
      '<a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a>',
    );
    expect(text).not.toContain("<молоко>");

    const detail = formatTodoItem(list, item);
    expect(detail).toContain("<b>Купить &lt;молоко&gt;</b>");
    expect(detail).toContain("⬜️ Не выполнено");
  });

  it("renders wish items with escaped titles and links", () => {
    const text = formatWishItem(wishList, wishItem);
    expect(text).toContain("<b>Наушники &lt;pro&gt;</b>");
    expect(text).toContain(
      '<a href="https://shop.example/item?a=1&amp;b=2">https://shop.example/item?a=1&amp;b=2</a>',
    );
  });
});
