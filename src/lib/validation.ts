import { z } from "zod";
import { isValidTimeZone } from "./time";

export const REMINDER_TEXT_MAX = 1000;
export const FRIEND_USERNAME_MAX = 32;
export const LIST_NAME_MAX = 100;
export const LIST_ITEM_TITLE_MAX = 200;
export const LIST_ITEM_DESCRIPTION_MAX = 2000;
export const LIST_ITEM_URL_MAX = 500;
export const LIST_BULK_MAX_ITEMS = 100;

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

export type BulkListItem = {
  title: string;
  url: string | null;
};

export type BulkListLineError = {
  line: number;
  reason: "title_too_long" | "invalid_url";
};

export type BulkListParseResult = {
  items: BulkListItem[];
  errors: BulkListLineError[];
  totalLines: number;
  limitExceeded: boolean;
};

/**
 * Recognized copy/paste markers are only stripped at the start of a line.
 * Numeric markers require whitespace (or end of line) so values like "12.5 kg"
 * and "2024. Year in review" keep their leading numbers.
 */
const LEADING_LIST_MARKER =
  /^(?:\d{1,3}[.)](?:\s+|$)|[-*](?:\s+|$)|[•☐□]\s*|\[\s*[xX]?\s*\]\s*)/;

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

function stripLeadingListMarkers(raw: string): string {
  let value = raw.trimStart();
  // Handle stacked styles such as "1. [ ] Task" without touching text later
  // in the line.
  for (let index = 0; index < 8; index += 1) {
    const next = value.replace(LEADING_LIST_MARKER, "");
    if (next === value) break;
    value = next.trimStart();
  }
  return value.trim();
}

/** Remove sentence punctuation and unbalanced closing brackets from a URL. */
function trimUrlPunctuation(raw: string): string {
  let value = raw;
  while (/[.,;:!?]$/.test(value)) value = value.slice(0, -1);
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (value.endsWith(close)) {
      const opens = value.split(open).length - 1;
      const closes = value.split(close).length - 1;
      if (closes <= opens) break;
      value = value.slice(0, -1);
    }
  }
  return value;
}

/** Drop separators left behind when a URL is removed from the title. */
function trimTitleEdges(value: string): string {
  return value
    .replace(/^[\s\-–—:|,)\]}]+/, "")
    .replace(/[\s\-–—:|,([{]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const URL_WRAPPERS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

/**
 * Remove a URL from the surrounding text. Markdown links often look like
 * "Купить (https://example.com)" — after removing the URL the opening bracket
 * must not stay in the title.
 */
function removeUrlFromTitle(content: string, match: RegExpExecArray): string {
  const before = content.slice(0, match.index);
  const after = content.slice(match.index + match[0].length);
  let titleBefore = before;
  let titleAfter = after;

  const opener = /[([{]\s*$/.exec(before);
  if (opener) {
    const open = opener[0].trim();
    const close = URL_WRAPPERS[open];
    const afterTrimmed = after.replace(/^\s+/, "");
    if (close && (match[0].endsWith(close) || afterTrimmed.startsWith(close))) {
      titleBefore = before.slice(0, opener.index);
      titleAfter = afterTrimmed.startsWith(close) ? afterTrimmed.slice(1) : after;
    }
  }

  return trimTitleEdges(`${titleBefore} ${titleAfter}`);
}

/**
 * Parse one multiline Telegram message into independent list items.
 *
 * Empty and marker-only lines are ignored. The first http(s) URL on a line is
 * extracted into the item's `url` field so the renderer can keep it clickable;
 * the remaining text becomes the title. Invalid or over-limit lines are
 * reported with their original one-based line number instead of being silently
 * discarded.
 */
export function parseBulkListText(input: string): BulkListParseResult {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const items: BulkListItem[] = [];
  const errors: BulkListLineError[] = [];

  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const cleaned = stripLeadingListMarkers(rawLine);
    if (!cleaned) return;

    let content = cleaned;
    let url: string | null = null;
    const match = HTTP_URL_PATTERN.exec(content);
    if (match) {
      const normalized = normalizeHttpUrl(trimUrlPunctuation(match[0]));
      if (normalized === "invalid") {
        errors.push({ line, reason: "invalid_url" });
        return;
      }
      url = normalized;
      content = removeUrlFromTitle(content, match);
    } else {
      content = content.replace(/\s+/g, " ").trim();
    }

    // A line containing only a URL still becomes a valid item.
    const title = content || url;
    if (!title) return;
    if ([...title].length > LIST_ITEM_TITLE_MAX) {
      errors.push({ line, reason: "title_too_long" });
      return;
    }
    items.push({ title, url });
  });

  const limitExceeded = items.length > LIST_BULK_MAX_ITEMS;
  return {
    items: limitExceeded ? [] : items,
    errors,
    totalLines: lines.length,
    limitExceeded,
  };
}
