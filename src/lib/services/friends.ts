import type { Db } from "@/lib/db";
import { findUserByUsername } from "./users";

export function orderedPair(a: string, b: string): [string, string] {
  // ids are bigint identity values serialized as strings; compare numerically
  // so the friendships_order_chk (user_a_id < user_b_id) constraint holds.
  return BigInt(a) <= BigInt(b) ? [a, b] : [b, a];
}

export function pairKey(a: string, b: string): string {
  return orderedPair(a, b).join(":");
}

export type FriendUser = {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string;
  timeZone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FriendUserRow = {
  id: string;
  telegram_user_id: string;
  telegram_username: string | null;
  first_name: string;
  time_zone: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapFriendUser(row: FriendUserRow): FriendUser {
  return {
    id: row.id,
    telegramUserId: row.telegram_user_id,
    telegramUsername: row.telegram_username,
    firstName: row.first_name,
    timeZone: row.time_zone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type FriendRequestItem = {
  id: string;
  requesterId: string;
  recipientId: string;
  pairKey: string;
  status: string;
  createdAt: Date;
  requester: { firstName: string };
};

export async function areFriends(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [userAId, userBId] = orderedPair(a, b);
  const result = await db.query<{ id: string }>(
    `SELECT id FROM friendships
     WHERE user_a_id = $1 AND user_b_id = $2
     LIMIT 1`,
    [userAId, userBId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type SendFriendRequestResult =
  | { status: "sent"; request: FriendRequestItem; target: FriendUser }
  | { status: "not_found" }
  | { status: "self" }
  | { status: "already_friends" }
  | { status: "already_pending" }
  | { status: "incoming_pending" };

export async function sendFriendRequest(
  db: Db,
  requesterId: string,
  rawUsername: string,
): Promise<SendFriendRequestResult> {
  const target = await findUserByUsername(db, rawUsername);
  if (!target) return { status: "not_found" };
  const targetUser: FriendUser = {
    id: target.id,
    telegramUserId: target.telegramUserId,
    telegramUsername: target.telegramUsername,
    firstName: target.firstName,
    timeZone: target.timeZone,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  };
  if (targetUser.id === requesterId) return { status: "self" };
  if (await areFriends(db, requesterId, targetUser.id)) return { status: "already_friends" };

  const key = pairKey(requesterId, targetUser.id);
  const existing = await db.query<{ id: string; status: string; requester_id: string }>(
    `SELECT id, status, requester_id FROM friend_requests WHERE pair_key = $1 LIMIT 1`,
    [key],
  );

  const previous = existing.rows[0];
  if (previous && previous.status === "PENDING") {
    return {
      status:
        previous.requester_id === requesterId
          ? "already_pending"
          : "incoming_pending",
    };
  }

  // A pair has at most one request row (unique pair_key). Reuse it after a
  // rejection/cancellation instead of hitting the unique index.
  const row = previous
    ? (
        await db.query<FriendRequestItem>(
          `UPDATE friend_requests
           SET requester_id = $2, recipient_id = $3, status = 'PENDING',
               created_at = now(), updated_at = now()
           WHERE id = $1
           RETURNING id, requester_id, recipient_id, pair_key, status, created_at`,
          [previous.id, requesterId, targetUser.id],
        )
      ).rows[0]
    : (
        await db.query<FriendRequestItem>(
          `INSERT INTO friend_requests (requester_id, recipient_id, pair_key, status, created_at, updated_at)
           VALUES ($1, $2, $3, 'PENDING', now(), now())
           RETURNING id, requester_id, recipient_id, pair_key, status, created_at`,
          [requesterId, targetUser.id, key],
        )
      ).rows[0];
  if (!row) return { status: "not_found" };
  return { status: "sent", request: row, target: targetUser };
}

export type AcceptFriendRequestResult =
  | { status: "accepted"; requester: FriendUser }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "gone" };

export async function acceptFriendRequest(
  db: Db,
  requestId: string,
  recipientUserId: string,
): Promise<AcceptFriendRequestResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<FriendUserRow>(
      `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, created_at, updated_at
       FROM users WHERE id = (
         SELECT requester_id FROM friend_requests WHERE id = $1 LIMIT 1
       ) LIMIT 1`,
      [requestId],
    );
    const requesterRow = result.rows[0];
    const requester = requesterRow ? mapFriendUser(requesterRow) : null;
    if (!requester) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }

    const request = await client.query<{ id: string; requester_id: string; recipient_id: string; status: string }>(
      `SELECT id, requester_id, recipient_id, status FROM friend_requests WHERE id = $1 LIMIT 1`,
      [requestId],
    );
    const target = request.rows[0];
    if (!target || target.recipient_id !== recipientUserId || target.status !== "PENDING") {
      await client.query("ROLLBACK");
      return { status: "gone" };
    }

    const changed = await client.query(
      `UPDATE friend_requests SET status = 'ACCEPTED', updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
      [requestId],
    );
    if ((changed.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { status: "gone" };
    }

    const [userAId, userBId] = orderedPair(recipientUserId, target.requester_id);
    await client.query(
      `INSERT INTO friendships (user_a_id, user_b_id, created_at) VALUES ($1, $2, now())`,
      [userAId, userBId],
    );
    await client.query("COMMIT");
    return { status: "accepted", requester };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type RejectFriendRequestResult =
  | { status: "rejected"; requester: FriendUser }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "gone" };

export async function rejectFriendRequest(
  db: Db,
  requestId: string,
  recipientUserId: string,
): Promise<RejectFriendRequestResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query<{
      id: string;
      requester_id: string;
      recipient_id: string;
      status: string;
    }>(`SELECT id, requester_id, recipient_id, status FROM friend_requests WHERE id = $1 LIMIT 1`, [requestId]);
    const target = request.rows[0];
    if (!target || target.recipient_id !== recipientUserId || target.status !== "PENDING") {
      await client.query("ROLLBACK");
      return { status: "gone" };
    }

    const changed = await client.query(
      `UPDATE friend_requests SET status = 'REJECTED', updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
      [requestId],
    );
    if ((changed.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { status: "gone" };
    }

    const requester = await client.query<FriendUserRow>(
      `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      [target.requester_id],
    );
    const requesterRecord = requester.rows[0] ? mapFriendUser(requester.rows[0]) : null;
    if (!requesterRecord) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }

    await client.query("COMMIT");
    return { status: "rejected", requester: requesterRecord };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listFriends(db: Db, userId: string): Promise<FriendUser[]> {
  const result = await db.query<FriendUserRow>(
    `SELECT u.id, u.telegram_user_id, u.telegram_username, u.first_name, u.time_zone, u.created_at, u.updated_at
     FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.user_a_id = $1 THEN f.user_b_id ELSE f.user_a_id END
     WHERE f.user_a_id = $1 OR f.user_b_id = $1
     ORDER BY u.created_at ASC`,
    [userId],
  );
  return result.rows.map((row) => mapFriendUser(row));
}

export async function listIncomingRequests(db: Db, userId: string): Promise<FriendRequestItem[]> {
  const result = await db.query<{
    id: string;
    requester_id: string;
    recipient_id: string;
    pair_key: string;
    status: string;
    created_at: Date;
    requester_first_name: string;
  }>(
    `SELECT fr.id, fr.requester_id, fr.recipient_id, fr.pair_key, fr.status, fr.created_at,
            u.first_name AS requester_first_name
     FROM friend_requests fr
     JOIN users u ON u.id = fr.requester_id
     WHERE fr.recipient_id = $1 AND fr.status = 'PENDING'
     ORDER BY fr.created_at DESC`,
    [userId],
  );
  // The join above returns snake_case columns; map to the camelCase shape used by callers.
  return result.rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    recipientId: row.recipient_id,
    pairKey: row.pair_key,
    status: row.status,
    createdAt: row.created_at,
    requester: { firstName: row.requester_first_name },
  }));
}

export async function countIncomingRequests(db: Db, userId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM friend_requests WHERE recipient_id = $1 AND status = 'PENDING'`,
    [userId],
  );
  const row = result.rows[0];
  return Number(row?.count ?? 0);
}

export type RemovedSharedReminderNotice = {
  ownerTelegramUserId: string;
  reminderId: string;
  text: string;
};

export type RemoveFriendResult =
  | { status: "removed"; friend: FriendUser; notices: RemovedSharedReminderNotice[] }
  | { status: "not_friends" };

export async function removeFriend(
  db: Db,
  userId: string,
  friendUserId: string,
): Promise<RemoveFriendResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const [userAId, userBId] = orderedPair(userId, friendUserId);
    const friendship = await client.query<{ id: string }>(
      `SELECT id FROM friendships WHERE user_a_id = $1 AND user_b_id = $2 LIMIT 1`,
      [userAId, userBId],
    );
    if ((friendship.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { status: "not_friends" };
    }

    const friend = await client.query<FriendUserRow>(
      `SELECT id, telegram_user_id, telegram_username, first_name, time_zone, created_at, updated_at
       FROM users WHERE id = $1 LIMIT 1`,
      [friendUserId],
    );
    const friendRow = friend.rows[0];
    if (!friendRow) {
      await client.query("ROLLBACK");
      return { status: "not_friends" };
    }
    const friendRecord: FriendUser = {
      id: friendRow.id,
      telegramUserId: friendRow.telegram_user_id,
      telegramUsername: friendRow.telegram_username,
      firstName: friendRow.first_name,
      timeZone: friendRow.time_zone,
      createdAt: friendRow.created_at,
      updatedAt: friendRow.updated_at,
    };

    await client.query(`DELETE FROM friendships WHERE user_a_id = $1 AND user_b_id = $2`, [
      userAId,
      userBId,
    ]);
    await client.query(
      `UPDATE friend_requests SET status = 'CANCELLED', updated_at = now() WHERE pair_key = $1 AND status = 'ACCEPTED'`,
      [pairKey(userId, friendUserId)],
    );

    // Remove the former friend only from the *other* side of each shared
    // reminder: the owner must keep receiving their own reminder.
    const shared = await client.query<{ id: string; owner_id: string; text: string }>(
      `SELECT r.id, r.owner_id, r.text
       FROM reminders r
       JOIN reminder_recipients rr ON rr.reminder_id = r.id
       WHERE (r.status = 'ACTIVE' OR r.status = 'DISABLED')
         AND ((r.owner_id = $1 AND rr.recipient_user_id = $2)
           OR (r.owner_id = $2 AND rr.recipient_user_id = $1))`,
      [userId, friendUserId],
    );

    const notices: RemovedSharedReminderNotice[] = [];
    for (const row of shared.rows) {
      const removeUserId = row.owner_id === userId ? friendUserId : userId;
      await client.query(
        `DELETE FROM reminder_recipients WHERE reminder_id = $1 AND recipient_user_id = $2`,
        [row.id, removeUserId],
      );
      if (row.owner_id === userId) continue;
      const owner = await client.query<{ telegram_user_id: string; first_name: string; telegram_username: string | null }>(
        `SELECT telegram_user_id, first_name, telegram_username FROM users WHERE id = $1 LIMIT 1`,
        [row.owner_id],
      );
      const ownerRow = owner.rows[0];
      if (ownerRow) {
        notices.push({
          ownerTelegramUserId: ownerRow.telegram_user_id,
          reminderId: row.id,
          text: row.text,
        });
      }
    }

    await client.query("COMMIT");
    return { status: "removed", friend: friendRecord, notices };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
