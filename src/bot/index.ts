import { config } from "dotenv";
import { schedule } from "node-cron";
import { createBot } from "@/lib/telegram/bot";
import { runScheduledProcessing } from "@/lib/scheduler";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const SCHEDULE_EXPRESSION = "* * * * *";

async function main(): Promise<void> {
  config();

  const bot = createBot();

  let running = false;
  const run = async () => {
    // Cron callbacks can overlap when a pass takes longer than a minute. The
    // database still enforces per-day claims, but skipping here avoids duplicate
    // work and duplicate "due" logs.
    if (running) {
      logger.warn("scheduled_processing_skipped_overlap");
      return;
    }
    running = true;
    try {
      const stats = await runScheduledProcessing();
      logger.info("scheduled_processing_completed", stats as unknown as Record<string, unknown>);
    } catch (error) {
      logger.error("scheduled_processing_failed", error);
    } finally {
      running = false;
    }
  };
  schedule(SCHEDULE_EXPRESSION, run);
  // Process anything already due immediately after a restart.
  void run();

  const mode = getEnv().BOT_MODE;
  if (mode === "polling") {
    await bot.start();
  }
}

main().catch((error) => {
  logger.error("bot_startup_failed", error);
  process.exit(1);
});
