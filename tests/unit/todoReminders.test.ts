import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import type { Db } from "@/lib/db";
import { setReminderEnabled } from "@/lib/services/reminders";
import { buildTodoReminderMessages } from "@/lib/scheduler/todoReminders";
import { cb, parseCallback, CALLBACK_LIMIT } from "@/lib/telegram/callbacks";
import { calendarKeyboard, hourKeyboard, minuteKeyboard } from "@/lib/telegram/ui";
import { monthCells } from "@/lib/telegram/render";
import { scheduleCutoff, slotIsFuture } from "@/lib/time";

function callbackValues(keyboard: ReturnType<typeof hourKeyboard>): string[] {
  return keyboard.inline_keyboard.flat().map((button) => button.callback_data);
}

describe("one-time reminder time cutoffs", () => {
  it("returns the first quarter-hour slot strictly after now", () => {
    expect(scheduleCutoff(new Date("2026-10-25T21:05:00.000Z"), "UTC")).toEqual({
      minDate: "2026-10-25",
      minHour: 21,
      minMinute: 15,
    });
    expect(scheduleCutoff(new Date("2026-10-25T21:14:59.000Z"), "UTC")).toEqual({
      minDate: "2026-10-25",
      minHour: 21,
      minMinute: 15,
    });
    // 21:05 in Moscow is 18:05 UTC.
    expect(scheduleCutoff(new Date("2026-10-25T18:05:00.000Z"), "Europe/Moscow")).toEqual({
      minDate: "2026-10-25",
      minHour: 21,
      minMinute: 15,
    });
  });

  it("rolls over to the next local day when no slots remain", () => {
    expect(scheduleCutoff(new Date("2026-10-25T23:50:00.000Z"), "UTC")).toEqual({
      minDate: "2026-10-26",
      minHour: 0,
      minMinute: 0,
    });
    const local = DateTime.fromISO("2026-10-25T23:50:00", { zone: "Europe/Berlin" });
    expect(scheduleCutoff(local.toJSDate(), "Europe/Berlin")).toEqual({
      minDate: "2026-10-26",
      minHour: 0,
      minMinute: 0,
    });
  });

  it("treats the current minute as past and the next slot as future", () => {
    const now = new Date("2026-10-25T21:05:00.000Z");
    expect(slotIsFuture("2026-10-25", 21, 0, now, "UTC")).toBe(false);
    expect(slotIsFuture("2026-10-25", 21, 5, now, "UTC")).toBe(false);
    expect(slotIsFuture("2026-10-25", 21, 15, now, "UTC")).toBe(true);
  });
});

describe("past date and time controls", () => {
  it("disables past days and the previous-month arrow", () => {
    const keyboard = calendarKeyboard(
      2026,
      10,
      null,
      monthCells(2026, 10),
      "2026-10-25",
    );
    const buttons = keyboard.inline_keyboard.flat();
    const day = (value: number) =>
      buttons.find((button) => button.text === String(value) || button.text === `✓ ${value}`);

    expect(day(24)?.callback_data).toBe(cb.noop());
    expect(day(25)?.callback_data).toBe(cb.selectDay(25));
    expect(day(26)?.callback_data).toBe(cb.selectDay(26));

    const nav = keyboard.inline_keyboard.at(-2) ?? [];
    expect(nav[0]).toEqual({ text: "⬅️", callback_data: cb.noop() });
  });

  it("allows going back to the cutoff month from a later month", () => {
    const keyboard = calendarKeyboard(2026, 11, null, monthCells(2026, 11), "2026-10-25");
    const nav = keyboard.inline_keyboard.at(-2) ?? [];
    expect(nav[0]).toEqual({ text: "⬅️", callback_data: cb.calendarPrev() });
  });

  it("disables hours before the cutoff and minutes before the slot", () => {
    const hours = callbackValues(hourKeyboard(11));
    for (let hour = 0; hour < 11; hour += 1) expect(hours).toContain(cb.noop());
    expect(hours).toContain(cb.selectHour(11));
    expect(hours).toContain(cb.selectHour(23));

    const minutes = minuteKeyboard(21, 15)
      .inline_keyboard.flat()
      .map((button) => button.callback_data);
    expect(minutes).toContain(cb.noop());
    expect(minutes).not.toContain(cb.selectMinute(0));
    expect(minutes).toContain(cb.selectMinute(15));
    expect(minutes).toContain(cb.selectMinute(30));
    expect(minutes).toContain(cb.selectMinute(45));
  });
});

describe("todo reminder callbacks", () => {
  it("round-trips and stays inside the Telegram limit", () => {
    const values = [
      cb.todoReminder("123456789012"),
      cb.todoReminderHour("123456789012", 21),
      cb.todoReminderMinute("123456789012", 21, 45),
      cb.todoReminderDisable("123456789012"),
    ];
    for (const value of values) expect(value.length).toBeLessThanOrEqual(CALLBACK_LIMIT);

    expect(parseCallback(values[0])).toEqual({ type: "todoReminder", id: "123456789012" });
    expect(parseCallback(values[1])).toEqual({
      type: "todoReminderHour",
      id: "123456789012",
      hour: 21,
    });
    expect(parseCallback(values[2])).toEqual({
      type: "todoReminderMinute",
      id: "123456789012",
      hour: 21,
      minute: 45,
    });
    expect(parseCallback(values[3])).toEqual({
      type: "todoReminderDisable",
      id: "123456789012",
    });
    expect(parseCallback(cb.todoReminderHour("1", 24))).toBeNull();
    expect(parseCallback(cb.todoReminderMinute("1", 9, 60))).toBeNull();
  });
});

describe("re-enabling a past one-time reminder", () => {
  it("rejects the transition at the service layer", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "1",
          owner_id: "2",
          type: "ONCE",
          scheduled_at: new Date("2020-01-01T00:00:00.000Z"),
          status: "DISABLED",
        },
      ],
      rowCount: 1,
    });
    const db = { query } as unknown as Db;

    await expect(setReminderEnabled(db, "1", "2", true)).rejects.toMatchObject({
      code: "PAST_TIME",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("todo reminder message building", () => {
  it("includes the complete list in order without keyboards", () => {
    const messages = buildTodoReminderMessages("Работа", [
      { title: "Позвонить", description: "Клиенту", url: null, isCompleted: false },
      { title: "Отчёт", description: null, url: "https://example.com", isCompleted: true },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("🔔 Напоминание: Работа");
    expect(messages[0]).toContain("1. ⬜️ Позвонить");
    expect(messages[0]).toContain("2. ☑️ Отчёт");
    expect(messages[0]).toContain("Клиенту");
    expect(messages[0]).toContain("https://example.com");
  });

  it("escapes markup and reports an empty list", () => {
    const messages = buildTodoReminderMessages("Дом", []);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("нет задач");

    const escaped = buildTodoReminderMessages("Список", [
      { title: "<script>", description: null, url: null, isCompleted: false },
    ]);
    expect(escaped[0]).toContain("&lt;script&gt;");
    expect(escaped[0]).not.toContain("<script>");
  });

  it("splits long lists between items instead of paginating", () => {
    const items = Array.from({ length: 300 }, (_, index) => ({
      title: `Задача ${index + 1} ${"x".repeat(40)}`,
      description: null,
      url: null,
      isCompleted: false,
    }));
    const messages = buildTodoReminderMessages("Большой список", items);
    expect(messages.length).toBeGreaterThan(1);
    const joined = messages.join("\n");
    for (let index = 1; index <= items.length; index += 1) {
      expect(joined).toContain(`${index}. ⬜️ Задача ${index} `);
    }
  });
});
