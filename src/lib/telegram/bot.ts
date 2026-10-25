import { Bot } from "grammy";
import { getEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { handleTelegramUpdate } from "@/lib/bot/dispatcher";
import type { TelegramUpdate } from "@/lib/telegram/types";

/**
 * Create a grammY bot instance wired to the project's Telegram dispatcher.
 * The same instance serves long polling (`bot.start()`) and webhook updates
 * pushed through the Next.js route (`handleUpdate`).
 */
export function createBot(): Bot {
  const bot = new Bot(getEnv().TELEGRAM_BOT_TOKEN);
  bot.use(async (ctx, next) => {
    await handleTelegramUpdate(getDb(), ctx.update as unknown as TelegramUpdate);
    await next();
  });
  return bot;
}
