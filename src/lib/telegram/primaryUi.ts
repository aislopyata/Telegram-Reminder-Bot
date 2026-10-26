import type { Db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPrimaryMessageId, setPrimaryMessageId } from "@/lib/services/uiState";
import type { EditResult, InlineKeyboard, TelegramSender } from "./types";

/**
 * Keeps one "primary" bot message per (user, chat).
 *
 * Any send to the update's own chat first tries to edit the persisted primary
 * message. Only if that message disappeared (deleted, too old, ...) do we send
 * a replacement and remember its id. Sends to other chats (friend
 * notifications, scheduled reminders) pass straight through, so delivery stays
 * independent from the interactive UI.
 */
export class PrimaryUiSender implements TelegramSender {
  constructor(
    private readonly db: Db,
    private readonly inner: TelegramSender,
    private readonly chatId: string,
    private readonly resolveUserId: () => Promise<string | null>,
  ) {}

  private async userId(): Promise<string | null> {
    try {
      return await this.resolveUserId();
    } catch (error) {
      logger.warn("primary_ui_user_resolve_failed", {
        chatId: this.chatId,
        error: String(error).slice(0, 200),
      });
      return null;
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number> {
    if (chatId !== this.chatId) {
      return this.inner.sendMessage(chatId, text, keyboard);
    }

    const userId = await this.userId();
    if (!userId) {
      return this.inner.sendMessage(chatId, text, keyboard);
    }

    const existing = await getPrimaryMessageId(this.db, userId, chatId);
    if (existing !== null) {
      try {
        const result = await this.inner.editMessageText(chatId, existing, text, keyboard);
        if (result !== "unavailable") {
          await setPrimaryMessageId(this.db, userId, chatId, existing);
          return existing;
        }
      } catch (error) {
        // Most commonly the message was deleted or is too old to edit. Fall
        // through and replace it instead of losing the update entirely.
        logger.debug("primary_ui_edit_failed", {
          chatId,
          messageId: existing,
          error: String(error).slice(0, 200),
        });
      }
    }

    const messageId = await this.inner.sendMessage(chatId, text, keyboard);
    await setPrimaryMessageId(this.db, userId, chatId, messageId);
    return messageId;
  }

  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult> {
    const result = await this.inner.editMessageText(chatId, messageId, text, keyboard);
    if (chatId === this.chatId && result !== "unavailable") {
      const userId = await this.userId();
      if (userId) await setPrimaryMessageId(this.db, userId, chatId, messageId);
    }
    return result;
  }

  answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean,
  ): Promise<void> {
    return this.inner.answerCallbackQuery(callbackQueryId, text, showAlert);
  }
}
