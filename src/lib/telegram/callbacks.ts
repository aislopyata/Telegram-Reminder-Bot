/**
 * Callback data is limited to 64 bytes by Telegram. We only ever encode
 * server-generated ids, enum-like actions and small integers. User-controlled
 * strings never appear here; workflow data lives in PostgreSQL.
 */

export const CALLBACK_LIMIT = 64;

export const cb = {
  main: () => "menu",
  createType: () => "new:type",
  createOnce: () => "new:once",
  createRecurring: () => "new:rec",
  weekly: () => "new:weekly",
  monthly: () => "new:monthly",

  calendarPrev: () => "cal:prev",
  calendarNext: () => "cal:next",
  selectDay: (day: number) => `cal:day:${day}`,

  selectHour: (hour: number) => `time:h:${hour}`,
  selectMinute: (minute: number) => `time:m:${minute}`,

  toggleWeekday: (day: number) => `wd:${day}`,
  saveWeekdays: () => "wd:save",

  toggleMonthDay: (day: number) => `md:${day}`,
  saveMonthDays: () => "md:save",
  monthDayPage: (page: number) => `md:page:${page}`,

  recipientSelf: () => "rc:self",
  recipientBack: () => "rc:back",
  recipientFriend: () => "rc:friend",
  recipientFriendId: (friendId: string) => `rc:f:${friendId}`,

  confirmSave: () => "cf:save",
  confirmEditDate: () => "cf:date",
  confirmEditTime: () => "cf:time",
  confirmEditText: () => "cf:text",
  confirmEditRecipients: () => "cf:recip",

  cancelWorkflow: () => "wf:cancel",
  noop: () => "noop",

  reminders: (page: number) => `r:list:${page}`,
  reminderView: (id: string, page: number) => `r:view:${id}:${page}`,
  reminderEdit: (id: string, page: number) => `r:edit:${id}:${page}`,
  reminderToggle: (id: string, page: number) => `r:toggle:${id}:${page}`,
  reminderDelete: (id: string, page: number) => `r:del:${id}:${page}`,
  reminderDeleteConfirm: (id: string, page: number) => `r:delc:${id}:${page}`,

  editText: (id: string) => `e:text:${id}`,
  editDate: (id: string) => `e:date:${id}`,
  editTime: (id: string) => `e:time:${id}`,
  editDays: (id: string) => `e:days:${id}`,
  editType: (id: string) => `e:type:${id}`,
  editRecipients: (id: string) => `e:recip:${id}`,
  editBack: (id: string, page: number) => `e:back:${id}:${page}`,

  friendsMenu: () => "f:menu",
  addFriend: () => "f:add",
  friendRequests: (page: number) => `f:req:${page}`,
  friendList: (page: number) => `f:list:${page}`,
  friendAccept: (id: string) => `f:acc:${id}`,
  friendReject: (id: string) => `f:rej:${id}`,
  friendRemove: (id: string) => `f:rm:${id}`,
  friendRemoveConfirm: (id: string) => `f:rmc:${id}`,

  settings: () => "s:menu",
  settingsTimezone: () => "s:tz",

  habitsMenu: () => "h:menu",
  habitAdd: () => "h:add",
  habitTrack: () => "h:track",
  habitDone: () => "h:done",
  habitNotNow: () => "h:notnow",
  habitDeleteMenu: () => "h:del",
  habitDelete: (id: string) => `h:del:${id}`,
  habitDeleteConfirm: (id: string) => `h:delc:${id}`,
  habitToggle: (id: string, completed: boolean) => `h:t:${id}:${completed ? 1 : 0}`,
  habitStats: () => "h:stats",
  habitStatsWeek: () => "h:st:w",
  habitStatsAll: () => "h:st:a",
  habitReminder: () => "h:rem",
  habitReminderHour: (hour: number) => `h:rh:${hour}`,
  habitReminderMinute: (hour: number, minute: number) => `h:rm:${hour}:${minute}`,
  habitReminderDisable: () => "h:rdis",

  timezones: (page: number) => `tz:${page}`,
  timezoneSet: (zone: string) => `tz:set:${zone}`,
  timezoneCustom: () => "tz:custom",

  todoMenu: () => "t:menu",
  todoPage: (page: number) => `t:page:${page}`,
  todoCreate: () => "t:new",
  todoManage: () => "t:manage",
  todoOpen: (id: string, page: number) => `t:open:${id}:${page}`,
  todoAdd: (id: string) => `t:add:${id}`,
  todoItem: (id: string, itemId: string) => `t:item:${id}:${itemId}`,
  todoToggle: (id: string, itemId: string) => `t:toggle:${id}:${itemId}`,
  todoDeleteItem: (id: string, itemId: string) => `t:del:${id}:${itemId}`,
  todoDeleteItemConfirm: (id: string, itemId: string) => `t:delc:${id}:${itemId}`,
  todoEditField: (id: string, itemId: string, field: "t" | "d" | "u") =>
    `t:ef:${id}:${itemId}:${field}`,
  todoRename: (id: string) => `t:ren:${id}`,
  todoDeleteList: (id: string) => `t:dl:${id}`,
  todoDeleteListConfirm: (id: string) => `t:dlc:${id}`,
  todoShare: (id: string) => `t:share:${id}`,
  todoShareFriend: (id: string, friendId: string) => `t:shf:${id}:${friendId}`,
  todoSharePermission: (id: string, friendId: string, permission: "r" | "e") =>
    `t:shp:${id}:${friendId}:${permission}`,
  todoUnshare: (id: string, friendId: string) => `t:unsh:${id}:${friendId}`,
  todoReminder: (id: string) => `t:rem:${id}`,
  todoReminderHour: (id: string, hour: number) => `t:rh:${id}:${hour}`,
  todoReminderMinute: (id: string, hour: number, minute: number) =>
    `t:rm:${id}:${hour}:${minute}`,
  todoReminderDisable: (id: string) => `t:rdis:${id}`,

  wishMenu: () => "w:menu",
  wishPage: (page: number) => `w:page:${page}`,
  wishCreate: () => "w:new",
  wishManage: () => "w:manage",
  wishOpen: (id: string, page: number) => `w:open:${id}:${page}`,
  wishAdd: (id: string) => `w:add:${id}`,
  wishItem: (id: string, itemId: string) => `w:item:${id}:${itemId}`,
  wishDeleteItem: (id: string, itemId: string) => `w:del:${id}:${itemId}`,
  wishDeleteItemConfirm: (id: string, itemId: string) => `w:delc:${id}:${itemId}`,
  wishEditField: (id: string, itemId: string, field: "t" | "d" | "u") =>
    `w:ef:${id}:${itemId}:${field}`,
  wishRename: (id: string) => `w:ren:${id}`,
  wishDeleteList: (id: string) => `w:dl:${id}`,
  wishDeleteListConfirm: (id: string) => `w:dlc:${id}`,
  wishShare: (id: string) => `w:share:${id}`,
  wishShareFriend: (id: string, friendId: string) => `w:shf:${id}:${friendId}`,
  wishUnshare: (id: string, friendId: string) => `w:unsh:${id}:${friendId}`,
} as const;

export type ListItemField = "title" | "description" | "url";

export type CallbackAction =
  | { type: "main" }
  | { type: "createType" }
  | { type: "createOnce" }
  | { type: "createWeekly" }
  | { type: "createMonthly" }
  | { type: "createRecurring" }
  | { type: "calendar"; direction: "prev" | "next" }
  | { type: "selectDay"; day: number }
  | { type: "selectHour"; hour: number }
  | { type: "selectMinute"; minute: number }
  | { type: "toggleWeekday"; day: number }
  | { type: "saveWeekdays" }
  | { type: "toggleMonthDay"; day: number }
  | { type: "saveMonthDays" }
  | { type: "monthDayPage"; page: number }
  | { type: "recipientSelf" }
  | { type: "recipientBack" }
  | { type: "recipientFriend" }
  | { type: "recipientFriendId"; friendId: string }
  | { type: "confirmSave" }
  | { type: "confirmEditDate" }
  | { type: "confirmEditTime" }
  | { type: "confirmEditText" }
  | { type: "confirmEditRecipients" }
  | { type: "cancelWorkflow" }
  | { type: "noop" }
  | { type: "reminders"; page: number }
  | { type: "reminderView"; id: string; page: number }
  | { type: "reminderEdit"; id: string; page: number }
  | { type: "reminderToggle"; id: string; page: number }
  | { type: "reminderDelete"; id: string; page: number }
  | { type: "reminderDeleteConfirm"; id: string; page: number }
  | { type: "editText"; id: string }
  | { type: "editDate"; id: string }
  | { type: "editTime"; id: string }
  | { type: "editDays"; id: string }
  | { type: "editType"; id: string }
  | { type: "editRecipients"; id: string }
  | { type: "editBack"; id: string; page: number }
  | { type: "friendsMenu" }
  | { type: "addFriend" }
  | { type: "friendRequests"; page: number }
  | { type: "friendList"; page: number }
  | { type: "friendAccept"; id: string }
  | { type: "friendReject"; id: string }
  | { type: "friendRemove"; id: string }
  | { type: "friendRemoveConfirm"; id: string }
  | { type: "settings" }
  | { type: "settingsTimezone" }
  | { type: "habitsMenu" }
  | { type: "habitAdd" }
  | { type: "habitTrack" }
  | { type: "habitDone" }
  | { type: "habitNotNow" }
  | { type: "habitDeleteMenu" }
  | { type: "habitDelete"; id: string }
  | { type: "habitDeleteConfirm"; id: string }
  | { type: "habitToggle"; id: string; completed: boolean }
  | { type: "habitStats"; view: "week" | "all" }
  | { type: "habitReminder" }
  | { type: "habitReminderHour"; hour: number }
  | { type: "habitReminderMinute"; hour: number; minute: number }
  | { type: "habitReminderDisable" }
  | { type: "timezones"; page: number }
  | { type: "timezoneSet"; zone: string }
  | { type: "timezoneCustom" }
  | { type: "todoMenu" }
  | { type: "todoPage"; page: number }
  | { type: "todoCreate" }
  | { type: "todoManage" }
  | { type: "todoOpen"; id: string; page: number }
  | { type: "todoAdd"; id: string }
  | { type: "todoItem"; id: string; itemId: string }
  | { type: "todoToggle"; id: string; itemId: string }
  | { type: "todoDeleteItem"; id: string; itemId: string }
  | { type: "todoDeleteItemConfirm"; id: string; itemId: string }
  | { type: "todoEditField"; id: string; itemId: string; field: ListItemField }
  | { type: "todoRename"; id: string }
  | { type: "todoDeleteList"; id: string }
  | { type: "todoDeleteListConfirm"; id: string }
  | { type: "todoShare"; id: string }
  | { type: "todoShareFriend"; id: string; friendId: string }
  | { type: "todoSharePermission"; id: string; friendId: string; permission: "READ" | "EDIT" }
  | { type: "todoUnshare"; id: string; friendId: string }
  | { type: "todoReminder"; id: string }
  | { type: "todoReminderHour"; id: string; hour: number }
  | { type: "todoReminderMinute"; id: string; hour: number; minute: number }
  | { type: "todoReminderDisable"; id: string }
  | { type: "wishMenu" }
  | { type: "wishPage"; page: number }
  | { type: "wishCreate" }
  | { type: "wishManage" }
  | { type: "wishOpen"; id: string; page: number }
  | { type: "wishAdd"; id: string }
  | { type: "wishItem"; id: string; itemId: string }
  | { type: "wishDeleteItem"; id: string; itemId: string }
  | { type: "wishDeleteItemConfirm"; id: string; itemId: string }
  | { type: "wishEditField"; id: string; itemId: string; field: ListItemField }
  | { type: "wishRename"; id: string }
  | { type: "wishDeleteList"; id: string }
  | { type: "wishDeleteListConfirm"; id: string }
  | { type: "wishShare"; id: string }
  | { type: "wishShareFriend"; id: string; friendId: string }
  | { type: "wishUnshare"; id: string; friendId: string };

const ID_PATTERN = /^\d{1,20}$/;
const ZONE_PATTERN = /^[A-Za-z0-9_+\-/]{1,50}$/;

export function isCallbackId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function positivePage(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,3}$/.test(raw)) return null;
  const page = Number(raw);
  return page >= 1 && page <= 500 ? page : null;
}

function intInRange(raw: string | undefined, min: number, max: number): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

/** Reminder creation/editing only offers quarter-hour steps. */
const SELECTABLE_MINUTES = new Set([0, 15, 30, 45]);

function listField(raw: string | undefined): ListItemField | null {
  if (raw === "t") return "title";
  if (raw === "d") return "description";
  if (raw === "u") return "url";
  return null;
}

/**
 * Parse callback data. Returns null for anything not produced by this app, so
 * malformed or forged callbacks fail closed.
 */
export function parseCallback(data: string): CallbackAction | null {
  if (typeof data !== "string" || data.length === 0 || data.length > CALLBACK_LIMIT) {
    return null;
  }

  if (data === "menu") return { type: "main" };
  if (data === "new:type") return { type: "createType" };
  if (data === "new:once") return { type: "createOnce" };
  if (data === "new:rec") return { type: "createRecurring" };
  if (data === "new:weekly") return { type: "createWeekly" };
  if (data === "new:monthly") return { type: "createMonthly" };
  if (data === "cal:prev") return { type: "calendar", direction: "prev" };
  if (data === "cal:next") return { type: "calendar", direction: "next" };
  if (data === "wd:save") return { type: "saveWeekdays" };
  if (data === "md:save") return { type: "saveMonthDays" };
  if (data === "rc:self") return { type: "recipientSelf" };
  if (data === "rc:back") return { type: "recipientBack" };
  if (data === "rc:friend") return { type: "recipientFriend" };
  if (data === "cf:save") return { type: "confirmSave" };
  if (data === "cf:date") return { type: "confirmEditDate" };
  if (data === "cf:time") return { type: "confirmEditTime" };
  if (data === "cf:text") return { type: "confirmEditText" };
  if (data === "cf:recip") return { type: "confirmEditRecipients" };
  if (data === "wf:cancel") return { type: "cancelWorkflow" };
  if (data === "noop") return { type: "noop" };
  if (data === "f:menu") return { type: "friendsMenu" };
  if (data === "f:add") return { type: "addFriend" };
  if (data === "s:menu") return { type: "settings" };
  if (data === "s:tz") return { type: "settingsTimezone" };
  if (data === "h:menu") return { type: "habitsMenu" };
  if (data === "h:add") return { type: "habitAdd" };
  if (data === "h:track") return { type: "habitTrack" };
  if (data === "h:done") return { type: "habitDone" };
  if (data === "h:notnow") return { type: "habitNotNow" };
  if (data === "h:del") return { type: "habitDeleteMenu" };
  if (data === "h:stats" || data === "h:st:w") {
    return { type: "habitStats", view: "week" };
  }
  if (data === "h:st:a") return { type: "habitStats", view: "all" };
  if (data === "h:rem") return { type: "habitReminder" };
  if (data === "h:rdis") return { type: "habitReminderDisable" };
  if (data === "tz:custom") return { type: "timezoneCustom" };
  if (data === "t:menu") return { type: "todoMenu" };
  if (data === "t:new") return { type: "todoCreate" };
  if (data === "t:manage") return { type: "todoManage" };
  if (data === "w:menu") return { type: "wishMenu" };
  if (data === "w:new") return { type: "wishCreate" };
  if (data === "w:manage") return { type: "wishManage" };

  let match = /^cal:day:(\d{1,2})$/.exec(data);
  if (match) {
    const day = intInRange(match[1], 1, 31);
    return day === null ? null : { type: "selectDay", day };
  }

  match = /^time:h:(\d{1,2})$/.exec(data);
  if (match) {
    const hour = intInRange(match[1], 0, 23);
    return hour === null ? null : { type: "selectHour", hour };
  }

  match = /^time:m:(\d{1,2})$/.exec(data);
  if (match) {
    const minute = intInRange(match[1], 0, 59);
    return minute === null || !SELECTABLE_MINUTES.has(minute)
      ? null
      : { type: "selectMinute", minute };
  }

  match = /^wd:(\d)$/.exec(data);
  if (match) {
    const day = intInRange(match[1], 1, 7);
    return day === null ? null : { type: "toggleWeekday", day };
  }

  match = /^md:page:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "monthDayPage", page };
  }

  match = /^md:(\d{1,2})$/.exec(data);
  if (match) {
    const day = intInRange(match[1], 1, 31);
    return day === null ? null : { type: "toggleMonthDay", day };
  }

  match = /^rc:f:(\d{1,20})$/.exec(data);
  if (match) return { type: "recipientFriendId", friendId: match[1] };

  match = /^r:list:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "reminders", page };
  }

  match = /^r:view:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "reminderView", id: match[1], page };
  }

  match = /^r:edit:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "reminderEdit", id: match[1], page };
  }

  match = /^r:toggle:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "reminderToggle", id: match[1], page };
  }

  match = /^r:del:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "reminderDelete", id: match[1], page };
  }

  match = /^r:delc:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "reminderDeleteConfirm", id: match[1], page };
  }

  match = /^e:(text|date|time|days|type|recip):(\d{1,20})$/.exec(data);
  if (match) {
    const id = match[2];
    switch (match[1]) {
      case "text":
        return { type: "editText", id };
      case "date":
        return { type: "editDate", id };
      case "time":
        return { type: "editTime", id };
      case "days":
        return { type: "editDays", id };
      case "type":
        return { type: "editType", id };
      default:
        return { type: "editRecipients", id };
    }
  }

  match = /^e:back:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "editBack", id: match[1], page };
  }

  match = /^f:req:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "friendRequests", page };
  }

  match = /^f:list:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "friendList", page };
  }

  match = /^f:(acc|rej|rm|rmc):(\d{1,20})$/.exec(data);
  if (match) {
    const id = match[2];
    switch (match[1]) {
      case "acc":
        return { type: "friendAccept", id };
      case "rej":
        return { type: "friendReject", id };
      case "rm":
        return { type: "friendRemove", id };
      default:
        return { type: "friendRemoveConfirm", id };
    }
  }

  match = /^h:delc:(\d{1,20})$/.exec(data);
  if (match) return { type: "habitDeleteConfirm", id: match[1] };

  match = /^h:del:(\d{1,20})$/.exec(data);
  if (match) return { type: "habitDelete", id: match[1] };

  match = /^h:t:(\d{1,20}):([01])$/.exec(data);
  if (match) {
    return { type: "habitToggle", id: match[1], completed: match[2] === "1" };
  }

  match = /^h:rh:(\d{1,2})$/.exec(data);
  if (match) {
    const hour = intInRange(match[1], 0, 23);
    return hour === null ? null : { type: "habitReminderHour", hour };
  }

  match = /^h:rm:(\d{1,2}):(\d{1,2})$/.exec(data);
  if (match) {
    const hour = intInRange(match[1], 0, 23);
    const minute = intInRange(match[2], 0, 59);
    return hour === null || minute === null
      ? null
      : { type: "habitReminderMinute", hour, minute };
  }

  match = /^tz:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "timezones", page };
  }

  match = /^tz:set:(.+)$/.exec(data);
  if (match) {
    const zone = match[1];
    if (zone.length > 50 || !ZONE_PATTERN.test(zone)) return null;
    return { type: "timezoneSet", zone };
  }

  // ToDo lists
  match = /^t:page:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "todoPage", page };
  }
  match = /^t:open:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "todoOpen", id: match[1], page };
  }
  match = /^t:add:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoAdd", id: match[1] };
  match = /^t:item:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoItem", id: match[1], itemId: match[2] };
  match = /^t:toggle:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoToggle", id: match[1], itemId: match[2] };
  match = /^t:del:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoDeleteItem", id: match[1], itemId: match[2] };
  match = /^t:delc:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoDeleteItemConfirm", id: match[1], itemId: match[2] };
  match = /^t:ef:(\d{1,20}):(\d{1,20}):([tdu])$/.exec(data);
  if (match) {
    const field = listField(match[3]);
    return field === null ? null : { type: "todoEditField", id: match[1], itemId: match[2], field };
  }
  match = /^t:ren:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoRename", id: match[1] };
  match = /^t:dl:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoDeleteList", id: match[1] };
  match = /^t:dlc:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoDeleteListConfirm", id: match[1] };
  match = /^t:share:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoShare", id: match[1] };
  match = /^t:shf:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoShareFriend", id: match[1], friendId: match[2] };
  match = /^t:shp:(\d{1,20}):(\d{1,20}):([re])$/.exec(data);
  if (match) {
    return {
      type: "todoSharePermission",
      id: match[1],
      friendId: match[2],
      permission: match[3] === "e" ? "EDIT" : "READ",
    };
  }
  match = /^t:unsh:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "todoUnshare", id: match[1], friendId: match[2] };
  match = /^t:rem:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoReminder", id: match[1] };
  match = /^t:rh:(\d{1,20}):(\d{1,2})$/.exec(data);
  if (match) {
    const hour = intInRange(match[2], 0, 23);
    return hour === null ? null : { type: "todoReminderHour", id: match[1], hour };
  }
  match = /^t:rm:(\d{1,20}):(\d{1,2}):(\d{1,2})$/.exec(data);
  if (match) {
    const hour = intInRange(match[2], 0, 23);
    const minute = intInRange(match[3], 0, 59);
    return hour === null || minute === null
      ? null
      : { type: "todoReminderMinute", id: match[1], hour, minute };
  }
  match = /^t:rdis:(\d{1,20})$/.exec(data);
  if (match) return { type: "todoReminderDisable", id: match[1] };

  // Wish lists (read-only sharing)
  match = /^w:page:(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[1]);
    return page === null ? null : { type: "wishPage", page };
  }
  match = /^w:open:(\d{1,20}):(\d{1,3})$/.exec(data);
  if (match) {
    const page = positivePage(match[2]);
    return page === null ? null : { type: "wishOpen", id: match[1], page };
  }
  match = /^w:add:(\d{1,20})$/.exec(data);
  if (match) return { type: "wishAdd", id: match[1] };
  match = /^w:item:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "wishItem", id: match[1], itemId: match[2] };
  match = /^w:del:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "wishDeleteItem", id: match[1], itemId: match[2] };
  match = /^w:delc:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "wishDeleteItemConfirm", id: match[1], itemId: match[2] };
  match = /^w:ef:(\d{1,20}):(\d{1,20}):([tdu])$/.exec(data);
  if (match) {
    const field = listField(match[3]);
    return field === null ? null : { type: "wishEditField", id: match[1], itemId: match[2], field };
  }
  match = /^w:ren:(\d{1,20})$/.exec(data);
  if (match) return { type: "wishRename", id: match[1] };
  match = /^w:dl:(\d{1,20})$/.exec(data);
  if (match) return { type: "wishDeleteList", id: match[1] };
  match = /^w:dlc:(\d{1,20})$/.exec(data);
  if (match) return { type: "wishDeleteListConfirm", id: match[1] };
  match = /^w:share:(\d{1,20})$/.exec(data);
  if (match) return { type: "wishShare", id: match[1] };
  match = /^w:shf:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "wishShareFriend", id: match[1], friendId: match[2] };
  match = /^w:unsh:(\d{1,20}):(\d{1,20})$/.exec(data);
  if (match) return { type: "wishUnshare", id: match[1], friendId: match[2] };

  return null;
}
