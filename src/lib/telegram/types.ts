export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date?: number;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InlineButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboard = {
  inline_keyboard: InlineButton[][];
};

export type EditResult = "edited" | "unchanged" | "unavailable";

export interface TelegramSender {
  sendMessage(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<number>;
  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<EditResult>;
  answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert?: boolean,
  ): Promise<void>;
}
