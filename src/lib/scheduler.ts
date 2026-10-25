import { getDb } from "@/lib/db";
import { GrammyTelegramSender } from "@/lib/telegram/api";
import { processRemindersOnce } from "./scheduler/index";

export { processRemindersOnce };
export type { SchedulerStats } from "./scheduler/index";

export async function runScheduledProcessing() {
  const db = getDb();
  const sender = new GrammyTelegramSender();
  return processRemindersOnce(db, sender);
}
