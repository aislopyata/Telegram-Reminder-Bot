import { z } from "zod";
import { isValidTimeZone } from "./time";

export const REMINDER_TEXT_MAX = 1000;
export const FRIEND_USERNAME_MAX = 32;
export const LIST_NAME_MAX = 100;
export const LIST_ITEM_TITLE_MAX = 200;
export const LIST_ITEM_DESCRIPTION_MAX = 2000;
export const LIST_ITEM_URL_MAX = 500;

/**
 * Telegram usernames are case-insensitive and may be supplied with a leading
 * "@". Usernames are only used for discovery, never for authorization.
 */
export function normalizeTelegramUsername(input: string): string | null {
  const trimmed = input.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(trimmed)) return null;
  return trimmed;
}

export const reminderTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(REMINDER_TEXT_MAX);

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => isValidTimeZone(value), "Unknown IANA time zone");

export const weekdaySchema = z.number().int().min(1).max(7);
export const monthDaySchema = z.number().int().min(1).max(31);

export const reminderFieldsSchema = z
  .object({
    text: reminderTextSchema,
    type: z.enum(["ONCE", "RECURRING"]),
    recurrenceType: z.enum(["WEEKLY", "MONTHLY"]).nullable().default(null),
    scheduledAtUtc: z.date().nullable().default(null),
    localTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .default(null),
    timeZone: timezoneSchema,
    recurrenceDays: z.array(z.number().int().min(1).max(31)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.type === "ONCE") {
      if (!value.scheduledAtUtc) {
        ctx.addIssue({ code: "custom", message: "One-time reminder needs a UTC instant" });
      }
      if (value.recurrenceType !== null || value.recurrenceDays.length > 0) {
        ctx.addIssue({ code: "custom", message: "One-time reminder cannot carry recurrence" });
      }
      return;
    }

    if (value.scheduledAtUtc !== null) {
      ctx.addIssue({ code: "custom", message: "Recurring reminder cannot carry scheduledAtUtc" });
    }
    if (!value.recurrenceType || !value.localTime) {
      ctx.addIssue({ code: "custom", message: "Recurring reminder needs type and local time" });
      return;
    }

    const unique = new Set(value.recurrenceDays);
    if (unique.size !== value.recurrenceDays.length) {
      ctx.addIssue({ code: "custom", message: "Recurrence days must be unique" });
    }
    if (value.recurrenceDays.length === 0) {
      ctx.addIssue({ code: "custom", message: "Recurrence days cannot be empty" });
    }
    if (value.recurrenceType === "WEEKLY" && value.recurrenceDays.some((d) => d < 1 || d > 7)) {
      ctx.addIssue({ code: "custom", message: "Weekdays must be between 1 and 7" });
    }
    if (value.recurrenceType === "MONTHLY" && value.recurrenceDays.some((d) => d < 1 || d > 31)) {
      ctx.addIssue({ code: "custom", message: "Month days must be between 1 and 31" });
    }
  });

export type ReminderFields = z.infer<typeof reminderFieldsSchema>;

/** Safe user-facing error text for the reminder form. */
export function reminderValidationMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Некорректные данные";
  if (error instanceof Error) return error.message;
  return "Некорректные данные";
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * List names and task titles are stored as plain text: line breaks and long
 * whitespace runs are collapsed, and Telegram HTML is escaped only at render
 * time. This keeps the database free of presentation markup.
 */
export function normalizeListName(value: string): string | null {
  const normalized = collapseWhitespace(value);
  if (normalized.length === 0) return null;
  return [...normalized].length <= LIST_NAME_MAX ? normalized : null;
}

export function normalizeListItemTitle(value: string): string | null {
  const normalized = collapseWhitespace(value);
  if (normalized.length === 0) return null;
  return [...normalized].length <= LIST_ITEM_TITLE_MAX ? normalized : null;
}

/**
 * Descriptions may span multiple lines, so line breaks are preserved. Empty
 * input (or the single "-" convention used by the bot) means "no description".
 */
export function normalizeListItemDescription(value: string): string | null | "empty" {
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  if ([...trimmed].length > LIST_ITEM_DESCRIPTION_MAX) return "empty";
  return trimmed;
}

/**
 * Accept only absolute http(s) URLs. `javascript:`, `data:` and other schemes
 * are rejected before the value ever reaches Telegram's HTML renderer.
 */
export function normalizeHttpUrl(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "-") return null;
  if (trimmed.length > LIST_ITEM_URL_MAX) return "invalid";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";
    if (!url.hostname) return "invalid";
    const normalized = url.toString();
    return normalized.length <= LIST_ITEM_URL_MAX ? normalized : "invalid";
  } catch {
    return "invalid";
  }
}
