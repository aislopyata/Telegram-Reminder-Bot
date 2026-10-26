import type { Db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * The bot keeps one primary interface message per (user, chat). All routine
 * navigation edits that message in place. The id is persisted because Telegram
 * updates can be handled by different processes/restarts.
 */
export async function getPrimaryMessageId(
  db: Db,
  userId: string,
  chatId: string,
): Promise<number | null> {
  try {
    const result = await db.query<{ message_id: string | null }>(
      `SELECT message_id FROM ui_state WHERE user_id = $1 AND chat_id = $2 LIMIT 1`,
      [userId, chatId],
    );
    const value = result.rows[0]?.message_id;
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  } catch (error) {
    // Graceful degradation until the additive migration has been applied.
    logger.warn("ui_state_read_failed", { userId, chatId, error: String(error).slice(0, 200) });
    return null;
  }
}

export async function setPrimaryMessageId(
  db: Db,
  userId: string,
  chatId: string,
  messageId: number,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO ui_state (user_id, chat_id, message_id, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id, chat_id)
       DO UPDATE SET message_id = EXCLUDED.message_id, updated_at = now()`,
      [userId, chatId, messageId],
    );
  } catch (error) {
    logger.warn("ui_state_write_failed", { userId, chatId, error: String(error).slice(0, 200) });
  }
}

export async function clearPrimaryMessageId(
  db: Db,
  userId: string,
  chatId: string,
): Promise<void> {
  try {
    await db.query(`DELETE FROM ui_state WHERE user_id = $1 AND chat_id = $2`, [userId, chatId]);
  } catch (error) {
    logger.warn("ui_state_clear_failed", { userId, chatId, error: String(error).slice(0, 200) });
  }
}
