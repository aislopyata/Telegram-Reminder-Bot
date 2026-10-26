import type { Db } from "@/lib/db";
import type { CallbackAction } from "@/lib/telegram/callbacks";
import type {
  InlineKeyboard,
  TelegramCallbackQuery,
  TelegramSender,
} from "@/lib/telegram/types";
import type { UserRecord } from "@/lib/services/users";
import type { LoadedWorkflow } from "@/lib/services/workflows";
import type { TodoItem } from "@/lib/services/todoLists";
import type { WishItem } from "@/lib/services/wishLists";
import {
  ListServiceError,
  TODO_ITEM_PAGE_SIZE,
  TODO_PAGE_SIZE,
  addTodoItem,
  canEditTodoList,
  createTodoList,
  deleteTodoItem,
  deleteTodoList,
  getTodoItemForUser,
  getTodoListForUser,
  listTodoItems,
  listTodoListsForUser,
  listTodoShares,
  renameTodoList,
  setTodoItemCompleted,
  shareTodoList,
  unshareTodoList,
  updateTodoItem,
} from "@/lib/services/todoLists";
import {
  WISH_ITEM_PAGE_SIZE,
  WISH_PAGE_SIZE,
  WishListServiceError,
  addWishItem,
  createWishList,
  deleteWishItem,
  deleteWishList,
  getWishItemForUser,
  getWishListForUser,
  listWishItems,
  listWishListsForUser,
  listWishShares,
  renameWishList,
  shareWishList,
  unshareWishList,
  updateWishItem,
} from "@/lib/services/wishLists";
import { listFriends } from "@/lib/services/friends";
import {
  deleteWorkflow,
  saveWorkflow,
  type TodoItemFormWorkflowData,
  type TodoListNameWorkflowData,
  type WishItemFormWorkflowData,
  type WishListNameWorkflowData,
} from "@/lib/services/workflows";
import { upsertUser } from "@/lib/services/users";
import { ru } from "@/lib/i18n/ru";
import { escapeHtml } from "@/lib/telegram/html";
import {
  formatTodoItem,
  formatTodoList,
  formatTodoOverview,
  formatTodoShares,
  formatWishItem,
  formatWishList,
  formatWishOverview,
  formatWishShares,
} from "@/lib/telegram/listsRender";
import {
  cancelOnlyKeyboard,
  todoDeleteItemConfirmKeyboard,
  todoDeleteListConfirmKeyboard,
  todoItemKeyboard,
  todoListKeyboard,
  todoManageKeyboard,
  todoOverviewKeyboard,
  todoPermissionKeyboard,
  todoSharesKeyboard,
  wishDeleteItemConfirmKeyboard,
  wishDeleteListConfirmKeyboard,
  wishItemKeyboard,
  wishListKeyboard,
  wishManageKeyboard,
  wishOverviewKeyboard,
  wishSharesKeyboard,
} from "@/lib/telegram/ui";
import {
  LIST_ITEM_DESCRIPTION_MAX,
  LIST_ITEM_TITLE_MAX,
  LIST_NAME_MAX,
  normalizeHttpUrl,
  normalizeListItemDescription,
  normalizeListItemTitle,
} from "@/lib/validation";
import { logger } from "@/lib/logger";

const LIST_STATE = "AWAIT_TEXT" as const;

const LIST_ACTION_TYPES = [
  "todoMenu",
  "todoPage",
  "todoCreate",
  "todoManage",
  "todoOpen",
  "todoAdd",
  "todoItem",
  "todoToggle",
  "todoDeleteItem",
  "todoDeleteItemConfirm",
  "todoEditField",
  "todoRename",
  "todoDeleteList",
  "todoDeleteListConfirm",
  "todoShare",
  "todoShareFriend",
  "todoSharePermission",
  "todoUnshare",
  "wishMenu",
  "wishPage",
  "wishCreate",
  "wishManage",
  "wishOpen",
  "wishAdd",
  "wishItem",
  "wishDeleteItem",
  "wishDeleteItemConfirm",
  "wishEditField",
  "wishRename",
  "wishDeleteList",
  "wishDeleteListConfirm",
  "wishShare",
  "wishShareFriend",
  "wishUnshare",
] as const;

type ListActionType = (typeof LIST_ACTION_TYPES)[number];
const LIST_ACTION_TYPE_SET: ReadonlySet<CallbackAction["type"]> = new Set(LIST_ACTION_TYPES);

export type ListCallbackAction = Extract<CallbackAction, { type: ListActionType }>;

export function isListCallback(action: CallbackAction): action is ListCallbackAction {
  return LIST_ACTION_TYPE_SET.has(action.type);
}

export function isListWorkflow(workflow: LoadedWorkflow): boolean {
  return (
    workflow.data.kind === "todo_list_name" ||
    workflow.data.kind === "wish_list_name" ||
    workflow.data.kind === "todo_item_form" ||
    workflow.data.kind === "wish_item_form"
  );
}

function send(
  sender: TelegramSender,
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<number> {
  return sender.sendMessage(chatId, text, keyboard);
}

function withPrefix(prefix: string | null, text: string): string {
  return prefix ? `${prefix}\n\n${text}` : text;
}

function errorMessage(error: unknown): string {
  if (error instanceof ListServiceError || error instanceof WishListServiceError) {
    switch (error.code) {
      case "INVALID_NAME":
        return ru.lists.invalidName(LIST_NAME_MAX);
      case "INVALID_TITLE":
        return ru.lists.invalidTitle(LIST_ITEM_TITLE_MAX);
      case "INVALID_DESCRIPTION":
        return ru.lists.invalidDescription(LIST_ITEM_DESCRIPTION_MAX);
      case "INVALID_URL":
        return ru.lists.invalidUrl;
      case "DEFAULT_LIST":
        return ru.lists.defaultCannotDelete;
      case "NOT_FRIEND":
        return ru.lists.notFriend;
      case "FORBIDDEN":
        return ru.lists.forbidden;
      case "NOT_FOUND":
        return ru.lists.notFound;
    }
  }
  logger.debug("list_action_failed", { error: String(error).slice(0, 200) });
  return ru.common.internalError;
}

function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { slice: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    slice: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    totalPages,
  };
}

async function renderTodoOverview(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  page = 1,
  prefix: string | null = null,
): Promise<void> {
  const { own, shared } = await listTodoListsForUser(db, user.id);
  const paged = paginate([...own, ...shared], page, TODO_PAGE_SIZE);
  await send(
    sender,
    chatId,
    withPrefix(
      prefix,
      formatTodoOverview(
        paged.slice.filter((list) => list.role === "OWNER"),
        paged.slice.filter((list) => list.role !== "OWNER"),
      ),
    ),
    todoOverviewKeyboard(paged.slice, paged.page, paged.totalPages),
  );
}

async function renderWishOverview(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  page = 1,
  prefix: string | null = null,
): Promise<void> {
  const { own, shared } = await listWishListsForUser(db, user.id);
  const paged = paginate([...own, ...shared], page, WISH_PAGE_SIZE);
  await send(
    sender,
    chatId,
    withPrefix(
      prefix,
      formatWishOverview(
        paged.slice.filter((list) => list.role === "OWNER"),
        paged.slice.filter((list) => list.role !== "OWNER"),
      ),
    ),
    wishOverviewKeyboard(paged.slice, paged.page, paged.totalPages),
  );
}

async function renderTodoList(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  page = 1,
  prefix: string | null = null,
): Promise<void> {
  const data = await listTodoItems(db, listId, user.id);
  if (!data) {
    await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
    return;
  }
  const paged = paginate(data.items, page, TODO_ITEM_PAGE_SIZE);
  await send(
    sender,
    chatId,
    withPrefix(prefix, formatTodoList(data.list, paged.slice, paged.page, TODO_ITEM_PAGE_SIZE)),
    todoListKeyboard(data.list, paged.slice, paged.page, paged.totalPages),
  );
}

async function renderWishList(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  page = 1,
  prefix: string | null = null,
): Promise<void> {
  const data = await listWishItems(db, listId, user.id);
  if (!data) {
    await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
    return;
  }
  const paged = paginate(data.items, page, WISH_ITEM_PAGE_SIZE);
  await send(
    sender,
    chatId,
    withPrefix(prefix, formatWishList(data.list, paged.slice, paged.page, WISH_ITEM_PAGE_SIZE)),
    wishListKeyboard(data.list, paged.slice, paged.page, paged.totalPages),
  );
}

async function renderTodoItem(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  itemId: string,
  prefix: string | null = null,
): Promise<void> {
  const data = await getTodoItemForUser(db, listId, itemId, user.id);
  if (!data) {
    await renderTodoList(db, sender, chatId, user, listId, 1);
    return;
  }
  await send(
    sender,
    chatId,
    withPrefix(prefix, formatTodoItem(data.list, data.item)),
    todoItemKeyboard(data.list, data.item),
  );
}

async function renderWishItem(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  itemId: string,
  prefix: string | null = null,
): Promise<void> {
  const data = await getWishItemForUser(db, listId, itemId, user.id);
  if (!data) {
    await renderWishList(db, sender, chatId, user, listId, 1);
    return;
  }
  await send(
    sender,
    chatId,
    withPrefix(prefix, formatWishItem(data.list, data.item)),
    wishItemKeyboard(data.list, data.item),
  );
}

async function friendName(db: Db, userId: string, friendId: string): Promise<string | null> {
  const friends = await listFriends(db, userId);
  return friends.find((friend) => friend.id === friendId)?.firstName ?? null;
}

async function renderTodoShares(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  prefix: string | null = null,
): Promise<void> {
  const list = await getTodoListForUser(db, listId, user.id);
  if (!list || list.role !== "OWNER") {
    await send(sender, chatId, ru.lists.forbidden, todoOverviewKeyboard([], 1, 1));
    return;
  }
  const [shares, friends] = await Promise.all([
    listTodoShares(db, listId, user.id),
    listFriends(db, user.id),
  ]);
  const sharedIds = new Set(shares.map((share) => share.userId));
  const available = friends
    .filter((friend) => !sharedIds.has(friend.id))
    .map((friend) => ({ id: friend.id, firstName: friend.firstName }));
  const text = formatTodoShares(list, shares);
  const hint = shares.length === 0 && available.length === 0 ? `\n\n${ru.lists.noFriends}` : "";
  await send(
    sender,
    chatId,
    withPrefix(prefix, `${text}${hint}`),
    todoSharesKeyboard(list, shares, available),
  );
}

async function renderWishShares(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  listId: string,
  prefix: string | null = null,
): Promise<void> {
  const list = await getWishListForUser(db, listId, user.id);
  if (!list || list.role !== "OWNER") {
    await send(sender, chatId, ru.lists.forbidden, wishOverviewKeyboard([], 1, 1));
    return;
  }
  const [shares, friends] = await Promise.all([
    listWishShares(db, listId, user.id),
    listFriends(db, user.id),
  ]);
  const sharedIds = new Set(shares.map((share) => share.userId));
  const available = friends
    .filter((friend) => !sharedIds.has(friend.id))
    .map((friend) => ({ id: friend.id, firstName: friend.firstName }));
  const text = formatWishShares(list, shares);
  const hint = shares.length === 0 && available.length === 0 ? `\n\n${ru.lists.noFriends}` : "";
  await send(
    sender,
    chatId,
    withPrefix(prefix, `${text}${hint}`),
    wishSharesKeyboard(list, shares, available),
  );
}

function itemPrompt(
  field: TodoItemFormWorkflowData["step"],
  item: TodoItem | WishItem,
): string {
  if (field === "title") return ru.lists.editTitlePrompt(escapeHtml(item.title));
  if (field === "description") {
    return ru.lists.editDescriptionPrompt(
      item.description ? escapeHtml(item.description) : null,
    );
  }
  return ru.lists.editUrlPrompt(item.url ? escapeHtml(item.url) : null);
}

export async function handleListCallback(
  db: Db,
  sender: TelegramSender,
  query: TelegramCallbackQuery,
  action: ListCallbackAction,
): Promise<void> {
  const chatId = String(query.message?.chat?.id ?? query.from.id);
  const user = await upsertUser(db, query.from);

  switch (action.type) {
    case "todoMenu":
      await renderTodoOverview(db, sender, chatId, user);
      return;
    case "todoPage":
      await renderTodoOverview(db, sender, chatId, user, action.page);
      return;
    case "wishMenu":
      await renderWishOverview(db, sender, chatId, user);
      return;
    case "wishPage":
      await renderWishOverview(db, sender, chatId, user, action.page);
      return;

    case "todoManage": {
      const { own } = await listTodoListsForUser(db, user.id);
      await send(
        sender,
        chatId,
        ru.lists.todoManageTitle,
        todoManageKeyboard(own),
      );
      return;
    }
    case "wishManage": {
      const { own } = await listWishListsForUser(db, user.id);
      await send(
        sender,
        chatId,
        ru.lists.wishManageTitle,
        wishManageKeyboard(own),
      );
      return;
    }

    case "todoCreate": {
      const messageId = await send(sender, chatId, ru.lists.todoCreatePrompt, cancelOnlyKeyboard());
      await saveWorkflow(db, user.id, LIST_STATE, { kind: "todo_list_name" }, messageId);
      return;
    }
    case "wishCreate": {
      const messageId = await send(sender, chatId, ru.lists.wishCreatePrompt, cancelOnlyKeyboard());
      await saveWorkflow(db, user.id, LIST_STATE, { kind: "wish_list_name" }, messageId);
      return;
    }

    case "todoOpen":
      await renderTodoList(db, sender, chatId, user, action.id, action.page);
      return;
    case "wishOpen":
      await renderWishList(db, sender, chatId, user, action.id, action.page);
      return;

    case "todoItem":
      await renderTodoItem(db, sender, chatId, user, action.id, action.itemId);
      return;
    case "wishItem":
      await renderWishItem(db, sender, chatId, user, action.id, action.itemId);
      return;

    case "todoAdd": {
      const list = await getTodoListForUser(db, action.id, user.id);
      if (!list) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (!canEditTodoList(list)) {
        await send(sender, chatId, ru.lists.forbidden, todoListKeyboard(list, [], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        ru.lists.todoAddTitlePrompt,
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        { kind: "todo_item_form", mode: "create", listId: list.id, step: "title" },
        messageId,
      );
      return;
    }
    case "wishAdd": {
      const list = await getWishListForUser(db, action.id, user.id);
      if (!list) {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishListKeyboard(list, [], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        ru.lists.wishAddTitlePrompt,
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        { kind: "wish_item_form", mode: "create", listId: list.id, step: "title" },
        messageId,
      );
      return;
    }

    case "todoToggle": {
      const data = await getTodoItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (!canEditTodoList(data.list)) {
        await send(sender, chatId, ru.lists.forbidden, todoListKeyboard(data.list, [], 1, 1));
        return;
      }
      try {
        await setTodoItemCompleted(
          db,
          action.id,
          action.itemId,
          user.id,
          !data.item.isCompleted,
        );
      } catch (error) {
        await send(sender, chatId, errorMessage(error));
        return;
      }
      await renderTodoItem(db, sender, chatId, user, action.id, action.itemId);
      return;
    }

    case "todoDeleteItem": {
      const data = await getTodoItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (!canEditTodoList(data.list)) {
        await send(sender, chatId, ru.lists.forbidden, todoListKeyboard(data.list, [], 1, 1));
        return;
      }
      await send(
        sender,
        chatId,
        ru.lists.deleteItemConfirm(escapeHtml(data.item.title)),
        todoDeleteItemConfirmKeyboard(action.id, action.itemId),
      );
      return;
    }
    case "todoDeleteItemConfirm": {
      const data = await getTodoItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (!canEditTodoList(data.list)) {
        await send(sender, chatId, ru.lists.forbidden, todoListKeyboard(data.list, [], 1, 1));
        return;
      }
      try {
        await deleteTodoItem(db, action.id, action.itemId, user.id);
      } catch (error) {
        await send(sender, chatId, errorMessage(error));
        return;
      }
      await renderTodoList(db, sender, chatId, user, action.id, 1, ru.lists.itemDeleted);
      return;
    }

    case "wishDeleteItem": {
      const data = await getWishItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (data.list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishListKeyboard(data.list, [], 1, 1));
        return;
      }
      await send(
        sender,
        chatId,
        ru.lists.deleteItemConfirm(escapeHtml(data.item.title)),
        wishDeleteItemConfirmKeyboard(action.id, action.itemId),
      );
      return;
    }
    case "wishDeleteItemConfirm": {
      const data = await getWishItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (data.list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishListKeyboard(data.list, [], 1, 1));
        return;
      }
      try {
        await deleteWishItem(db, action.id, action.itemId, user.id);
      } catch (error) {
        await send(sender, chatId, errorMessage(error));
        return;
      }
      await renderWishList(db, sender, chatId, user, action.id, 1, ru.lists.itemDeleted);
      return;
    }

    case "todoEditField": {
      const data = await getTodoItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (!canEditTodoList(data.list)) {
        await send(sender, chatId, ru.lists.forbidden, todoListKeyboard(data.list, [], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        itemPrompt(action.field, data.item),
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        {
          kind: "todo_item_form",
          mode: "edit",
          listId: action.id,
          itemId: action.itemId,
          step: action.field,
          title: data.item.title,
          description: data.item.description,
        },
        messageId,
      );
      return;
    }
    case "wishEditField": {
      const data = await getWishItemForUser(db, action.id, action.itemId, user.id);
      if (!data) {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (data.list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishListKeyboard(data.list, [], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        itemPrompt(action.field, data.item),
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        {
          kind: "wish_item_form",
          mode: "edit",
          listId: action.id,
          itemId: action.itemId,
          step: action.field,
          title: data.item.title,
          description: data.item.description,
        },
        messageId,
      );
      return;
    }

    case "todoRename": {
      const list = await getTodoListForUser(db, action.id, user.id);
      if (!list || list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, todoOverviewKeyboard([], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        ru.lists.renamePrompt(escapeHtml(list.name)),
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        { kind: "todo_list_name", listId: list.id },
        messageId,
      );
      return;
    }
    case "wishRename": {
      const list = await getWishListForUser(db, action.id, user.id);
      if (!list || list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishOverviewKeyboard([], 1, 1));
        return;
      }
      const messageId = await send(
        sender,
        chatId,
        ru.lists.renamePrompt(escapeHtml(list.name)),
        cancelOnlyKeyboard(),
      );
      await saveWorkflow(
        db,
        user.id,
        LIST_STATE,
        { kind: "wish_list_name", listId: list.id },
        messageId,
      );
      return;
    }

    case "todoDeleteList": {
      const list = await getTodoListForUser(db, action.id, user.id);
      if (!list || list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (list.isDefault) {
        await send(sender, chatId, ru.lists.defaultCannotDelete, todoOverviewKeyboard([], 1, 1));
        return;
      }
      await send(
        sender,
        chatId,
        ru.lists.todoDeleteListConfirm(escapeHtml(list.name)),
        todoDeleteListConfirmKeyboard(list.id),
      );
      return;
    }
    case "wishDeleteList": {
      const list = await getWishListForUser(db, action.id, user.id);
      if (!list || list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (list.isDefault) {
        await send(sender, chatId, ru.lists.defaultCannotDelete, wishOverviewKeyboard([], 1, 1));
        return;
      }
      await send(
        sender,
        chatId,
        ru.lists.wishDeleteListConfirm(escapeHtml(list.name)),
        wishDeleteListConfirmKeyboard(list.id),
      );
      return;
    }
    case "todoDeleteListConfirm": {
      const result = await deleteTodoList(db, action.id, user.id);
      if (result === "default") {
        await send(sender, chatId, ru.lists.defaultCannotDelete, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (result === "not_found") {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      await renderTodoOverview(db, sender, chatId, user, 1, ru.lists.listDeleted);
      return;
    }
    case "wishDeleteListConfirm": {
      const result = await deleteWishList(db, action.id, user.id);
      if (result === "default") {
        await send(sender, chatId, ru.lists.defaultCannotDelete, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (result === "not_found") {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      await renderWishOverview(db, sender, chatId, user, 1, ru.lists.listDeleted);
      return;
    }

    case "todoShare":
      await renderTodoShares(db, sender, chatId, user, action.id);
      return;
    case "wishShare":
      await renderWishShares(db, sender, chatId, user, action.id);
      return;

    case "todoShareFriend": {
      const list = await getTodoListForUser(db, action.id, user.id);
      if (!list || list.role !== "OWNER") {
        await send(sender, chatId, ru.lists.forbidden, todoOverviewKeyboard([], 1, 1));
        return;
      }
      const name = await friendName(db, user.id, action.friendId);
      if (!name) {
        await send(sender, chatId, ru.lists.notFriend, todoSharesKeyboard(list, [], []));
        return;
      }
      await send(
        sender,
        chatId,
        ru.lists.sharePermissionTitle(escapeHtml(name)),
        todoPermissionKeyboard(list.id, action.friendId),
      );
      return;
    }
    case "todoSharePermission": {
      const result = await shareTodoList(
        db,
        action.id,
        user.id,
        action.friendId,
        action.permission,
      );
      if (result === "not_found") {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      if (result === "not_friend") {
        await send(sender, chatId, ru.lists.notFriend, todoOverviewKeyboard([], 1, 1));
        return;
      }
      const name = (await friendName(db, user.id, action.friendId)) ?? "";
      const permission =
        action.permission === "EDIT" ? ru.lists.editable : ru.lists.readOnly;
      await renderTodoShares(
        db,
        sender,
        chatId,
        user,
        action.id,
        ru.lists.shareSaved(escapeHtml(name), permission),
      );
      return;
    }
    case "todoUnshare": {
      const removed = await unshareTodoList(db, action.id, user.id, action.friendId);
      if (!removed) {
        await send(sender, chatId, ru.lists.notFound, todoOverviewKeyboard([], 1, 1));
        return;
      }
      const name = (await friendName(db, user.id, action.friendId)) ?? "";
      await renderTodoShares(
        db,
        sender,
        chatId,
        user,
        action.id,
        ru.lists.unshared(escapeHtml(name)),
      );
      return;
    }

    case "wishShareFriend": {
      const result = await shareWishList(db, action.id, user.id, action.friendId);
      if (result === "not_found") {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      if (result === "not_friend") {
        await send(sender, chatId, ru.lists.notFriend, wishOverviewKeyboard([], 1, 1));
        return;
      }
      const name = (await friendName(db, user.id, action.friendId)) ?? "";
      await renderWishShares(
        db,
        sender,
        chatId,
        user,
        action.id,
        ru.lists.shareSaved(escapeHtml(name), ru.lists.readOnly),
      );
      return;
    }
    case "wishUnshare": {
      const removed = await unshareWishList(db, action.id, user.id, action.friendId);
      if (!removed) {
        await send(sender, chatId, ru.lists.notFound, wishOverviewKeyboard([], 1, 1));
        return;
      }
      const name = (await friendName(db, user.id, action.friendId)) ?? "";
      await renderWishShares(
        db,
        sender,
        chatId,
        user,
        action.id,
        ru.lists.unshared(escapeHtml(name)),
      );
      return;
    }
  }
}

async function handleListNameText(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  data: TodoListNameWorkflowData | WishListNameWorkflowData,
  text: string,
): Promise<void> {
  const isTodo = data.kind === "todo_list_name";
  const name = text.replace(/\s+/g, " ").trim();
  if (!name || [...name].length > LIST_NAME_MAX) {
    await send(
      sender,
      chatId,
      `${ru.lists.invalidName(LIST_NAME_MAX)}\n\n${
        data.listId
          ? ru.lists.renamePrompt(escapeHtml(name || "—"))
          : isTodo
            ? ru.lists.todoCreatePrompt
            : ru.lists.wishCreatePrompt
      }`,
      cancelOnlyKeyboard(),
    );
    return;
  }

  try {
    if (data.listId) {
      if (isTodo) await renameTodoList(db, data.listId, user.id, name);
      else await renameWishList(db, data.listId, user.id, name);
      await deleteWorkflow(db, user.id);
      if (isTodo) {
        await renderTodoOverview(db, sender, chatId, user, 1, ru.lists.renamed(escapeHtml(name)));
      } else {
        await renderWishOverview(db, sender, chatId, user, 1, ru.lists.renamed(escapeHtml(name)));
      }
      return;
    }

    if (isTodo) {
      const list = await createTodoList(db, user.id, name);
      await deleteWorkflow(db, user.id);
      await renderTodoOverview(db, sender, chatId, user, 1, ru.lists.todoCreated(escapeHtml(list.name)));
    } else {
      const list = await createWishList(db, user.id, name);
      await deleteWorkflow(db, user.id);
      await renderWishOverview(db, sender, chatId, user, 1, ru.lists.wishCreated(escapeHtml(list.name)));
    }
  } catch (error) {
    await send(
      sender,
      chatId,
      `${errorMessage(error)}\n\n${
        data.listId
          ? ru.lists.renamePrompt(escapeHtml(name))
          : isTodo
            ? ru.lists.todoCreatePrompt
            : ru.lists.wishCreatePrompt
      }`,
      cancelOnlyKeyboard(),
    );
  }
}

type FormWorkflowData = TodoItemFormWorkflowData | WishItemFormWorkflowData;

async function handleItemFormText(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  data: FormWorkflowData,
  text: string,
): Promise<void> {
  const isTodo = data.kind === "todo_item_form";
  const field = data.step;

  if (field === "title") {
    const title = normalizeListItemTitle(text);
    if (!title) {
      await send(
        sender,
        chatId,
        `${ru.lists.invalidTitle(LIST_ITEM_TITLE_MAX)}\n\n${
          data.mode === "create"
            ? isTodo
              ? ru.lists.todoAddTitlePrompt
              : ru.lists.wishAddTitlePrompt
            : ru.lists.editTitlePrompt("—")
        }`,
        cancelOnlyKeyboard(),
      );
      return;
    }

    if (data.mode === "edit" && data.itemId) {
      try {
        if (isTodo) {
          await updateTodoItem(db, data.listId, data.itemId, user.id, { title });
        } else {
          await updateWishItem(db, data.listId, data.itemId, user.id, { title });
        }
        await deleteWorkflow(db, user.id);
        if (isTodo) {
          await renderTodoItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
        } else {
          await renderWishItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
        }
      } catch (error) {
        await send(sender, chatId, errorMessage(error));
      }
      return;
    }

    const messageId = await send(
      sender,
      chatId,
      ru.lists.addDescriptionPrompt,
      cancelOnlyKeyboard(),
    );
    const next: FormWorkflowData = { ...data, title, step: "description" };
    await saveWorkflow(db, user.id, LIST_STATE, next, messageId);
    return;
  }

  if (field === "description") {
    const description = normalizeListItemDescription(text);
    if (description === "empty") {
      await send(
        sender,
        chatId,
        `${ru.lists.invalidDescription(LIST_ITEM_DESCRIPTION_MAX)}\n\n${ru.lists.addDescriptionPrompt}`,
        cancelOnlyKeyboard(),
      );
      return;
    }

    if (data.mode === "edit" && data.itemId) {
      try {
        if (isTodo) {
          await updateTodoItem(db, data.listId, data.itemId, user.id, { description });
        } else {
          await updateWishItem(db, data.listId, data.itemId, user.id, { description });
        }
        await deleteWorkflow(db, user.id);
        if (isTodo) {
          await renderTodoItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
        } else {
          await renderWishItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
        }
      } catch (error) {
        await send(sender, chatId, errorMessage(error));
      }
      return;
    }

    const messageId = await send(sender, chatId, ru.lists.addUrlPrompt, cancelOnlyKeyboard());
    const next: FormWorkflowData = { ...data, description, step: "url" };
    await saveWorkflow(db, user.id, LIST_STATE, next, messageId);
    return;
  }

  const url = normalizeHttpUrl(text);
  if (url === "invalid") {
    await send(
      sender,
      chatId,
      `${ru.lists.invalidUrl}\n\n${ru.lists.addUrlPrompt}`,
      cancelOnlyKeyboard(),
    );
    return;
  }

  try {
    if (data.mode === "edit" && data.itemId) {
      if (isTodo) {
        await updateTodoItem(db, data.listId, data.itemId, user.id, { url });
      } else {
        await updateWishItem(db, data.listId, data.itemId, user.id, { url });
      }
      await deleteWorkflow(db, user.id);
      if (isTodo) {
        await renderTodoItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
      } else {
        await renderWishItem(db, sender, chatId, user, data.listId, data.itemId, ru.lists.itemSaved);
      }
      return;
    }

    if (!data.title) {
      await deleteWorkflow(db, user.id);
      await send(sender, chatId, ru.common.staleButton, cancelOnlyKeyboard());
      return;
    }

    if (isTodo) {
      const item = await addTodoItem(db, data.listId, user.id, {
        title: data.title,
        description: data.description ?? null,
        url,
      });
      await deleteWorkflow(db, user.id);
      await renderTodoItem(db, sender, chatId, user, data.listId, item.id, ru.lists.itemSaved);
    } else {
      const item = await addWishItem(db, data.listId, user.id, {
        title: data.title,
        description: data.description ?? null,
        url,
      });
      await deleteWorkflow(db, user.id);
      await renderWishItem(db, sender, chatId, user, data.listId, item.id, ru.lists.itemSaved);
    }
  } catch (error) {
    await send(
      sender,
      chatId,
      `${errorMessage(error)}\n\n${ru.lists.addUrlPrompt}`,
      cancelOnlyKeyboard(),
    );
  }
}

export async function handleListWorkflowText(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  workflow: LoadedWorkflow,
  text: string,
): Promise<boolean> {
  const data = workflow.data;
  if (data.kind === "todo_list_name" || data.kind === "wish_list_name") {
    await handleListNameText(db, sender, chatId, user, data, text);
    return true;
  }
  if (data.kind === "todo_item_form" || data.kind === "wish_item_form") {
    await handleItemFormText(db, sender, chatId, user, data, text);
    return true;
  }
  return false;
}
