import { describe, expect, it } from "vitest";
import { parseCallback, cb, CALLBACK_LIMIT } from "@/lib/telegram/callbacks";
import { nextWeeklyOccurrence, nextMonthlyOccurrence } from "@/lib/time";
import { DateTime } from "luxon";

describe("telegram callbacks", () => {
  it("encodes and parses main navigation", () => {
    expect(parseCallback(cb.main())).toEqual({ type: "main" });
    expect(parseCallback(cb.createType())).toEqual({ type: "createType" });
    expect(parseCallback(cb.reminders(3))).toEqual({ type: "reminders", page: 3 });
  });

  it("keeps callback data under the telegram limit", () => {
    const values = [
      cb.reminderView("123456789012", 99),
      cb.friendAccept("987654321098"),
      cb.timezoneSet("America/Argentina/Buenos_Aires"),
    ];
    for (const value of values) {
      expect(value.length).toBeLessThanOrEqual(CALLBACK_LIMIT);
    }
  });

  it("rejects unknown or invalid callbacks", () => {
    expect(parseCallback("")).toBeNull();
    expect(parseCallback("evil:payload")).toBeNull();
    expect(parseCallback(cb.reminders(0))).toBeNull();
    expect(parseCallback(cb.selectDay(0))).toBeNull();
    expect(parseCallback(cb.selectDay(32))).toBeNull();
    expect(parseCallback(cb.toggleWeekday(8))).toBeNull();
  });

  it("parses friend and edit callbacks", () => {
    expect(parseCallback(cb.friendRemove("42"))).toEqual({ type: "friendRemove", id: "42" });
    expect(parseCallback(cb.editTime("123456789012"))).toEqual({ type: "editTime", id: "123456789012" });
    expect(parseCallback(cb.friendRemove("not-an-id"))).toBeNull();
    expect(parseCallback(cb.calendarPrev())).toEqual({ type: "calendar", direction: "prev" });
    expect(parseCallback(cb.monthDayPage(2))).toEqual({ type: "monthDayPage", page: 2 });
  });
});

describe("time scheduling", () => {
  it("finds the next weekly occurrence after now", () => {
    const now = DateTime.fromISO("2026-10-24T10:00:00", { zone: "Europe/Minsk" }).toJSDate();
    const next = nextWeeklyOccurrence("Europe/Minsk", [7], 9, 0, now);
    const local = DateTime.fromJSDate(next, { zone: "Europe/Minsk" });
    expect(local.weekday).toBe(7);
    expect(local.hour).toBe(9);
    expect(local.minute).toBe(0);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("skips months with no requested day for monthly reminders", () => {
    const now = DateTime.fromISO("2026-01-31T10:00:00", { zone: "Europe/Berlin" }).toJSDate();
    const next = nextMonthlyOccurrence("Europe/Berlin", [31], 10, 0, now);
    const local = DateTime.fromJSDate(next, { zone: "Europe/Berlin" });
    expect([3, 5, 7, 8, 10, 12]).toContain(local.month);
    expect(local.day).toBe(31);
  });
});
