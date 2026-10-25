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

  timezones: (page: number) => `tz:${page}`,
  timezoneSet: (zone: string) => `tz:set:${zone}`,
  timezoneCustom: () => "tz:custom",
} as const;

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
  | { type: "timezones"; page: number }
  | { type: "timezoneSet"; zone: string }
  | { type: "timezoneCustom" };

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
  if (data === "tz:custom") return { type: "timezoneCustom" };

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
    return minute === null ? null : { type: "selectMinute", minute };
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

  return null;
}
