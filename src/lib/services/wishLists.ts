import type { Db } from "@/lib/db";
import { areFriends } from "./friends";
import {
  LIST_ITEM_DESCRIPTION_MAX,
  LIST_ITEM_TITLE_MAX,
  LIST_ITEM_URL_MAX,
  LIST_NAME_MAX,
} from "@/lib/validation";

export const WISH_PAGE_SIZE = 6;
export const WISH_ITEM_PAGE_SIZE = 5;

/**
 * Wish lists are always shared read-only. There is intentionally no permission
 * column: the owner is the only user who can modify the list or its items.
 */
export type WishRole = "OWNER" | "READ";

export type WishList = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  name: string;
  isDefault: boolean;
  role: WishRole;
  createdAt: Date;
  updatedAt: Date;
};

export type WishItem = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  url: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WishShare = {
  userId: string;
  firstName: string;
  telegramUsername: string | null;
  createdAt: Date;
};

export class WishListServiceError extends Error {
  constructor(
    public readonly code:
      | "INVALID_NAME"
      | "INVALID_TITLE"
      | "INVALID_DESCRIPTION"
      | "INVALID_URL"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "DEFAULT_LIST"
      | "NOT_FRIEND",
  ) {
    super(code);
    this.name = "WishListServiceError";
  }
}

type ListRow = {
  id: string;
  owner_user_id: string;
  owner_name: string;
  name: string;
  is_default: boolean;
  role: string;
  created_at: Date;
  updated_at: Date;
};

type ItemRow = {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  url: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapList(row: ListRow): WishList {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    name: row.name,
    isDefault: row.is_default,
    role: row.role === "OWNER" ? "OWNER" : "READ",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ItemRow): WishItem {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeName(name: string): string {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value || [...value].length > LIST_NAME_MAX) throw new WishListServiceError("INVALID_NAME");
  return value;
}

function normalizeTitle(title: string): string {
  const value = title.replace(/\s+/g, " ").trim();
  if (!value || [...value].length > LIST_ITEM_TITLE_MAX) {
    throw new WishListServiceError("INVALID_TITLE");
  }
  return value;
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (description === null || description === undefined) return null;
  const value = description.replace(/\r\n/g, "\n").trim();
  if (!value) return null;
  if ([...value].length > LIST_ITEM_DESCRIPTION_MAX) {
    throw new WishListServiceError("INVALID_DESCRIPTION");
  }
  return value;
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  const value = url.trim();
  if (!value) return null;
  if (value.length > LIST_ITEM_URL_MAX) throw new WishListServiceError("INVALID_URL");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new WishListServiceError("INVALID_URL");
    }
    if (!parsed.hostname) throw new WishListServiceError("INVALID_URL");
    const normalized = parsed.toString();
    if (normalized.length > LIST_ITEM_URL_MAX) {
      throw new WishListServiceError("INVALID_URL");
    }
    return normalized;
  } catch (error) {
    if (error instanceof WishListServiceError) throw error;
    throw new WishListServiceError("INVALID_URL");
  }
}

export function canEditWishList(list: WishList): boolean {
  return list.role === "OWNER";
}

const LIST_SELECT = `
  SELECT l.id, l.owner_user_id, l.name, l.is_default, l.created_at, l.updated_at,
         u.first_name AS owner_name,
         CASE WHEN l.owner_user_id = $2 THEN 'OWNER' ELSE 'READ' END AS role
  FROM wish_lists l
  JOIN users u ON u.id = l.owner_user_id
  LEFT JOIN wish_list_shares s
    ON s.list_id = l.id AND s.shared_with_user_id = $2
`;

/** Create the mandatory personal list if it does not exist yet. */
export async function ensureDefaultWishList(db: Db, userId: string): Promise<WishList> {
  const existing = await db.query<ListRow>(
    `${LIST_SELECT} WHERE l.owner_user_id = $1 AND l.is_default LIMIT 1`,
    [userId, userId],
  );
  if (existing.rows[0]) return mapList(existing.rows[0]);

  await db.query(
    `INSERT INTO wish_lists (owner_user_id, name, is_default, created_at, updated_at)
     VALUES ($1, 'Мои желания', true, now(), now())
     ON CONFLICT DO NOTHING`,
    [userId],
  );

  const created = await db.query<ListRow>(
    `${LIST_SELECT} WHERE l.owner_user_id = $1 AND l.is_default LIMIT 1`,
    [userId, userId],
  );
  if (!created.rows[0]) throw new WishListServiceError("NOT_FOUND");
  return mapList(created.rows[0]);
}

export async function listWishListsForUser(
  db: Db,
  userId: string,
): Promise<{ own: WishList[]; shared: WishList[] }> {
  await ensureDefaultWishList(db, userId);
  const result = await db.query<ListRow>(
    `${LIST_SELECT}
     WHERE l.owner_user_id = $1 OR s.shared_with_user_id = $1
     ORDER BY (l.owner_user_id = $1) DESC, l.is_default DESC, l.created_at ASC`,
    [userId, userId],
  );
  const lists = result.rows.map(mapList);
  return {
    own: lists.filter((list) => list.role === "OWNER"),
    shared: lists.filter((list) => list.role !== "OWNER"),
  };
}

export async function getWishListForUser(
  db: Db,
  listId: string,
  userId: string,
): Promise<WishList | null> {
  const result = await db.query<ListRow>(
    `${LIST_SELECT}
     WHERE l.id = $1 AND (l.owner_user_id = $2 OR s.shared_with_user_id = $2)
     LIMIT 1`,
    [listId, userId],
  );
  return result.rows[0] ? mapList(result.rows[0]) : null;
}

export async function createWishList(db: Db, userId: string, name: string): Promise<WishList> {
  const normalized = normalizeName(name);
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO wish_lists (owner_user_id, name, is_default, created_at, updated_at)
     VALUES ($1, $2, false, now(), now())
     RETURNING id`,
    [userId, normalized],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new WishListServiceError("NOT_FOUND");
  const list = await getWishListForUser(db, id, userId);
  if (!list) throw new WishListServiceError("NOT_FOUND");
  return list;
}

export async function renameWishList(
  db: Db,
  listId: string,
  userId: string,
  name: string,
): Promise<WishList> {
  const normalized = normalizeName(name);
  const updated = await db.query<{ id: string }>(
    `UPDATE wish_lists SET name = $1, updated_at = now()
     WHERE id = $2 AND owner_user_id = $3
     RETURNING id`,
    [normalized, listId, userId],
  );
  if (!updated.rows[0]) throw new WishListServiceError("NOT_FOUND");
  const list = await getWishListForUser(db, listId, userId);
  if (!list) throw new WishListServiceError("NOT_FOUND");
  return list;
}

export async function deleteWishList(
  db: Db,
  listId: string,
  userId: string,
): Promise<"deleted" | "not_found" | "default"> {
  const list = await getWishListForUser(db, listId, userId);
  if (!list || list.role !== "OWNER") return "not_found";
  if (list.isDefault) return "default";
  await db.query(`DELETE FROM wish_lists WHERE id = $1 AND owner_user_id = $2`, [listId, userId]);
  return "deleted";
}

export async function listWishItems(
  db: Db,
  listId: string,
  userId: string,
): Promise<{ list: WishList; items: WishItem[] } | null> {
  const list = await getWishListForUser(db, listId, userId);
  if (!list) return null;
  const result = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, created_at, updated_at
     FROM wish_list_items WHERE list_id = $1 ORDER BY created_at ASC, id ASC`,
    [listId],
  );
  return { list, items: result.rows.map(mapItem) };
}

async function writableList(db: Db, listId: string, userId: string): Promise<WishList> {
  const list = await getWishListForUser(db, listId, userId);
  if (!list) throw new WishListServiceError("NOT_FOUND");
  if (!canEditWishList(list)) throw new WishListServiceError("FORBIDDEN");
  return list;
}

export async function addWishItem(
  db: Db,
  listId: string,
  userId: string,
  input: { title: string; description?: string | null; url?: string | null },
): Promise<WishItem> {
  await writableList(db, listId, userId);
  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description);
  const url = normalizeUrl(input.url);
  const inserted = await db.query<ItemRow>(
    `INSERT INTO wish_list_items (list_id, title, description, url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     RETURNING id, list_id, title, description, url, created_at, updated_at`,
    [listId, title, description, url],
  );
  const row = inserted.rows[0];
  if (!row) throw new WishListServiceError("NOT_FOUND");
  return mapItem(row);
}

/**
 * Insert several items atomically. Wish lists only allow the owner; every
 * title/URL is validated inside the transaction so partial batches roll back.
 */
export async function addWishItems(
  db: Db,
  listId: string,
  userId: string,
  items: Array<{ title: string; url?: string | null }>,
): Promise<WishItem[]> {
  if (items.length === 0) return [];

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const listResult = await client.query<ListRow>(
      `${LIST_SELECT}
       WHERE l.id = $1 AND (l.owner_user_id = $2 OR s.shared_with_user_id = $2)
       LIMIT 1`,
      [listId, userId],
    );
    const listRow = listResult.rows[0];
    if (!listRow) throw new WishListServiceError("NOT_FOUND");
    if (!canEditWishList(mapList(listRow))) throw new WishListServiceError("FORBIDDEN");

    const created: WishItem[] = [];
    for (const input of items) {
      const title = normalizeTitle(input.title);
      const url = normalizeUrl(input.url);
      const inserted = await client.query<ItemRow>(
        `INSERT INTO wish_list_items (list_id, title, description, url, created_at, updated_at)
         VALUES ($1, $2, NULL, $3, now(), now())
         RETURNING id, list_id, title, description, url, created_at, updated_at`,
        [listId, title, url],
      );
      const row = inserted.rows[0];
      if (!row) throw new WishListServiceError("NOT_FOUND");
      created.push(mapItem(row));
    }

    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getWishItemForUser(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
): Promise<{ list: WishList; item: WishItem } | null> {
  const list = await getWishListForUser(db, listId, userId);
  if (!list) return null;
  const result = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, created_at, updated_at
     FROM wish_list_items WHERE id = $1 AND list_id = $2 LIMIT 1`,
    [itemId, listId],
  );
  const row = result.rows[0];
  return row ? { list, item: mapItem(row) } : null;
}

export async function updateWishItem(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
  patch: { title?: string; description?: string | null; url?: string | null },
): Promise<WishItem> {
  await writableList(db, listId, userId);
  const current = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, created_at, updated_at
     FROM wish_list_items WHERE id = $1 AND list_id = $2 LIMIT 1`,
    [itemId, listId],
  );
  const row = current.rows[0];
  if (!row) throw new WishListServiceError("NOT_FOUND");

  const title = patch.title === undefined ? row.title : normalizeTitle(patch.title);
  const description =
    patch.description === undefined ? row.description : normalizeDescription(patch.description);
  const url = patch.url === undefined ? row.url : normalizeUrl(patch.url);
  const updated = await db.query<ItemRow>(
    `UPDATE wish_list_items
     SET title = $1, description = $2, url = $3, updated_at = now()
     WHERE id = $4 AND list_id = $5
     RETURNING id, list_id, title, description, url, created_at, updated_at`,
    [title, description, url, itemId, listId],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) throw new WishListServiceError("NOT_FOUND");
  return mapItem(updatedRow);
}

export async function deleteWishItem(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
): Promise<void> {
  await writableList(db, listId, userId);
  const deleted = await db.query(
    `DELETE FROM wish_list_items WHERE id = $1 AND list_id = $2`,
    [itemId, listId],
  );
  if ((deleted.rowCount ?? 0) === 0) throw new WishListServiceError("NOT_FOUND");
}

export async function listWishShares(
  db: Db,
  listId: string,
  ownerId: string,
): Promise<WishShare[]> {
  const list = await getWishListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") throw new WishListServiceError("FORBIDDEN");
  const result = await db.query<{
    user_id: string;
    first_name: string;
    telegram_username: string | null;
    created_at: Date;
  }>(
    `SELECT u.id AS user_id, u.first_name, u.telegram_username, s.created_at
     FROM wish_list_shares s
     JOIN users u ON u.id = s.shared_with_user_id
     WHERE s.list_id = $1
     ORDER BY s.created_at ASC`,
    [listId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    firstName: row.first_name,
    telegramUsername: row.telegram_username,
    createdAt: row.created_at,
  }));
}

export async function shareWishList(
  db: Db,
  listId: string,
  ownerId: string,
  friendUserId: string,
): Promise<"shared" | "not_found" | "not_friend"> {
  const list = await getWishListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") return "not_found";
  if (friendUserId === ownerId) return "not_friend";
  if (!(await areFriends(db, ownerId, friendUserId))) return "not_friend";
  await db.query(
    `INSERT INTO wish_list_shares (list_id, shared_with_user_id, created_at)
     VALUES ($1, $2, now())
     ON CONFLICT (list_id, shared_with_user_id) DO NOTHING`,
    [listId, friendUserId],
  );
  return "shared";
}

export async function unshareWishList(
  db: Db,
  listId: string,
  ownerId: string,
  friendUserId: string,
): Promise<boolean> {
  const list = await getWishListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") return false;
  const deleted = await db.query(
    `DELETE FROM wish_list_shares WHERE list_id = $1 AND shared_with_user_id = $2`,
    [listId, friendUserId],
  );
  return (deleted.rowCount ?? 0) > 0;
}
