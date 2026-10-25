import { describe, expect, it } from "vitest";
import { normalizeTelegramUsername } from "@/lib/validation";
import { safeEqual } from "@/lib/auth";

describe("validation and auth helpers", () => {
  it("normalizes telegram usernames", () => {
    expect(normalizeTelegramUsername("@Alice_Test")).toBe("alice_test");
    expect(normalizeTelegramUsername("bob123")).toBe("bob123");
    expect(normalizeTelegramUsername("ab")).toBeNull();
    expect(normalizeTelegramUsername("a".repeat(40))).toBeNull();
    expect(normalizeTelegramUsername("bad-name")).toBeNull();
  });

  it("compares secrets in constant-time style", () => {
    expect(safeEqual("secret-123456789012", "secret-123456789012")).toBe(true);
    expect(safeEqual("secret-123456789013", "secret-123456789012")).toBe(false);
    expect(safeEqual("", "secret")).toBe(false);
    expect(safeEqual(null, "secret")).toBe(false);
  });
});
