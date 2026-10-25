import { describe, expect, it } from "vitest";
import { zonedWallClockToUtc } from "@/lib/time";
import { DateTime } from "luxon";

describe("DST policy", () => {
  it("shifts forward for nonexistent spring time (Europe/Berlin gap)", () => {
    // 2026: clocks jump forward at 02:00 -> 03:00; 02:30 does not exist.
    const utc = zonedWallClockToUtc("2026-03-29", 2, 30, "Europe/Berlin");
    const local = DateTime.fromJSDate(utc, { zone: "Europe/Berlin" });
    expect(local.hour).toBeGreaterThanOrEqual(3);
    expect(local.isValid).toBe(true);
  });

  it("uses an earlier offset for ambiguous autumn time when Luxon resolves folds", () => {
    // 2026: clocks fall back at 03:00 -> 02:00; 02:30 exists twice.
    const utc = zonedWallClockToUtc("2026-10-25", 2, 30, "Europe/Berlin");
    const local = DateTime.fromJSDate(utc, { zone: "Europe/Berlin" });
    expect(local.hour).toBe(2);
    expect(local.minute).toBe(30);
    expect(local.isValid).toBe(true);
  });
});
