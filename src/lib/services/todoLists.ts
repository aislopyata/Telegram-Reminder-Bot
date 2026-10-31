import type { Db } from "@/lib/db";
import { areFriends } from "./friends";
import { parseLocalTime } from "@/lib/time";
import { LIST_ITEM_DESCRIPTION_MAX, LIST_ITEM_URL_MAX, LIST_NAME_MAX, LIST_ITEM_TITLE_MAX } from "@/lib/validation";

export const TODO_PAGE_SIZE = 6;
export const TODO_ITEM_PAGE_SIZE = 5;

export type TodoPermission = "READ" | "EDIT";
export type TodoRole = "OWNER" | TodoPermission;

export type TodoList = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  name: string;
  isDefault: boolean;
  role: TodoRole;
  createdAt: Date;
  updatedAt: Date;
};

export type TodoItem = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  url: string | null;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TodoShare = {
  userId: string;
  firstName: string;
  telegramUsername: string | null;
  permission: TodoPermission;
  createdAt: Date;
};

export type TodoListReminderSettings = {
  listId: string;
  enabled: boolean;
  reminderTime: string | null;
  lastNotifiedDate: string | null;
  updatedAt: Date | null;
};

export class ListServiceError extends Error {
  constructor(
    public readonly code:
      | "INVALID_NAME"
      | "INVALID_TITLE"
      | "INVALID_DESCRIPTION"
      | "INVALID_URL"
      | "INVALID_TIME"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "DEFAULT_LIST"
      | "NOT_FRIEND",
  ) {
    super(code);
    this.name = "ListServiceError";
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
  is_completed: boolean;
  created_at: Date;
  updated_at: Date;
};

function mapList(row: ListRow): TodoList {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    name: row.name,
    isDefault: row.is_default,
    role: row.role === "OWNER" ? "OWNER" : row.role === "EDIT" ? "EDIT" : "READ",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ItemRow): TodoItem {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    url: row.url,
    isCompleted: row.is_completed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeName(name: string): string {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value || [...value].length > LIST_NAME_MAX) throw new ListServiceError("INVALID_NAME");
  return value;
}

function normalizeTitle(title: string): string {
  const value = title.replace(/\s+/g, " ").trim();
  if (!value || [...value].length > LIST_ITEM_TITLE_MAX) throw new ListServiceError("INVALID_TITLE");
  return value;
}

function normalizeDescription(description: string | null | undefined): string | null {
  if (description === null || description === undefined) return null;
  const value = description.replace(/\r\n/g, "\n").trim();
  if (!value) return null;
  if ([...value].length > LIST_ITEM_DESCRIPTION_MAX) throw new ListServiceError("INVALID_DESCRIPTION");
  return value;
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  const value = url.trim();
  if (!value) return null;
  if (value.length > LIST_ITEM_URL_MAX) throw new ListServiceError("INVALID_URL");
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new ListServiceError("INVALID_URL");
    }
    if (!parsed.hostname) throw new ListServiceError("INVALID_URL");
    const normalized = parsed.toString();
    if (normalized.length > LIST_ITEM_URL_MAX) throw new ListServiceError("INVALID_URL");
    return normalized;
  } catch (error) {
    if (error instanceof ListServiceError) throw error;
    throw new ListServiceError("INVALID_URL");
  }
}

export function canEditTodoList(list: TodoList): boolean {
  return list.role === "OWNER" || list.role === "EDIT";
}

const LIST_SELECT = `
  SELECT l.id, l.owner_user_id, l.name, l.is_default, l.created_at, l.updated_at,
         u.first_name AS owner_name,
         CASE WHEN l.owner_user_id = $2 THEN 'OWNER' ELSE s.permission END AS role
  FROM todo_lists l
  JOIN users u ON u.id = l.owner_user_id
  LEFT JOIN todo_list_shares s
    ON s.list_id = l.id AND s.shared_with_user_id = $2
`;

/** Create the mandatory personal list if it does not exist yet. */
export async function ensureDefaultTodoList(db: Db, userId: string): Promise<TodoList> {
  const existing = await db.query<ListRow>(
    `${LIST_SELECT} WHERE l.owner_user_id = $1 AND l.is_default LIMIT 1`,
    [userId, userId],
  );
  if (existing.rows[0]) return mapList(existing.rows[0]);

  await db.query(
    `INSERT INTO todo_lists (owner_user_id, name, is_default, created_at, updated_at)
     VALUES ($1, 'Мои задачи', true, now(), now())
     ON CONFLICT DO NOTHING`,
    [userId],
  );

  const created = await db.query<ListRow>(
    `${LIST_SELECT} WHERE l.owner_user_id = $1 AND l.is_default LIMIT 1`,
    [userId, userId],
  );
  if (!created.rows[0]) throw new ListServiceError("NOT_FOUND");
  return mapList(created.rows[0]);
}

export async function listTodoListsForUser(
  db: Db,
  userId: string,
): Promise<{ own: TodoList[]; shared: TodoList[] }> {
  await ensureDefaultTodoList(db, userId);
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

export async function getTodoListForUser(
  db: Db,
  listId: string,
  userId: string,
): Promise<TodoList | null> {
  const result = await db.query<ListRow>(
    `${LIST_SELECT}
     WHERE l.id = $1 AND (l.owner_user_id = $2 OR s.shared_with_user_id = $2)
     LIMIT 1`,
    [listId, userId],
  );
  return result.rows[0] ? mapList(result.rows[0]) : null;
}

export async function createTodoList(db: Db, userId: string, name: string): Promise<TodoList> {
  const normalized = normalizeName(name);
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO todo_lists (owner_user_id, name, is_default, created_at, updated_at)
     VALUES ($1, $2, false, now(), now())
     RETURNING id`,
    [userId, normalized],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new ListServiceError("NOT_FOUND");
  const list = await getTodoListForUser(db, id, userId);
  if (!list) throw new ListServiceError("NOT_FOUND");
  return list;
}

export async function renameTodoList(
  db: Db,
  listId: string,
  userId: string,
  name: string,
): Promise<TodoList> {
  const normalized = normalizeName(name);
  const updated = await db.query<{ id: string }>(
    `UPDATE todo_lists SET name = $1, updated_at = now()
     WHERE id = $2 AND owner_user_id = $3
     RETURNING id`,
    [normalized, listId, userId],
  );
  if (!updated.rows[0]) throw new ListServiceError("NOT_FOUND");
  const list = await getTodoListForUser(db, listId, userId);
  if (!list) throw new ListServiceError("NOT_FOUND");
  return list;
}

export async function deleteTodoList(
  db: Db,
  listId: string,
  userId: string,
): Promise<"deleted" | "not_found" | "default"> {
  const list = await getTodoListForUser(db, listId, userId);
  if (!list || list.role !== "OWNER") return "not_found";
  if (list.isDefault) return "default";
  await db.query(`DELETE FROM todo_lists WHERE id = $1 AND owner_user_id = $2`, [listId, userId]);
  return "deleted";
}

async function ownedTodoList(db: Db, listId: string, userId: string): Promise<TodoList> {
  const list = await getTodoListForUser(db, listId, userId);
  if (!list || list.role !== "OWNER") throw new ListServiceError("NOT_FOUND");
  return list;
}

export async function getTodoListReminderSettings(
  db: Db,
  listId: string,
  userId: string,
): Promise<TodoListReminderSettings> {
  await ownedTodoList(db, listId, userId);
  const result = await db.query<{
    reminder_time: string;
    is_enabled: boolean;
    last_notified_date: string | null;
    updated_at: Date;
  }>(
    `SELECT reminder_time::text AS reminder_time, is_enabled,
            last_notified_date::text AS last_notified_date, updated_at
     FROM todo_list_reminders
     WHERE list_id = $1
     LIMIT 1`,
    [listId],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      listId,
      enabled: false,
      reminderTime: null,
      lastNotifiedDate: null,
      updatedAt: null,
    };
  }
  return {
    listId,
    enabled: row.is_enabled,
    reminderTime: row.reminder_time.slice(0, 5),
    lastNotifiedDate: row.last_notified_date,
    updatedAt: row.updated_at,
  };
}

export async function setTodoListReminder(
  db: Db,
  listId: string,
  userId: string,
  time: string,
): Promise<TodoListReminderSettings> {
  await ownedTodoList(db, listId, userId);
  const parsed = parseLocalTime(time);
  if (!parsed) throw new ListServiceError("INVALID_TIME");
  const normalized = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;

  await db.query(
    `INSERT INTO todo_list_reminders (list_id, reminder_time, is_enabled, updated_at)
     VALUES ($1, $2::time, true, now())
     ON CONFLICT (list_id) DO UPDATE
       SET reminder_time = EXCLUDED.reminder_time,
           is_enabled = true,
           updated_at = now()`,
    [listId, normalized],
  );
  return getTodoListReminderSettings(db, listId, userId);
}

export async function disableTodoListReminder(
  db: Db,
  listId: string,
  userId: string,
): Promise<TodoListReminderSettings> {
  await ownedTodoList(db, listId, userId);
  await db.query(
    `INSERT INTO todo_list_reminders (list_id, reminder_time, is_enabled, updated_at)
     VALUES ($1, '00:00'::time, false, now())
     ON CONFLICT (list_id) DO UPDATE
       SET is_enabled = false,
           updated_at = now()`,
    [listId],
  );
  return getTodoListReminderSettings(db, listId, userId);
}

export async function listTodoItems(
  db: Db,
  listId: string,
  userId: string,
): Promise<{ list: TodoList; items: TodoItem[] } | null> {
  const list = await getTodoListForUser(db, listId, userId);
  if (!list) return null;
  const result = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, is_completed, created_at, updated_at
     FROM todo_items WHERE list_id = $1 ORDER BY created_at ASC, id ASC`,
    [listId],
  );
  return { list, items: result.rows.map(mapItem) };
}

async function writableList(db: Db, listId: string, userId: string): Promise<TodoList> {
  const list = await getTodoListForUser(db, listId, userId);
  if (!list) throw new ListServiceError("NOT_FOUND");
  if (!canEditTodoList(list)) throw new ListServiceError("FORBIDDEN");
  return list;
}

export async function addTodoItem(
  db: Db,
  listId: string,
  userId: string,
  input: { title: string; description?: string | null; url?: string | null },
): Promise<TodoItem> {
  await writableList(db, listId, userId);
  const title = normalizeTitle(input.title);
  const description = normalizeDescription(input.description);
  const url = normalizeUrl(input.url);
  const inserted = await db.query<ItemRow>(
    `INSERT INTO todo_items (list_id, title, description, url, is_completed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, false, now(), now())
     RETURNING id, list_id, title, description, url, is_completed, created_at, updated_at`,
    [listId, title, description, url],
  );
  const row = inserted.rows[0];
  if (!row) throw new ListServiceError("NOT_FOUND");
  return mapItem(row);
}

/**
 * Insert several items atomically. Permissions and every title/URL are checked
 * inside the transaction, so a failure on item N rolls back items 1..N-1 too.
 */
export async function addTodoItems(
  db: Db,
  listId: string,
  userId: string,
  items: Array<{ title: string; url?: string | null }>,
): Promise<TodoItem[]> {
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
    if (!listRow) throw new ListServiceError("NOT_FOUND");
    if (!canEditTodoList(mapList(listRow))) throw new ListServiceError("FORBIDDEN");

    const created: TodoItem[] = [];
    for (const input of items) {
      const title = normalizeTitle(input.title);
      const url = normalizeUrl(input.url);
      const inserted = await client.query<ItemRow>(
        `INSERT INTO todo_items (list_id, title, description, url, is_completed, created_at, updated_at)
         VALUES ($1, $2, NULL, $3, false, now(), now())
         RETURNING id, list_id, title, description, url, is_completed, created_at, updated_at`,
        [listId, title, url],
      );
      const row = inserted.rows[0];
      if (!row) throw new ListServiceError("NOT_FOUND");
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

export async function getTodoItemForUser(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
): Promise<{ list: TodoList; item: TodoItem } | null> {
  const list = await getTodoListForUser(db, listId, userId);
  if (!list) return null;
  const result = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, is_completed, created_at, updated_at
     FROM todo_items WHERE id = $1 AND list_id = $2 LIMIT 1`,
    [itemId, listId],
  );
  const row = result.rows[0];
  return row ? { list, item: mapItem(row) } : null;
}

export async function updateTodoItem(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
  patch: { title?: string; description?: string | null; url?: string | null },
): Promise<TodoItem> {
  await writableList(db, listId, userId);
  const current = await db.query<ItemRow>(
    `SELECT id, list_id, title, description, url, is_completed, created_at, updated_at
     FROM todo_items WHERE id = $1 AND list_id = $2 LIMIT 1`,
    [itemId, listId],
  );
  const row = current.rows[0];
  if (!row) throw new ListServiceError("NOT_FOUND");

  const title = patch.title === undefined ? row.title : normalizeTitle(patch.title);
  const description =
    patch.description === undefined ? row.description : normalizeDescription(patch.description);
  const url = patch.url === undefined ? row.url : normalizeUrl(patch.url);
  const updated = await db.query<ItemRow>(
    `UPDATE todo_items
     SET title = $1, description = $2, url = $3, updated_at = now()
     WHERE id = $4 AND list_id = $5
     RETURNING id, list_id, title, description, url, is_completed, created_at, updated_at`,
    [title, description, url, itemId, listId],
  );
  const updatedRow = updated.rows[0];
  if (!updatedRow) throw new ListServiceError("NOT_FOUND");
  return mapItem(updatedRow);
}

export async function setTodoItemCompleted(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
  completed: boolean,
): Promise<TodoItem> {
  await writableList(db, listId, userId);
  const updated = await db.query<ItemRow>(
    `UPDATE todo_items SET is_completed = $1, updated_at = now()
     WHERE id = $2 AND list_id = $3
     RETURNING id, list_id, title, description, url, is_completed, created_at, updated_at`,
    [completed, itemId, listId],
  );
  const row = updated.rows[0];
  if (!row) throw new ListServiceError("NOT_FOUND");
  return mapItem(row);
}

export async function deleteTodoItem(
  db: Db,
  listId: string,
  itemId: string,
  userId: string,
): Promise<void> {
  await writableList(db, listId, userId);
  const deleted = await db.query(
    `DELETE FROM todo_items WHERE id = $1 AND list_id = $2`,
    [itemId, listId],
  );
  if ((deleted.rowCount ?? 0) === 0) throw new ListServiceError("NOT_FOUND");
}

export async function listTodoShares(
  db: Db,
  listId: string,
  ownerId: string,
): Promise<TodoShare[]> {
  const list = await getTodoListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") throw new ListServiceError("FORBIDDEN");
  const result = await db.query<{
    user_id: string;
    first_name: string;
    telegram_username: string | null;
    permission: string;
    created_at: Date;
  }>(
    `SELECT u.id AS user_id, u.first_name, u.telegram_username, s.permission, s.created_at
     FROM todo_list_shares s
     JOIN users u ON u.id = s.shared_with_user_id
     WHERE s.list_id = $1
     ORDER BY s.created_at ASC`,
    [listId],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    firstName: row.first_name,
    telegramUsername: row.telegram_username,
    permission: row.permission === "EDIT" ? "EDIT" : "READ",
    createdAt: row.created_at,
  }));
}

export async function shareTodoList(
  db: Db,
  listId: string,
  ownerId: string,
  friendUserId: string,
  permission: TodoPermission,
): Promise<"shared" | "not_found" | "not_friend"> {
  const list = await getTodoListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") return "not_found";
  if (friendUserId === ownerId) return "not_friend";
  if (!(await areFriends(db, ownerId, friendUserId))) return "not_friend";
  await db.query(
    `INSERT INTO todo_list_shares (list_id, shared_with_user_id, permission, created_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (list_id, shared_with_user_id)
     DO UPDATE SET permission = EXCLUDED.permission`,
    [listId, friendUserId, permission],
  );
  return "shared";
}

export async function unshareTodoList(
  db: Db,
  listId: string,
  ownerId: string,
  friendUserId: string,
): Promise<boolean> {
  const list = await getTodoListForUser(db, listId, ownerId);
  if (!list || list.role !== "OWNER") return false;
  const deleted = await db.query(
    `DELETE FROM todo_list_shares WHERE list_id = $1 AND shared_with_user_id = $2`,
    [listId, friendUserId],
  );
  return (deleted.rowCount ?? 0) > 0;
}
