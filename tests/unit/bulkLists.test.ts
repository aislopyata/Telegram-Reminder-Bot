import { describe, expect, it } from "vitest";
import { cb, parseCallback } from "@/lib/telegram/callbacks";
import { todoListKeyboard, wishListKeyboard } from "@/lib/telegram/ui";
import type { TodoList } from "@/lib/services/todoLists";
import type { WishList } from "@/lib/services/wishLists";
import {
  LIST_BULK_MAX_ITEMS,
  LIST_ITEM_TITLE_MAX,
  parseBulkListText,
} from "@/lib/validation";

function todoList(role: TodoList["role"]): TodoList {
  return {
    id: "10",
    ownerUserId: "1",
    ownerName: "Алиса",
    name: "Мои задачи",
    isDefault: true,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function wishList(role: WishList["role"]): WishList {
  return {
    id: "20",
    ownerUserId: "1",
    ownerName: "Алиса",
    name: "Мои желания",
    isDefault: true,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function callbacks(keyboard: ReturnType<typeof todoListKeyboard>): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data);
}

describe("bulk list parsing", () => {
  it("splits lines, ignores empty lines and preserves order", () => {
    const parsed = parseBulkListText(
      ["", "Первая задача", "   ", "Вторая задача", "", "Третья задача", ""].join("\n"),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.items.map((item) => item.title)).toEqual([
      "Первая задача",
      "Вторая задача",
      "Третья задача",
    ]);
    expect(parsed.totalLines).toBe(7);
  });

  it("cleans numbered, bulleted and checkbox markers with mixed whitespace", () => {
    const input = [
      "  1.   Buy a keyboard  ",
      "2) Get running shoes",
      "3. Read a book about AI",
      "- Learn TypeScript",
      "* Exercise daily",
      "• Make coffee",
      "☐ Water plants",
      "□ Clean desk",
      "[ ] Buy milk",
      "[x] Call mom",
      "1. [ ] Stacked marker",
    ].join("\n");

    const parsed = parseBulkListText(input);
    expect(parsed.errors).toEqual([]);
    expect(parsed.items.map((item) => item.title)).toEqual([
      "Buy a keyboard",
      "Get running shoes",
      "Read a book about AI",
      "Learn TypeScript",
      "Exercise daily",
      "Make coffee",
      "Water plants",
      "Clean desk",
      "Buy milk",
      "Call mom",
      "Stacked marker",
    ]);
  });

  it("does not strip meaningful leading numbers, punctuation or internal hyphens", () => {
    const parsed = parseBulkListText(
      [
        "2024. Read more",
        "-5 degrees outside",
        "*важно*",
        "Read 1.5 books",
        "Buy - sell",
        "https://example.com/a-b",
        "Buy milk, eggs & bread",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toEqual([
      { title: "2024. Read more", url: null },
      { title: "-5 degrees outside", url: null },
      { title: "*важно*", url: null },
      { title: "Read 1.5 books", url: null },
      { title: "Buy - sell", url: null },
      { title: "https://example.com/a-b", url: "https://example.com/a-b" },
      { title: "Buy milk, eggs & bread", url: null },
    ]);
  });

  it("ignores lines that become empty after marker cleanup", () => {
    expect(parseBulkListText("1.\n-\n[ ]\n•\n ☐ \n").items).toEqual([]);
  });

  it("extracts http(s) URLs and keeps the remaining title clean", () => {
    const parsed = parseBulkListText(
      [
        "Buy a keyboard - https://example.com/keyboard",
        "Buy running shoes - https://example.com/shoes.",
        "See https://example.com/a-b for details",
        "Read https://example.com/wiki/Foo_(bar)",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toEqual([
      { title: "Buy a keyboard", url: "https://example.com/keyboard" },
      { title: "Buy running shoes", url: "https://example.com/shoes" },
      { title: "See for details", url: "https://example.com/a-b" },
      {
        title: "Read",
        url: "https://example.com/wiki/Foo_(bar)",
      },
    ]);
  });

  it("removes wrapping brackets around URLs", () => {
    const parsed = parseBulkListText(
      [
        "MacBook Pro 14″ — Купить на imagic.by (https://imagic.by/product/macbook/)",
        "Rolex (реплика) | 376 BYN | Купить на chasy5.by (https://chasy5.by/products/daytona)",
        "See (https://example.com/details) for details",
        "[https://example.com/only-link]",
      ].join("\n"),
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toEqual([
      {
        title: "MacBook Pro 14″ — Купить на imagic.by",
        url: "https://imagic.by/product/macbook/",
      },
      {
        title: "Rolex (реплика) | 376 BYN | Купить на chasy5.by",
        url: "https://chasy5.by/products/daytona",
      },
      { title: "See for details", url: "https://example.com/details" },
      { title: "https://example.com/only-link", url: "https://example.com/only-link" },
    ]);
  });

  it("reports over-limit and invalid lines with original line numbers", () => {
    const longTitle = "x".repeat(LIST_ITEM_TITLE_MAX + 1);
    const parsed = parseBulkListText(
      ["Good one", "", longTitle, "Bad link http://?", "Good two"].join("\n"),
    );

    expect(parsed.items.map((item) => item.title)).toEqual(["Good one", "Good two"]);
    expect(parsed.errors).toEqual([
      { line: 3, reason: "title_too_long" },
      { line: 4, reason: "invalid_url" },
    ]);
  });

  it("rejects an entire batch above the item limit", () => {
    const lines = Array.from(
      { length: LIST_BULK_MAX_ITEMS + 1 },
      (_, index) => `Задача ${index + 1}`,
    );
    const parsed = parseBulkListText(lines.join("\n"));
    expect(parsed.limitExceeded).toBe(true);
    expect(parsed.items).toEqual([]);
  });

  it("accepts a batch exactly at the limit", () => {
    const lines = Array.from({ length: LIST_BULK_MAX_ITEMS }, (_, index) => `Задача ${index + 1}`);
    const parsed = parseBulkListText(lines.join("\n"));
    expect(parsed.limitExceeded).toBe(false);
    expect(parsed.items).toHaveLength(LIST_BULK_MAX_ITEMS);
  });
});

describe("bulk list callbacks and keyboards", () => {
  it("uses the regular add callback for bulk input and keeps it within the limit", () => {
    const id = "12345678901234567890";
    expect(parseCallback(cb.todoAdd(id))).toEqual({ type: "todoAdd", id });
    expect(parseCallback(cb.wishAdd(id))).toEqual({ type: "wishAdd", id });
    expect(cb.todoAdd(id).length).toBeLessThanOrEqual(64);
    expect(cb.wishAdd(id).length).toBeLessThanOrEqual(64);
  });

  it("offers one add action only on writable ToDo lists", () => {
    const owner = callbacks(todoListKeyboard(todoList("OWNER"), [], 1, 1));
    const editor = callbacks(todoListKeyboard(todoList("EDIT"), [], 1, 1));
    const reader = callbacks(todoListKeyboard(todoList("READ"), [], 1, 1));

    expect(owner).toContain(cb.todoAdd("10"));
    expect(editor).toContain(cb.todoAdd("10"));
    expect(reader).not.toContain(cb.todoAdd("10"));
    expect(owner.filter((data) => data === cb.todoAdd("10"))).toHaveLength(1);
  });

  it("offers one add action only to Wish List owners", () => {
    const owner = callbacks(wishListKeyboard(wishList("OWNER"), [], 1, 1));
    const reader = callbacks(wishListKeyboard(wishList("READ"), [], 1, 1));

    expect(owner).toContain(cb.wishAdd("20"));
    expect(reader).not.toContain(cb.wishAdd("20"));
    expect(owner.filter((data) => data === cb.wishAdd("20"))).toHaveLength(1);
  });
});
