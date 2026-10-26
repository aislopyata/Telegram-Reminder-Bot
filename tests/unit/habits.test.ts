import { describe, expect, it } from "vitest";
import { cb, parseCallback, CALLBACK_LIMIT } from "@/lib/telegram/callbacks";
import {
  completionRate,
  daysInclusive,
  eligibleDays,
  endOfWeek,
  isIsoDate,
  localDateInZone,
  startOfWeek,
  todayInZone,
} from "@/lib/habits/stats";
import { validateHabitName } from "@/lib/services/habits";
import { formatHabitDate, formatHabitWeekRange } from "@/lib/telegram/render";
import {
  habitsListKeyboard,
  habitTrackingKeyboard,
  habitDeleteListKeyboard,
  menuKeyboard,
} from "@/lib/telegram/ui";

describe("habit name validation", () => {
  it("trims and collapses whitespace", () => {
    expect(validateHabitName("  Утренняя   пробежка  ")).toEqual({
      ok: true,
      name: "Утренняя пробежка",
    });
    expect(validateHabitName("Строка\nс\tтабами")).toEqual({
      ok: true,
      name: "Строка с табами",
    });
  });

  it("rejects empty names", () => {
    expect(validateHabitName("")).toEqual({ ok: false, reason: "empty" });
    expect(validateHabitName("   \n\t ")).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts exactly 100 characters and rejects 101", () => {
    expect(validateHabitName("a".repeat(100)).ok).toBe(true);
    expect(validateHabitName("a".repeat(101))).toEqual({ ok: false, reason: "too_long" });
  });

  it("counts unicode code points rather than UTF-16 units", () => {
    expect(validateHabitName("😀".repeat(100)).ok).toBe(true);
    expect(validateHabitName("😀".repeat(101))).toEqual({ ok: false, reason: "too_long" });
  });

  it("treats markup as plain text", () => {
    expect(validateHabitName("<b>не жирный</b>")).toEqual({
      ok: true,
      name: "<b>не жирный</b>",
    });
  });
});

describe("habit calendar arithmetic", () => {
  it("validates strict ISO dates", () => {
    expect(isIsoDate("2026-10-25")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(isIsoDate("not-a-date")).toBe(false);
  });

  it("uses Monday as the start of the week", () => {
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-26")).toBe("2026-10-26");
    expect(endOfWeek("2026-10-25")).toBe("2026-10-25");
    expect(endOfWeek("2026-10-19")).toBe("2026-10-25");
  });

  it("counts inclusive calendar days only", () => {
    expect(daysInclusive("2026-10-19", "2026-10-25")).toBe(7);
    expect(daysInclusive("2026-10-25", "2026-10-25")).toBe(1);
    expect(daysInclusive("2026-10-26", "2026-10-25")).toBe(0);
  });

  it("calculates eligible days from the habit creation date", () => {
    expect(eligibleDays("2026-10-19", "2026-10-19", "2026-10-25")).toBe(7);
    expect(eligibleDays("2026-10-22", "2026-10-19", "2026-10-25")).toBe(4);
    expect(eligibleDays("2026-10-25", "2026-10-19", "2026-10-25")).toBe(1);
    expect(eligibleDays("2026-10-26", "2026-10-19", "2026-10-25")).toBe(0);
  });

  it("resolves local dates across the UTC day boundary", () => {
    const instant = new Date("2026-10-25T23:30:00.000Z");
    expect(todayInZone("Europe/Moscow", instant)).toBe("2026-10-26");
    expect(todayInZone("UTC", instant)).toBe("2026-10-25");
    expect(localDateInZone(instant, "America/New_York")).toBe("2026-10-25");
    expect(todayInZone("Not/AZone", instant)).toBe("2026-10-25");
  });

  it("rounds percentages to one decimal place", () => {
    expect(completionRate(3, 8)).toBe(37.5);
    expect(completionRate(5, 6)).toBe(83.3);
    expect(completionRate(2, 3)).toBe(66.7);
    expect(completionRate(7, 7)).toBe(100);
    expect(completionRate(0, 7)).toBe(0);
    expect(completionRate(3, 0)).toBe(0);
  });
});

describe("habit formatting", () => {
  it("formats a local date without shifting it", () => {
    expect(formatHabitDate("2026-10-25")).toContain("25");
    expect(formatHabitDate("2026-10-25")).toContain("октября");
  });

  it("formats same-month and cross-month week labels", () => {
    expect(formatHabitWeekRange("2026-10-19", "2026-10-25")).toBe("19–25 октября");
    expect(formatHabitWeekRange("2026-09-28", "2026-10-04")).toContain("сентября");
    expect(formatHabitWeekRange("2026-09-28", "2026-10-04")).toContain("октября");
  });
});

describe("habit callbacks", () => {
  it("keeps habit navigation in the main menu and statistics inside the habits section", () => {
    const callbacks = menuKeyboard()
      .inline_keyboard.flat()
      .map((button) => button.callback_data);
    expect(callbacks).toContain(cb.habitsMenu());
    expect(callbacks).not.toContain(cb.habitStats());

    const habitCallbacks = habitsListKeyboard(true, false)
      .inline_keyboard.flat()
      .map((button) => button.callback_data);
    expect(habitCallbacks).toContain(cb.habitStats());
  });

  it("encodes callbacks with desired completion state", () => {
    const buttons = habitTrackingKeyboard([
      { id: "42", name: "Утренняя пробежка", completed: false },
      { id: "43", name: "Чтение", completed: true },
    ]).inline_keyboard.flat();
    expect(buttons[0].callback_data).toBe("h:t:42:1");
    expect(buttons[1].callback_data).toBe("h:t:43:0");
    expect(parseCallback(buttons[0].callback_data)).toEqual({
      type: "habitToggle",
      id: "42",
      completed: true,
    });
    expect(parseCallback(buttons[1].callback_data)).toEqual({
      type: "habitToggle",
      id: "43",
      completed: false,
    });
  });

  it("parses every habit action and rejects malformed values", () => {
    expect(parseCallback("h:menu")).toEqual({ type: "habitsMenu" });
    expect(parseCallback("h:add")).toEqual({ type: "habitAdd" });
    expect(parseCallback("h:track")).toEqual({ type: "habitTrack" });
    expect(parseCallback("h:done")).toEqual({ type: "habitDone" });
    expect(parseCallback("h:notnow")).toEqual({ type: "habitNotNow" });
    expect(parseCallback("h:del")).toEqual({ type: "habitDeleteMenu" });
    expect(parseCallback("h:del:123")).toEqual({ type: "habitDelete", id: "123" });
    expect(parseCallback("h:delc:123")).toEqual({ type: "habitDeleteConfirm", id: "123" });
    expect(parseCallback("h:stats")).toEqual({ type: "habitStats", view: "week" });
    expect(parseCallback("h:st:a")).toEqual({ type: "habitStats", view: "all" });
    expect(parseCallback("h:rem")).toEqual({ type: "habitReminder" });
    expect(parseCallback("h:rh:21")).toEqual({ type: "habitReminderHour", hour: 21 });
    expect(parseCallback("h:rm:21:05")).toEqual({
      type: "habitReminderMinute",
      hour: 21,
      minute: 5,
    });
    expect(parseCallback("h:rdis")).toEqual({ type: "habitReminderDisable" });

    expect(parseCallback("h:rh:24")).toBeNull();
    expect(parseCallback("h:rm:21:60")).toBeNull();
    expect(parseCallback("h:t:abc:1")).toBeNull();
    expect(parseCallback("h:t:42:2")).toBeNull();
    expect(parseCallback("h:del:1:2")).toBeNull();
  });

  it("lays out habit buttons three per row", () => {
    const habits = Array.from({ length: 7 }, (_, index) => ({
      id: String(index + 1),
      name: `Привычка ${index + 1}`,
      completed: index % 2 === 0,
    }));
    const trackingRows = habitTrackingKeyboard(habits).inline_keyboard;
    expect(trackingRows.slice(0, 3).map((buttons) => buttons.length)).toEqual([3, 3, 1]);
    const deleteRows = habitDeleteListKeyboard(habits).inline_keyboard;
    expect(deleteRows.slice(0, 3).map((buttons) => buttons.length)).toEqual([3, 3, 1]);
  });

  it("keeps the longest habit callbacks within the Telegram limit", () => {
    const longestId = "9".repeat(20);
    for (const value of [
      cb.habitDelete(longestId),
      cb.habitDeleteConfirm(longestId),
      cb.habitToggle(longestId, true),
    ]) {
      expect(value.length).toBeLessThanOrEqual(CALLBACK_LIMIT);
    }
  });
});
