import { describe, expect, it } from "vitest";
import { cb, parseCallback } from "@/lib/telegram/callbacks";
import { reminderListKeyboard, menuKeyboard } from "@/lib/telegram/ui";

describe("main menu layout", () => {
  it("lays the top-level sections out in two columns", () => {
    const rows = menuKeyboard().inline_keyboard;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toHaveLength(2);

    expect(rows.flat().map((button) => button.callback_data)).toEqual([
      cb.reminders(1),
      cb.habitsMenu(),
      cb.todoMenu(),
      cb.wishMenu(),
      cb.friendsMenu(),
      cb.settings(),
    ]);
  });

  it("moves create reminder into the reminders list", () => {
    const menuCallbacks = menuKeyboard()
      .inline_keyboard.flat()
      .map((button) => button.callback_data);
    expect(menuCallbacks).not.toContain(cb.createType());

    const rows = reminderListKeyboard([], 1, 1).inline_keyboard;
    expect(rows.map((row) => row.map((button) => button.callback_data))).toEqual([
      [cb.createType()],
      [cb.main()],
    ]);
    expect(parseCallback(cb.createType())).toEqual({ type: "createType" });
  });

  it("keeps habit statistics out of the main menu", () => {
    const menuCallbacks = menuKeyboard()
      .inline_keyboard.flat()
      .map((button) => button.callback_data);
    expect(menuCallbacks).not.toContain(cb.habitStats());
  });
});
