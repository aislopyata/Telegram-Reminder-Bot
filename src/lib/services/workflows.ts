import { z } from "zod";
import type { Db } from "@/lib/db";
import type { WorkflowState } from "@/generated/prisma/client";
import { draftSchema } from "@/lib/bot/draft";
import { logger } from "@/lib/logger";

export const workflowDataSchema = z.union([
  z.object({ kind: z.literal("draft"), draft: draftSchema }),
  z.object({ kind: z.literal("friend") }),
  z.object({
    kind: z.literal("timezone"),
    origin: z.enum(["onboarding", "settings"]),
  }),
]);

export type WorkflowData = z.infer<typeof workflowDataSchema>;
export type DraftWorkflowData = Extract<WorkflowData, { kind: "draft" }>;
export type TimezoneWorkflowData = Extract<WorkflowData, { kind: "timezone" }>;

export const WORKFLOW_TTL_MS = 30 * 60 * 1000;

export type LoadedWorkflow = {
  id: string;
  userId: string;
  state: WorkflowState;
  data: WorkflowData;
  messageId: number | null;
  expiresAt: Date;
};

type ConversationStateRow = {
  id: string;
  user_id: string;
  state: string;
  data: unknown;
  message_id: number | null;
  expires_at: Date;
};

function parseWorkflow(row: ConversationStateRow, now: Date): LoadedWorkflow | null {
  if (new Date(row.expires_at).getTime() <= now.getTime()) return null;
  const parsed = workflowDataSchema.safeParse(row.data);
  if (!parsed.success) return null;
  return {
    id: row.id,
    userId: row.user_id,
    state: row.state as WorkflowState,
    data: parsed.data,
    messageId: row.message_id === null ? null : Number(row.message_id),
    expiresAt: new Date(row.expires_at),
  };
}

/** Load a user's workflow state, deleting expired or malformed rows. */
export async function getWorkflow(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<LoadedWorkflow | null> {
  const result = await db.query<ConversationStateRow>(
    `SELECT id, user_id, state, data, message_id, expires_at
     FROM conversation_states
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const loaded = parseWorkflow(row, now);
  if (!loaded) {
    await db.query(`DELETE FROM conversation_states WHERE user_id = $1`, [userId]);
    return null;
  }
  return loaded;
}

export async function saveWorkflow(
  db: Db,
  userId: string,
  state: WorkflowState,
  data: WorkflowData,
  messageId: number | null = null,
  now: Date = new Date(),
): Promise<LoadedWorkflow> {
  const expiresAt = new Date(now.getTime() + WORKFLOW_TTL_MS);

  const updated = await db.query<ConversationStateRow>(
    `UPDATE conversation_states
     SET state = $2, data = $3::jsonb, message_id = $4, expires_at = $5, updated_at = now()
     WHERE user_id = $1
     RETURNING id, user_id, state, data, message_id, expires_at`,
    [userId, state, JSON.stringify(data), messageId, expiresAt],
  );
  let row: ConversationStateRow | undefined = updated.rows[0];
  if (!row) {
    const inserted = await db.query<ConversationStateRow>(
      `INSERT INTO conversation_states (user_id, state, data, message_id, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, now(), now())
       RETURNING id, user_id, state, data, message_id, expires_at`,
      [userId, state, JSON.stringify(data), messageId, expiresAt],
    );
    row = inserted.rows[0];
  }
  if (!row) throw new Error("Failed to save workflow state");

  const loaded = parseWorkflow(row, now);
  if (!loaded) throw new Error("Saved workflow state is invalid");
  return loaded;
}

export async function setWorkflowMessage(db: Db, userId: string, messageId: number): Promise<void> {
  await db.query(`UPDATE conversation_states SET message_id = $2 WHERE user_id = $1`, [userId, messageId]);
}

export async function deleteWorkflow(db: Db, userId: string): Promise<void> {
  await db.query(`DELETE FROM conversation_states WHERE user_id = $1`, [userId]);
}

export async function purgeExpiredWorkflows(db: Db, now: Date = new Date()): Promise<number> {
  const result = await db.query(
    `DELETE FROM conversation_states WHERE expires_at < $1`,
    [now],
  );
  const count = result.rowCount ?? 0;
  if (count > 0) logger.debug("workflows_purged", { count });
  return count;
}
