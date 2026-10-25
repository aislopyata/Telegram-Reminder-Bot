import { Api } from "grammy";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TelegramApiError } from "./errors";
import type { EditResult, InlineKeyboard, TelegramSender } from "./types";

export const PARSE_MODE_HTML = "HTML" as const;
export const DELETE_MESSAGE_MARKUP = { inline_keyboard: [] as never[] };

function extractRetryAfter(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  const match = /retry after (\d+)/i.exec(error.message);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractErrorStatus(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  // grammY's HttpError stores status on the error object in some versions.
  const candidate = error as Error & { error_code?: number; status?: number };
  if (typeof candidate.error_code === "number") return candidate.error_code;
  if (typeof candidate.status === "number") return candidate.status;
  return undefined;
}

function shouldDeleteMarkup(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("message is not modified") ||
    message.includes("there is no text in the message to edit")
  );
}

function isPermanent(status: number | undefined): boolean {
  if (typeof status !== "number") return false;
  if (status === 403 || status === 400) return true;
  return false;
}

export class GrammyTelegramSender implements TelegramSender {
  private api: Api;

  constructor(token?: string) {
    this.api = new Api(token ?? getEnv().TELEGRAM_BOT_TOKEN);
  }

  async sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number> {
    try {
      const other = {
        parse_mode: PARSE_MODE_HTML,
        reply_markup: keyboard,
        disable_web_page_preview: true,
      } as Record<string, unknown>;
      const message = await this.api.sendMessage(chatId, text, other);
      return message.message_id;
    } catch (error) {
      const status = extractErrorStatus(error);
      const retryAfterSeconds = extractRetryAfter(error);
      throw new TelegramApiError("sendMessage failed", {
        status,
        retryAfterSeconds,
        permanent: isPermanent(status),
        cause: error,
      });
    }
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult> {
    try {
      const other = {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: PARSE_MODE_HTML,
        reply_markup: keyboard ?? undefined,
        disable_web_page_preview: true,
      } as Record<string, unknown>;
      await (this.api.editMessageText as unknown as (text: string, other: Record<string, unknown>) => Promise<unknown>)(
        text,
        other,
      );
      return "edited";
    } catch (error) {
      if (shouldDeleteMarkup(error)) return "unchanged";

      // Removing markup when editing text to a different shape can fail.
      const status = extractErrorStatus(error);
      logger.debug("telegram_edit_failed", {
        chatId,
        messageId,
        status,
      });
      throw new TelegramApiError("editMessageText failed", {
        status,
        retryAfterSeconds: extractRetryAfter(error),
        permanent: isPermanent(status),
        cause: error,
      });
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean,
  ): Promise<void> {
    try {
      await this.api.answerCallbackQuery(callbackQueryId, {
        text,
        show_alert: showAlert,
      });
    } catch {
      // Answering expired callbacks must never crash the handler.
      logger.debug("telegram_answer_callback_failed", {
        textPreview: text?.slice(0, 80),
      });
    }
  }
}

/** For unit tests: provide deterministic responses without network calls. */
export class InMemoryTelegramSender implements TelegramSender {
  public sent: Array<{ chatId: string; text: string; keyboard?: InlineKeyboard }> = [];
  public edited: Array<{ chatId: string; messageId: number; text: string; keyboard?: InlineKeyboard }> = [];
  public answers: Array<{ id: string; text?: string; showAlert?: boolean }> = [];

  async sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<number> {
    this.sent.push({ chatId, text, keyboard });
    return this.sent.length;
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult> {
    this.edited.push({ chatId, messageId, text, keyboard });
    return "edited";
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean,
  ): Promise<void> {
    this.answers.push({ id: callbackQueryId, text, showAlert });
  }

  clear(): void {
    this.sent = [];
    this.edited = [];
    this.answers = [];
  }
}
