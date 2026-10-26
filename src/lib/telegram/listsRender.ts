import { escapeHtml, truncate } from "@/lib/telegram/html";
import { ru } from "@/lib/i18n/ru";
import type { TodoItem, TodoList, TodoShare } from "@/lib/services/todoLists";
import type { WishItem, WishList, WishShare } from "@/lib/services/wishLists";

const LIST_PREVIEW_DESCRIPTION = 160;

/**
 * Only http(s) URLs reach this function (the service validates them again),
 * and the value is escaped before it is embedded in an HTML attribute.
 */
function formatLink(url: string): string {
  const safe = escapeHtml(url);
  return `<a href="${safe}">${safe}</a>`;
}

function permissionLabel(role: TodoList["role"] | WishList["role"]): string {
  return role === "OWNER" ? ru.lists.editable : ru.lists.readOnly;
}

export function formatTodoOverview(own: TodoList[], shared: TodoList[]): string {
  const lines: string[] = [ru.lists.todoTitle, "", ru.lists.myLists];
  if (own.length === 0) {
    lines.push(ru.lists.emptyDash);
  } else {
    own.forEach((list, index) => {
      const marker = list.isDefault ? "⭐" : `${index + 1}.`;
      lines.push(`${marker} ${escapeHtml(list.name)}`);
    });
  }

  lines.push("", ru.lists.sharedLists);
  if (shared.length === 0) {
    lines.push(ru.lists.noShared);
  } else {
    shared.forEach((list) => {
      const mark = list.role === "EDIT" ? " ✏️" : " 📖";
      lines.push(`👤 ${escapeHtml(list.ownerName)}: ${escapeHtml(list.name)}${mark}`);
    });
  }
  return lines.join("\n");
}

export function formatWishOverview(own: WishList[], shared: WishList[]): string {
  const lines: string[] = [ru.lists.wishTitle, "", ru.lists.myLists];
  if (own.length === 0) {
    lines.push(ru.lists.emptyDash);
  } else {
    own.forEach((list, index) => {
      const marker = list.isDefault ? "⭐" : `${index + 1}.`;
      lines.push(`${marker} ${escapeHtml(list.name)}`);
    });
  }

  lines.push("", ru.lists.sharedLists);
  if (shared.length === 0) {
    lines.push(ru.lists.noShared);
  } else {
    shared.forEach((list) => {
      lines.push(`👤 ${escapeHtml(list.ownerName)}: ${escapeHtml(list.name)} 📖`);
    });
  }
  return lines.join("\n");
}

function listHeader(list: TodoList | WishList, icon: string): string[] {
  const lines: string[] = [`${list.isDefault ? "⭐" : icon} <b>${escapeHtml(list.name)}</b>`];
  if (list.role !== "OWNER") {
    lines.push(`${ru.lists.owner} ${escapeHtml(list.ownerName)}`);
  }
  lines.push(permissionLabel(list.role));
  return lines;
}

export function formatTodoList(
  list: TodoList,
  items: TodoItem[],
  page: number,
  pageSize: number,
): string {
  const lines = listHeader(list, "📝");
  if (items.length === 0) {
    lines.push("", ru.lists.todoEmptyItems);
    return lines.join("\n");
  }

  lines.push("");
  const offset = (page - 1) * pageSize;
  items.forEach((item, index) => {
    lines.push(
      `${offset + index + 1}. ${item.isCompleted ? "☑️" : "⬜️"} <b>${escapeHtml(item.title)}</b>`,
    );
    if (item.description) {
      lines.push(`   ${escapeHtml(truncate(item.description, LIST_PREVIEW_DESCRIPTION))}`);
    }
    if (item.url) lines.push(`   🔗 ${formatLink(item.url)}`);
  });
  return lines.join("\n");
}

export function formatWishList(
  list: WishList,
  items: WishItem[],
  page: number,
  pageSize: number,
): string {
  const lines = listHeader(list, "🎁");
  if (items.length === 0) {
    lines.push("", ru.lists.wishEmptyItems);
    return lines.join("\n");
  }

  lines.push("");
  const offset = (page - 1) * pageSize;
  items.forEach((item, index) => {
    lines.push(`${offset + index + 1}. 🎁 <b>${escapeHtml(item.title)}</b>`);
    if (item.description) {
      lines.push(`   ${escapeHtml(truncate(item.description, LIST_PREVIEW_DESCRIPTION))}`);
    }
    if (item.url) lines.push(`   🔗 ${formatLink(item.url)}`);
  });
  return lines.join("\n");
}

function formatItemBody(
  title: string,
  description: string | null,
  url: string | null,
): string[] {
  const lines: string[] = ["", `<b>${escapeHtml(title)}</b>`];
  if (description) {
    lines.push("", ru.lists.descriptionLabel, escapeHtml(description));
  }
  if (url) {
    lines.push("", ru.lists.urlLabel, formatLink(url));
  }
  return lines;
}

export function formatTodoItem(list: TodoList, item: TodoItem): string {
  const lines: string[] = [ru.lists.todoItemTitle, ...formatItemBody(item.title, item.description, item.url)];
  lines.push("", item.isCompleted ? "☑️ Выполнено" : "⬜️ Не выполнено");
  if (list.role !== "OWNER") {
    lines.push(`${ru.lists.owner} ${escapeHtml(list.ownerName)}`);
  }
  return lines.join("\n");
}

export function formatWishItem(list: WishList, item: WishItem): string {
  const lines: string[] = [ru.lists.wishItemTitle, ...formatItemBody(item.title, item.description, item.url)];
  if (list.role !== "OWNER") {
    lines.push("", `${ru.lists.owner} ${escapeHtml(list.ownerName)}`);
  }
  return lines.join("\n");
}

export function formatTodoShares(list: TodoList, shares: TodoShare[]): string {
  const lines: string[] = [ru.lists.todoShareTitle(escapeHtml(list.name)), ""];
  if (shares.length === 0) {
    lines.push(ru.lists.noShared);
  } else {
    shares.forEach((share) => {
      const permission = share.permission === "EDIT" ? ru.lists.editable : ru.lists.readOnly;
      lines.push(`👤 ${escapeHtml(share.firstName)} — ${permission}`);
    });
  }
  return lines.join("\n");
}

export function formatWishShares(list: WishList, shares: WishShare[]): string {
  const lines: string[] = [ru.lists.wishShareTitle(escapeHtml(list.name)), ""];
  if (shares.length === 0) {
    lines.push(ru.lists.noShared);
  } else {
    shares.forEach((share) => {
      lines.push(`👤 ${escapeHtml(share.firstName)} — ${ru.lists.readOnly}`);
    });
  }
  return lines.join("\n");
}
