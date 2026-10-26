import type { Db } from "@/lib/db";
import type {
  InlineKeyboard,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramSender,
  TelegramUpdate,
  TelegramUser,
} from "@/lib/telegram/types";
import { parseCallback, type CallbackAction } from "@/lib/telegram/callbacks";
import { deleteWorkflow, getWorkflow, saveWorkflow, type LoadedWorkflow } from "@/lib/services/workflows";
import {
  findUserByTelegramId,
  setUserTimezone,
  upsertUser,
  type UserRecord,
} from "@/lib/services/users";
import {
  acceptFriendRequest,
  listFriends,
  listIncomingRequests,
  removeFriend,
  rejectFriendRequest,
  sendFriendRequest,
} from "@/lib/services/friends";
import {
  createReminder,
  deleteReminder,
  getReminderForOwner,
  listReminders,
  setReminderEnabled,
  updateReminder,
} from "@/lib/services/reminders";
import { ReminderServiceError } from "@/lib/services/reminders";
import {
  HABIT_NAME_MAX,
  createHabit,
  disableHabitReminder,
  getActiveHabitForUser,
  getHabitReminderSettings,
  getHabitStatistics,
  listActiveHabits,
  listActiveHabitsWithCompletion,
  setHabitCompletion,
  setHabitReminder,
  softDeleteHabit,
  validateHabitName,
} from "@/lib/services/habits";
import { todayInZone } from "@/lib/habits/stats";
import {
  DraftError,
  draftFromReminder,
  newCreateDraft,
  resolveDraft,
  type ReminderDraft,
} from "@/lib/bot/draft";
import { GrammyTelegramSender } from "@/lib/telegram/api";
import { PrimaryUiSender } from "@/lib/telegram/primaryUi";
import { escapeHtml } from "@/lib/telegram/html";
import { ru } from "@/lib/i18n/ru";
import {
  handleListCallback,
  handleListWorkflowText,
  isListCallback,
  isListWorkflow,
} from "./lists";
import {
  calendarKeyboard,
  cancelOnlyKeyboard,
  confirmKeyboard,
  createTypeKeyboard,
  deleteConfirmKeyboard,
  editMenuKeyboard,
  editTypeKeyboard,
  friendListKeyboard,
  friendRemoveConfirmKeyboard,
  friendRequestNotificationKeyboard,
  friendSelectKeyboard,
  friendsMenuKeyboard,
  habitDeleteConfirmKeyboard,
  habitDeleteListKeyboard,
  habitEmptyKeyboard,
  habitReminderHoursKeyboard,
  habitReminderMinutesKeyboard,
  habitReminderSettingsKeyboard,
  habitStatsKeyboard,
  habitTrackingKeyboard,
  habitsListKeyboard,
  hourKeyboard,
  menuKeyboard,
  minuteKeyboard,
  monthDaysKeyboard,
  recurrenceTypeKeyboard,
  recipientKeyboard,
  reminderListKeyboard,
  reminderViewKeyboard,
  requestsKeyboard,
  settingsKeyboard,
  timezoneListKeyboard,
  weekdaysKeyboard,
} from "@/lib/telegram/ui";
import {
  formatDraftConfirmation,
  formatHabitDeleteConfirmation,
  formatHabitDeleteList,
  formatHabitList,
  formatHabitReminderSettings,
  formatHabitStats,
  formatHabitTracking,
  formatReminderListLine,
  formatReminderSummary,
  monthCells,
} from "@/lib/telegram/render";
import { COMMON_TIME_ZONES, isValidTimeZone, shiftMonth, toDateString } from "@/lib/time";
import { normalizeTelegramUsername, REMINDER_TEXT_MAX } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type { WorkflowState } from "@/generated/prisma/client";
import type { DraftStep } from "@/lib/bot/draft";

function sendText(
  sender: TelegramSender,
  chatId: string,
  text: string,
  reply?: InlineKeyboard,
): Promise<number> {
  return sender.sendMessage(chatId, text, reply);
}

/**
 * Habit screens are updated in place when they were opened from an inline
 * button, so repeated taps do not flood the chat with stale keyboards.
 */
async function editOrSend(
  sender: TelegramSender,
  chatId: string,
  messageId: number | null,
  text: string,
  reply?: InlineKeyboard,
): Promise<void> {
  if (messageId !== null) {
    try {
      const result = await sender.editMessageText(chatId, messageId, text, reply);
      if (result === "edited" || result === "unchanged") return;
    } catch (error) {
      logger.debug("habit_message_edit_failed", {
        chatId,
        messageId,
        error: String(error).slice(0, 200),
      });
    }
  }
  await sendText(sender, chatId, text, reply);
}

function displayName(user: UserRecord): string {
  return user.telegramUsername
    ? `${user.firstName} (@${user.telegramUsername})`
    : user.firstName;
}

function chatIdOf(message: TelegramMessage, from: TelegramUser): string {
  return String(message.chat?.id ?? from.id);
}

async function sendMainMenu(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  await sender.sendMessage(chatId, ru.main.greeting(displayName(user)), menuKeyboard());
}

const DRAFT_STATE: Record<DraftStep, WorkflowState> = {
  type: "WIZARD",
  recurrence: "WIZARD",
  weekdays: "WIZARD",
  monthdays: "WIZARD",
  date: "WIZARD",
  hour: "WIZARD",
  minute: "WIZARD",
  text: "AWAIT_TEXT",
  recipients: "WIZARD",
  friend: "WIZARD",
  confirm: "WIZARD",
  editmenu: "WIZARD",
};

async function saveDraft(
  db: Db,
  user: UserRecord,
  draft: ReminderDraft,
  messageId: number | null,
): Promise<void> {
  await saveWorkflow(db, user.id, DRAFT_STATE[draft.step], { kind: "draft", draft }, messageId);
}

async function startCreateFlow(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  patch: Partial<ReminderDraft> = {},
): Promise<void> {
  const user = await upsertUser(db, from);
  const draft: ReminderDraft = {
    ...newCreateDraft(user.timeZone ?? "UTC", new Date()),
    ...patch,
  };
  await renderDraft(db, sender, chatId, user, draft, null);
}

async function renderDraft(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  draft: ReminderDraft,
  messageId: number | null = null,
): Promise<void> {
  let text: string;
  let reply: InlineKeyboard | undefined;

  switch (draft.step) {
    case "type":
      text = ru.create.chooseType;
      reply =
        draft.kind === "edit" && draft.reminderId
          ? editTypeKeyboard(draft.reminderId)
          : createTypeKeyboard();
      break;
    case "recurrence":
      text = ru.create.chooseRecurrence;
      reply = recurrenceTypeKeyboard();
      break;
    case "weekdays":
      text = ru.create.weekdaysTitle;
      reply = weekdaysKeyboard(draft.weekdays);
      break;
    case "monthdays":
      text = ru.create.monthDaysTitle;
      reply = monthDaysKeyboard(draft.monthDays, draft.monthPage);
      break;
    case "date":
      text = ru.create.chooseDate(ru.calendar.monthLabel(draft.calendarYear, draft.calendarMonth));
      reply = calendarKeyboard(
        draft.calendarYear,
        draft.calendarMonth,
        draft.date,
        monthCells(draft.calendarYear, draft.calendarMonth),
      );
      break;
    case "hour":
      text = ru.create.chooseHour;
      reply = hourKeyboard();
      break;
    case "minute":
      text = ru.create.chooseMinute(draft.hour ?? 0);
      reply = minuteKeyboard(draft.hour ?? 0);
      break;
    case "text":
      text = draft.kind === "edit" ? ru.create.editTextPrompt : ru.create.enterText;
      reply = cancelOnlyKeyboard();
      break;
    case "recipients":
      text = ru.create.recipientsTitle;
      reply = recipientKeyboard();
      break;
    case "friend": {
      const friends = await listFriends(db, user.id);
      if (friends.length === 0) {
        await sendText(sender, chatId, ru.create.friendsEmptyForShare, recipientKeyboard());
        await saveDraft(db, user, { ...draft, step: "recipients" }, messageId);
        return;
      }
      text = ru.create.chooseFriend;
      reply = friendSelectKeyboard(friends);
      break;
    }
    case "confirm": {
      const friend = draft.friendUserId
        ? (await listFriends(db, user.id)).find((item) => item.id === draft.friendUserId)
        : undefined;
      const friendName = friend
        ? friend.telegramUsername
          ? `${friend.firstName} (@${friend.telegramUsername})`
          : friend.firstName
        : undefined;
      text = formatDraftConfirmation(draft, friendName);
      reply = confirmKeyboard();
      break;
    }
    case "editmenu": {
      const reminder = draft.reminderId
        ? await getReminderForOwner(db, draft.reminderId, user.id)
        : null;
      if (!reminder) {
        await deleteWorkflow(db, user.id);
        await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
        return;
      }
      text = `${ru.edit.title}\n\n${formatReminderSummary(reminder)}`;
      reply = editMenuKeyboard(reminder.id, draft.page);
      break;
    }
    default:
      await deleteWorkflow(db, user.id);
      await sendText(sender, chatId, ru.common.expired, menuKeyboard());
      return;
  }

  if (messageId !== null) {
    try {
      const result = await sender.editMessageText(chatId, messageId, text, reply);
      if (result === "edited" || result === "unchanged") {
        await saveDraft(db, user, draft, messageId);
        return;
      }
    } catch (error) {
      logger.debug("draft_edit_failed", { chatId, messageId, error: String(error).slice(0, 200) });
    }
  }

  const sentId = await sendText(sender, chatId, text, reply);
  await saveDraft(db, user, draft, sentId);
}

async function loadDraft(
  db: Db,
  from: TelegramUser,
): Promise<{ user: UserRecord; workflow: LoadedWorkflow; draft: ReminderDraft } | null> {
  const user = await upsertUser(db, from);
  const workflow = await getWorkflow(db, user.id);
  if (!workflow || workflow.data.kind !== "draft") return null;
  return { user, workflow, draft: workflow.data.draft };
}

async function handleTypeChoice(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  choice: "ONCE" | "WEEKLY" | "MONTHLY",
): Promise<void> {
  const step: DraftStep = choice === "ONCE" ? "date" : choice === "WEEKLY" ? "weekdays" : "monthdays";
  const loaded = await loadDraft(db, from);
  const patch: Partial<ReminderDraft> = {
    step,
    reminderType: choice === "ONCE" ? "ONCE" : "RECURRING",
    recurrenceType: choice === "ONCE" ? null : choice,
  };
  if (choice === "WEEKLY") patch.weekdays = [];
  if (choice === "MONTHLY") {
    patch.monthDays = [];
    patch.monthPage = 1;
  }

  if (loaded && loaded.draft.kind === "edit") {
    const draft: ReminderDraft = {
      ...loaded.draft,
      ...patch,
      returnToConfirm: true,
      calendarYear: loaded.draft.calendarYear,
      calendarMonth: loaded.draft.calendarMonth,
    };
    await renderDraft(db, sender, chatId, loaded.user, draft, loaded.workflow.messageId);
    return;
  }

  await startCreateFlow(db, sender, chatId, from, patch);
}

async function handleStart(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  if (!user.timezoneConfirmed) {
    const messageId = await sendText(
      sender,
      chatId,
      `${ru.onboarding.greeting(escapeHtml(displayName(user)))}\n\n${ru.onboarding.chooseTimezone}`,
      timezoneListKeyboard([...COMMON_TIME_ZONES], 1),
    );
    await saveWorkflow(db, user.id, "AWAIT_TIMEZONE", { kind: "timezone", origin: "onboarding" }, messageId);
    return;
  }
  await sender.sendMessage(chatId, ru.main.greeting(displayName(user)), menuKeyboard());
}

async function handleCallback(
  db: Db,
  sender: TelegramSender,
  query: TelegramCallbackQuery,
): Promise<void> {
  const chatId = String(query.message?.chat?.id ?? query.from.id);
  const messageId = query.message?.message_id ?? null;
  const action: CallbackAction | null = query.data ? parseCallback(query.data) : null;

  await sender.answerCallbackQuery(query.id, undefined, false);

  if (!action) {
    await sendText(sender, chatId, ru.common.unknownAction);
    return;
  }

  if (isListCallback(action)) {
    await handleListCallback(db, sender, query, action);
    return;
  }

  switch (action.type) {
    case "main":
      await sendMainMenu(db, sender, chatId, query.from);
      return;
    case "createType":
      await startCreateFlow(db, sender, chatId, query.from);
      return;
    case "createOnce":
      await handleTypeChoice(db, sender, chatId, query.from, "ONCE");
      return;
    case "createRecurring": {
      const loaded = await loadDraft(db, query.from);
      if (loaded && loaded.draft.kind === "edit") {
        const draft: ReminderDraft = { ...loaded.draft, step: "recurrence", returnToConfirm: true };
        await renderDraft(db, sender, chatId, loaded.user, draft, loaded.workflow.messageId);
        return;
      }
      await startCreateFlow(db, sender, chatId, query.from, {
        step: "recurrence",
        reminderType: "RECURRING",
        recurrenceType: null,
      });
      return;
    }
    case "createWeekly":
      await handleTypeChoice(db, sender, chatId, query.from, "WEEKLY");
      return;
    case "createMonthly":
      await handleTypeChoice(db, sender, chatId, query.from, "MONTHLY");
      return;
    case "calendar":
      await handleCalendar(db, sender, chatId, query.from, action.direction);
      return;
    case "selectDay":
      await handleSelectDay(db, sender, chatId, query.from, action.day);
      return;
    case "selectHour":
      await handleSelectHour(db, sender, chatId, query.from, action.hour);
      return;
    case "selectMinute":
      await handleSelectMinute(db, sender, chatId, query.from, action.minute);
      return;
    case "toggleWeekday":
      await handleToggleWeekday(db, sender, chatId, query.from, action.day);
      return;
    case "saveWeekdays":
      await handleSaveWeekdays(db, sender, chatId, query.from);
      return;
    case "toggleMonthDay":
      await handleToggleMonthDay(db, sender, chatId, query.from, action.day);
      return;
    case "monthDayPage":
      await handleMonthDayPage(db, sender, chatId, query.from, action.page);
      return;
    case "saveMonthDays":
      await handleSaveMonthDays(db, sender, chatId, query.from);
      return;
    case "recipientSelf":
      await handleRecipientChoice(db, sender, chatId, query.from, null);
      return;
    case "recipientBack":
      await handleRecipientBack(db, sender, chatId, query.from);
      return;
    case "recipientFriend":
      await handleRecipientFriend(db, sender, chatId, query.from);
      return;
    case "recipientFriendId":
      await handleRecipientChoice(db, sender, chatId, query.from, action.friendId);
      return;
    case "cancelWorkflow":
      await handleCancelWorkflow(db, sender, chatId, query.from);
      return;
    case "confirmSave":
      await handleConfirmSave(db, sender, chatId, query.from);
      return;
    case "confirmEditDate":
    case "confirmEditTime":
    case "confirmEditText":
    case "confirmEditRecipients":
      await handleConfirmEdit(db, sender, chatId, query.from, action.type);
      return;
    case "reminders":
      await handleRemindersList(db, sender, chatId, query.from, action.page);
      return;
    case "reminderView":
      await handleReminderView(db, sender, chatId, query.from, action.id, action.page);
      return;
    case "reminderEdit":
      await handleReminderEdit(db, sender, chatId, query.from, action.id, action.page);
      return;
    case "reminderToggle":
      await handleReminderToggle(db, sender, chatId, query.from, action.id, action.page);
      return;
    case "reminderDelete":
      await handleReminderDelete(db, sender, chatId, query.from, action.id, action.page);
      return;
    case "reminderDeleteConfirm":
      await handleReminderDeleteConfirm(db, sender, chatId, query.from, action.id);
      return;
    case "editText":
    case "editDate":
    case "editTime":
    case "editDays":
    case "editType":
    case "editRecipients":
      await handleEditField(db, sender, chatId, query.from, action.type, action.id);
      return;
    case "editBack":
      await handleReminderView(db, sender, chatId, query.from, action.id, action.page);
      return;
    case "friendsMenu":
      await handleFriendsMenu(db, sender, chatId, query.from);
      return;
    case "addFriend":
      await handleAddFriend(db, sender, chatId, query.from);
      return;
    case "friendRequests":
      await handleFriendRequests(db, sender, chatId, query.from);
      return;
    case "friendList":
      await handleFriendList(db, sender, chatId, query.from);
      return;
    case "friendAccept":
      await handleFriendAccept(db, sender, chatId, query.from, action.id);
      return;
    case "friendReject":
      await handleFriendReject(db, sender, chatId, query.from, action.id);
      return;
    case "friendRemove":
      await handleFriendRemove(db, sender, chatId, query.from, action.id);
      return;
    case "friendRemoveConfirm":
      await handleFriendRemoveConfirm(db, sender, chatId, query.from, action.id);
      return;
    case "settings":
      await handleSettings(db, sender, chatId, query.from);
      return;
    case "settingsTimezone":
      await handleSettingsTimezone(db, sender, chatId, query.from);
      return;
    case "timezones":
      await handleTimezones(sender, chatId, action.page);
      return;
    case "timezoneSet":
      await handleTimezoneSet(db, sender, chatId, query.from, action.zone);
      return;
    case "timezoneCustom":
      await handleTimezoneCustom(db, sender, chatId, query.from);
      return;
    case "habitsMenu":
      await handleHabitsMenu(db, sender, chatId, query.from, messageId);
      return;
    case "habitAdd":
      await handleHabitAdd(db, sender, chatId, query.from);
      return;
    case "habitTrack":
      await handleHabitTracking(db, sender, chatId, query.from, messageId);
      return;
    case "habitDone":
      await handleHabitDone(sender, chatId, messageId);
      return;
    case "habitNotNow":
      await handleHabitNotNow(sender, chatId, messageId);
      return;
    case "habitDeleteMenu":
      await handleHabitDeleteMenu(db, sender, chatId, query.from, messageId);
      return;
    case "habitDelete":
      await handleHabitDelete(db, sender, chatId, query.from, action.id, messageId);
      return;
    case "habitDeleteConfirm":
      await handleHabitDeleteConfirm(db, sender, chatId, query.from, action.id, messageId);
      return;
    case "habitToggle":
      await handleHabitToggle(db, sender, chatId, query.from, action.id, action.completed, messageId);
      return;
    case "habitStats":
      await handleHabitStats(db, sender, chatId, query.from, action.view, messageId);
      return;
    case "habitReminder":
      await handleHabitReminder(db, sender, chatId, query.from, messageId);
      return;
    case "habitReminderHour":
      await handleHabitReminderHour(sender, chatId, action.hour, messageId);
      return;
    case "habitReminderMinute":
      await handleHabitReminderMinute(
        db,
        sender,
        chatId,
        query.from,
        action.hour,
        action.minute,
        messageId,
      );
      return;
    case "habitReminderDisable":
      await handleHabitReminderDisable(db, sender, chatId, query.from, messageId);
      return;
    case "noop":
    default:
      logger.warn("callback_unhandled", { callbackData: query.data ?? undefined });
      return;
  }
}

async function handleCancelWorkflow(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  await deleteWorkflow(db, user.id);
  await sendText(sender, chatId, ru.common.mainMenu, menuKeyboard());
}

async function handleCalendar(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  direction: "prev" | "next",
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "date") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  const shifted = shiftMonth(draft.calendarYear, draft.calendarMonth, direction === "prev" ? -1 : 1);
  const next: ReminderDraft = {
    ...draft,
    calendarYear: shifted.year,
    calendarMonth: shifted.month,
  };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleSelectDay(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  day: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "date") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  const date = toDateString(draft.calendarYear, draft.calendarMonth, day);
  const next: ReminderDraft = { ...draft, date, step: "hour" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleSelectHour(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  hour: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "hour") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const next: ReminderDraft = { ...loaded.draft, hour, step: "minute" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleSelectMinute(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  minute: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "minute") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const next: ReminderDraft = {
    ...loaded.draft,
    minute,
    step: loaded.draft.returnToConfirm ? "confirm" : "text",
  };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleToggleWeekday(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  day: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "weekdays") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  const weekdays = draft.weekdays.includes(day)
    ? draft.weekdays.filter((item) => item !== day)
    : [...draft.weekdays, day].sort((a, b) => a - b);
  const next: ReminderDraft = { ...draft, weekdays, recurrenceType: "WEEKLY", reminderType: "RECURRING" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleSaveWeekdays(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "weekdays") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  if (loaded.draft.weekdays.length === 0) {
    await sendText(sender, chatId, ru.create.weekdaysEmpty);
    return;
  }
  const next: ReminderDraft = { ...loaded.draft, step: "hour" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleToggleMonthDay(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  day: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "monthdays") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  const monthDays = draft.monthDays.includes(day)
    ? draft.monthDays.filter((item) => item !== day)
    : [...draft.monthDays, day].sort((a, b) => a - b);
  const next: ReminderDraft = { ...draft, monthDays, recurrenceType: "MONTHLY", reminderType: "RECURRING" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleMonthDayPage(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  page: number,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "monthdays") return;
  const next: ReminderDraft = { ...loaded.draft, monthPage: page };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleSaveMonthDays(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "monthdays") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  if (loaded.draft.monthDays.length === 0) {
    await sendText(sender, chatId, ru.create.monthDaysEmpty);
    return;
  }
  const next: ReminderDraft = { ...loaded.draft, step: "hour" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleRecipientChoice(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  friendUserId: string | null,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || (loaded.draft.step !== "recipients" && loaded.draft.step !== "friend")) {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  const next: ReminderDraft = {
    ...draft,
    recipientMode: friendUserId ? "FRIEND" : "SELF",
    friendUserId,
    step: "confirm",
  };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleRecipientBack(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || (loaded.draft.step !== "recipients" && loaded.draft.step !== "friend")) {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const step: DraftStep = loaded.draft.kind === "edit" ? "confirm" : "text";
  const next: ReminderDraft = { ...loaded.draft, step };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleRecipientFriend(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "recipients") {
    await sendText(sender, chatId, ru.common.staleButton, menuKeyboard());
    return;
  }
  const friends = await listFriends(db, loaded.user.id);
  if (friends.length === 0) {
    await sendText(sender, chatId, ru.create.friendsEmptyForShare, recipientKeyboard());
    return;
  }
  const next: ReminderDraft = { ...loaded.draft, step: "friend" };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleConfirmSave(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "confirm") {
    await sendText(sender, chatId, ru.common.expired, menuKeyboard());
    return;
  }
  const { user, draft } = loaded;

  try {
    const resolved = resolveDraft(draft, new Date());
    const result =
      draft.kind === "create"
        ? await createReminder(db, user.id, resolved)
        : await updateReminder(db, draft.reminderId ?? "", user.id, resolved);

    await deleteWorkflow(db, user.id);
    const reminder = await getReminderForOwner(db, result.id, user.id);
    const title = draft.kind === "create" ? ru.create.confirmCreated : ru.create.confirmUpdated;
    const hint = draft.kind === "create" ? ru.create.createdHint : ru.create.updatedHint;
    const body = reminder ? formatReminderSummary(reminder) : "";
    await sendText(sender, chatId, `${title}\n\n${body}\n\n${hint}`.trim(), menuKeyboard());
  } catch (error) {
    await reportDraftError(db, sender, chatId, user, error);
  }
}

async function reportDraftError(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  error: unknown,
): Promise<void> {
  if (error instanceof DraftError) {
    const message =
      error.code === "NO_TYPE"
        ? ru.create.noType
        : error.code === "NO_DAYS"
          ? ru.create.noDays
          : error.code === "NO_TEXT"
            ? ru.create.noText
            : error.code === "PAST_TIME"
              ? ru.create.pastTime
              : ru.create.invalidSchedule;
    await sendText(sender, chatId, message, menuKeyboard());
    return;
  }
  if (error instanceof ReminderServiceError) {
    const message =
      error.code === "PAST_TIME"
        ? ru.create.pastTime
        : error.code === "INVALID_SCHEDULE"
          ? ru.create.invalidSchedule
          : error.code === "FRIEND_NOT_CONFIRMED"
            ? ru.create.friendUnavailable
            : ru.create.saveFailed;
    await sendText(sender, chatId, message, menuKeyboard());
    return;
  }
  logger.error("reminder_confirm_failed", error, { userId: user.id });
  await sendText(sender, chatId, ru.create.saveFailed, menuKeyboard());
}

async function handleConfirmEdit(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  actionType:
    | "confirmEditDate"
    | "confirmEditTime"
    | "confirmEditText"
    | "confirmEditRecipients",
): Promise<void> {
  const loaded = await loadDraft(db, from);
  if (!loaded || loaded.draft.step !== "confirm") {
    await sendText(sender, chatId, ru.common.expired, menuKeyboard());
    return;
  }
  const draft = loaded.draft;
  let step: DraftStep;
  if (actionType === "confirmEditTime") {
    step = "hour";
  } else if (actionType === "confirmEditText") {
    step = "text";
  } else if (actionType === "confirmEditRecipients") {
    step = "recipients";
  } else if (draft.reminderType === "ONCE") {
    step = "date";
  } else if (draft.recurrenceType === "MONTHLY") {
    step = "monthdays";
  } else {
    step = "weekdays";
  }
  const next: ReminderDraft = { ...draft, step, returnToConfirm: true };
  await renderDraft(db, sender, chatId, loaded.user, next, loaded.workflow.messageId);
}

async function handleRemindersList(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  page: number,
): Promise<void> {
  const user = await upsertUser(db, from);
  const result = await listReminders(db, user.id, page);
  if (result.total === 0) {
    await sendText(
      sender,
      chatId,
      ru.reminders.listEmpty,
      reminderListKeyboard(result.items, result.page, result.totalPages),
    );
    return;
  }
  const lines = result.items.map((reminder, index) =>
    formatReminderListLine(reminder, index + 1 + (result.page - 1) * 5),
  );
  const text = [ru.reminders.listTitle, "", ...lines, "", ru.reminders.total(result.total)].join("\n");
  await sendText(
    sender,
    chatId,
    text,
    reminderListKeyboard(result.items, result.page, result.totalPages),
  );
}

async function handleReminderView(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  page: number,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  await sendText(
    sender,
    chatId,
    formatReminderSummary(reminder),
    reminderViewKeyboard(reminder.id, page, reminder.status !== "DISABLED"),
  );
}

async function handleReminderEdit(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  page: number,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  await sender.sendMessage(chatId, ru.edit.title, editMenuKeyboard(reminder.id, page));
}

async function handleEditField(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  field: "editText" | "editDate" | "editTime" | "editDays" | "editType" | "editRecipients",
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  const draft = draftFromReminder(reminder, 1);

  let step: DraftStep;
  switch (field) {
    case "editText":
      step = "text";
      break;
    case "editTime":
      step = "hour";
      break;
    case "editRecipients":
      step = "recipients";
      break;
    case "editType":
      step = "type";
      break;
    case "editDate":
      if (reminder.type === "ONCE") step = "date";
      else if (reminder.recurrenceType === "MONTHLY") step = "monthdays";
      else step = "weekdays";
      break;
    case "editDays":
      if (reminder.type !== "RECURRING") {
        await sendText(sender, chatId, ru.edit.onceNote, editMenuKeyboard(reminder.id, 1));
        return;
      }
      step = reminder.recurrenceType === "MONTHLY" ? "monthdays" : "weekdays";
      break;
  }

  const next: ReminderDraft = { ...draft, step, returnToConfirm: field !== "editType" };
  await renderDraft(db, sender, chatId, user, next, null);
}

async function handleReminderToggle(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  page: number,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  const enabling = reminder.status === "DISABLED";
  if (
    enabling &&
    reminder.type === "ONCE" &&
    reminder.scheduledAtUtc &&
    reminder.scheduledAtUtc.getTime() <= Date.now()
  ) {
    await sendText(sender, chatId, ru.reminders.cannotEnablePast, editMenuKeyboard(reminder.id, page));
    return;
  }
  const updated = await setReminderEnabled(db, id, user.id, enabling);
  if (!updated) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  const fresh = await getReminderForOwner(db, id, user.id);
  await sendText(
    sender,
    chatId,
    updated.status === "DISABLED" ? ru.reminders.disabled : ru.reminders.enabled,
    fresh
      ? reminderViewKeyboard(fresh.id, page, fresh.status !== "DISABLED")
      : menuKeyboard(),
  );
}

async function handleReminderDelete(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  page: number,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  await sendText(
    sender,
    chatId,
    ru.reminders.deleteConfirm,
    deleteConfirmKeyboard(reminder.id, page),
  );
}

async function handleReminderDeleteConfirm(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const reminder = await getReminderForOwner(db, id, user.id);
  if (!reminder) {
    await sendText(sender, chatId, ru.reminders.notFound, menuKeyboard());
    return;
  }
  await deleteReminder(db, id, user.id);
  await sendText(sender, chatId, ru.reminders.deleted, menuKeyboard());
}

async function notifyUser(
  sender: TelegramSender,
  telegramUserId: string,
  text: string,
  reply?: InlineKeyboard,
): Promise<void> {
  try {
    await sender.sendMessage(telegramUserId, text, reply);
  } catch (error) {
    logger.warn("telegram_notify_failed", {
      telegramUserId,
      error: String(error).slice(0, 200),
    });
  }
}

async function handleFriendsMenu(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const friends = await listFriends(db, user.id);
  await sendText(
    sender,
    chatId,
    `${ru.friends.menuTitle}\n\n${ru.friends.listCount(friends.length)}`,
    friendsMenuKeyboard(),
  );
}

async function handleAddFriend(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const messageId = await sendText(sender, chatId, ru.friends.addPrompt, cancelOnlyKeyboard());
  await saveWorkflow(db, user.id, "AWAIT_FRIEND_USERNAME", { kind: "friend" }, messageId);
}

async function handleFriendRequests(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const requests = await listIncomingRequests(db, user.id);
  if (requests.length === 0) {
    await sendText(sender, chatId, ru.common.noRequests, friendsMenuKeyboard());
    return;
  }
  await sendText(sender, chatId, ru.friends.requestsTitle, requestsKeyboard(requests));
}

async function handleFriendList(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const friends = await listFriends(db, user.id);
  if (friends.length === 0) {
    await sendText(sender, chatId, ru.friends.listEmpty, friendsMenuKeyboard());
    return;
  }
  await sendText(
    sender,
    chatId,
    `${ru.friends.listTitle}\n\n${ru.friends.listCount(friends.length)}`,
    friendListKeyboard(friends),
  );
}

async function handleFriendAccept(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const result = await acceptFriendRequest(db, id, user.id);
  if (result.status !== "accepted") {
    await sendText(sender, chatId, ru.friends.requestGone, friendsMenuKeyboard());
    return;
  }
  await notifyUser(
    sender,
    result.requester.telegramUserId,
    ru.friends.acceptedNotify(escapeHtml(displayName(user))),
  );
  await sendText(
    sender,
    chatId,
    ru.friends.acceptedBoth(escapeHtml(result.requester.firstName)),
    friendsMenuKeyboard(),
  );
}

async function handleFriendReject(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const result = await rejectFriendRequest(db, id, user.id);
  if (result.status !== "rejected") {
    await sendText(sender, chatId, ru.friends.requestGone, friendsMenuKeyboard());
    return;
  }
  await notifyUser(
    sender,
    result.requester.telegramUserId,
    ru.friends.rejectedNotify(escapeHtml(displayName(user))),
  );
  await sendText(
    sender,
    chatId,
    ru.friends.rejected(escapeHtml(result.requester.firstName)),
    friendsMenuKeyboard(),
  );
}

async function handleFriendRemove(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const friends = await listFriends(db, user.id);
  const friend = friends.find((item) => item.id === id);
  if (!friend) {
    await sendText(sender, chatId, ru.friends.listEmpty, friendsMenuKeyboard());
    return;
  }
  await sendText(
    sender,
    chatId,
    ru.friends.removeConfirm(escapeHtml(friend.firstName)),
    friendRemoveConfirmKeyboard(friend.id),
  );
}

async function handleFriendRemoveConfirm(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  const result = await removeFriend(db, user.id, id);
  if (result.status !== "removed") {
    await sendText(sender, chatId, ru.friends.listEmpty, friendsMenuKeyboard());
    return;
  }
  await notifyUser(
    sender,
    result.friend.telegramUserId,
    ru.friends.removedYou(escapeHtml(displayName(user))),
  );
  for (const notice of result.notices) {
    await notifyUser(
      sender,
      notice.ownerTelegramUserId,
      ru.friends.sharedReminderLost(escapeHtml(result.friend.firstName), escapeHtml(notice.text)),
    );
  }
  await sendText(
    sender,
    chatId,
    ru.friends.removed(escapeHtml(result.friend.firstName)),
    friendsMenuKeyboard(),
  );
}

async function handleSettings(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  await sendText(
    sender,
    chatId,
    `${ru.timezone.title}\n\n${ru.timezone.current(user.timeZone ?? null)}`,
    settingsKeyboard(),
  );
}

async function handleSettingsTimezone(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  await sendText(
    sender,
    chatId,
    `${ru.timezone.title}\n\n${ru.timezone.current(user.timeZone ?? null)}`,
    timezoneListKeyboard([...COMMON_TIME_ZONES], 1),
  );
}

async function handleTimezones(
  sender: TelegramSender,
  chatId: string,
  page: number,
): Promise<void> {
  await sendText(sender, chatId, ru.timezone.title, timezoneListKeyboard([...COMMON_TIME_ZONES], page));
}

async function applyTimezone(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  zone: string,
): Promise<void> {
  if (!isValidTimeZone(zone)) {
    await sendText(sender, chatId, ru.onboarding.invalidTimezone, cancelOnlyKeyboard());
    return;
  }
  const updated = await setUserTimezone(db, user.id, zone);
  await deleteWorkflow(db, user.id);
  await sendText(
    sender,
    chatId,
    `${ru.timezone.confirmChanged(escapeHtml(zone))}\n\n${ru.main.greeting(escapeHtml(displayName(updated)))}`,
    menuKeyboard(),
  );
}

async function handleTimezoneSet(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  zone: string,
): Promise<void> {
  const user = await upsertUser(db, from);
  await applyTimezone(db, sender, chatId, user, zone);
}

async function handleTimezoneCustom(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const messageId = await sendText(sender, chatId, ru.onboarding.customPrompt, cancelOnlyKeyboard());
  await saveWorkflow(db, user.id, "AWAIT_TIMEZONE", { kind: "timezone", origin: "settings" }, messageId);
}

function userZone(user: UserRecord): string {
  return user.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : "UTC";
}

async function renderHabitsMenu(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  messageId: number | null,
): Promise<void> {
  const [habits, settings] = await Promise.all([
    listActiveHabits(db, user.id),
    getHabitReminderSettings(db, user.id),
  ]);
  const zone = userZone(user);
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitList(habits, settings, zone),
    habitsListKeyboard(habits.length > 0, settings.enabled),
  );
}

async function handleHabitsMenu(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  await renderHabitsMenu(db, sender, chatId, user, messageId);
}

async function handleHabitAdd(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
): Promise<void> {
  const user = await upsertUser(db, from);
  const messageId = await sendText(sender, chatId, ru.habits.addPrompt, cancelOnlyKeyboard());
  await saveWorkflow(db, user.id, "AWAIT_TEXT", { kind: "habit_name" }, messageId);
}

async function handleHabitName(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  text: string,
): Promise<void> {
  const validated = validateHabitName(text);
  if (!validated.ok) {
    await sendText(
      sender,
      chatId,
      validated.reason === "empty" ? ru.habits.nameEmpty : ru.habits.nameTooLong(HABIT_NAME_MAX),
      cancelOnlyKeyboard(),
    );
    return;
  }

  const habit = await createHabit(db, user.id, validated.name);
  await deleteWorkflow(db, user.id);

  const [habits, settings] = await Promise.all([
    listActiveHabits(db, user.id),
    getHabitReminderSettings(db, user.id),
  ]);
  const list = formatHabitList(habits, settings, userZone(user));
  await sendText(
    sender,
    chatId,
    `${ru.habits.created(escapeHtml(habit.name))}\n\n${list}`,
    habitsListKeyboard(habits.length > 0, settings.enabled),
  );
}

async function handleHabitDeleteMenu(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const habits = await listActiveHabits(db, user.id);
  if (habits.length === 0) {
    await editOrSend(sender, chatId, messageId, ru.habits.deleteEmpty, habitEmptyKeyboard());
    return;
  }
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitDeleteList(habits),
    habitDeleteListKeyboard(habits),
  );
}

async function handleHabitDelete(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const habit = await getActiveHabitForUser(db, id, user.id);
  if (!habit) {
    await renderHabitsMenu(db, sender, chatId, user, messageId);
    return;
  }
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitDeleteConfirmation(habit.name),
    habitDeleteConfirmKeyboard(habit.id),
  );
}

async function handleHabitDeleteConfirm(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const habit = await getActiveHabitForUser(db, id, user.id);
  if (!habit) {
    await renderHabitsMenu(db, sender, chatId, user, messageId);
    return;
  }

  await softDeleteHabit(db, habit.id, user.id);
  const [habits, settings] = await Promise.all([
    listActiveHabits(db, user.id),
    getHabitReminderSettings(db, user.id),
  ]);
  const list = formatHabitList(habits, settings, userZone(user));
  await editOrSend(
    sender,
    chatId,
    messageId,
    `${ru.habits.deleted(escapeHtml(habit.name))}\n\n${list}`,
    habitsListKeyboard(habits.length > 0, settings.enabled),
  );
}

async function handleHabitTracking(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const today = todayInZone(userZone(user));
  const habits = await listActiveHabitsWithCompletion(db, user.id, today);
  if (habits.length === 0) {
    await editOrSend(sender, chatId, messageId, ru.habits.trackingEmpty, habitEmptyKeyboard());
    return;
  }
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitTracking(habits, today),
    habitTrackingKeyboard(habits),
  );
}

async function handleHabitToggle(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  id: string,
  completed: boolean,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const today = todayInZone(userZone(user));
  const result = await setHabitCompletion(db, user.id, id, today, completed);
  const habits = await listActiveHabitsWithCompletion(db, user.id, today);

  if (habits.length === 0) {
    await editOrSend(sender, chatId, messageId, ru.habits.trackingEmpty, habitEmptyKeyboard());
    return;
  }

  const prefix = result === "not_found" ? `${ru.habits.notFound}\n\n` : "";
  await editOrSend(
    sender,
    chatId,
    messageId,
    `${prefix}${formatHabitTracking(habits, today)}`,
    habitTrackingKeyboard(habits),
  );
}

async function handleHabitDone(
  sender: TelegramSender,
  chatId: string,
  messageId: number | null,
): Promise<void> {
  // Deliberately does not write completions: only explicitly toggled habits are marked.
  await editOrSend(sender, chatId, messageId, ru.habits.done, menuKeyboard());
}

async function handleHabitNotNow(
  sender: TelegramSender,
  chatId: string,
  messageId: number | null,
): Promise<void> {
  await editOrSend(sender, chatId, messageId, ru.habits.notNowDone, menuKeyboard());
}

async function handleHabitStats(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  view: "week" | "all",
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const stats = await getHabitStatistics(db, user.id, userZone(user));
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitStats(stats, view),
    habitStatsKeyboard(view),
  );
}

async function handleHabitReminder(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const settings = await getHabitReminderSettings(db, user.id);
  await editOrSend(
    sender,
    chatId,
    messageId,
    formatHabitReminderSettings(settings, userZone(user)),
    habitReminderHoursKeyboard(settings.enabled),
  );
}

async function handleHabitReminderHour(
  sender: TelegramSender,
  chatId: string,
  hour: number,
  messageId: number | null,
): Promise<void> {
  await editOrSend(
    sender,
    chatId,
    messageId,
    ru.habits.reminderChooseMinute(hour),
    habitReminderMinutesKeyboard(hour),
  );
}

async function handleHabitReminderMinute(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  hour: number,
  minute: number,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const settings = await setHabitReminder(db, user.id, time);
  await editOrSend(
    sender,
    chatId,
    messageId,
    ru.habits.reminderSaved(time, escapeHtml(userZone(user))),
    habitReminderSettingsKeyboard(settings.enabled),
  );
}

async function handleHabitReminderDisable(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  from: TelegramUser,
  messageId: number | null,
): Promise<void> {
  const user = await upsertUser(db, from);
  await disableHabitReminder(db, user.id);
  await editOrSend(
    sender,
    chatId,
    messageId,
    ru.habits.reminderDisabled,
    habitReminderSettingsKeyboard(false),
  );
}

async function handleDraftText(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  workflow: LoadedWorkflow,
  text: string,
): Promise<void> {
  const draft = workflow.data.kind === "draft" ? workflow.data.draft : null;
  if (!draft || draft.step !== "text") {
    await sendText(sender, chatId, ru.common.useButtons, menuKeyboard());
    return;
  }
  if (text.length > REMINDER_TEXT_MAX) {
    await sendText(sender, chatId, ru.create.textTooLong(REMINDER_TEXT_MAX));
    return;
  }
  const next: ReminderDraft = {
    ...draft,
    text,
    step: draft.returnToConfirm || draft.kind === "edit" ? "confirm" : "recipients",
  };
  await renderDraft(db, sender, chatId, user, next, null);
}

async function handleFriendUsername(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  text: string,
): Promise<void> {
  if (!normalizeTelegramUsername(text)) {
    await sendText(sender, chatId, ru.friends.invalidUsername, cancelOnlyKeyboard());
    return;
  }

  const result = await sendFriendRequest(db, user.id, text);
  switch (result.status) {
    case "not_found":
      await sendText(sender, chatId, ru.friends.notFound, cancelOnlyKeyboard());
      return;
    case "self":
      await sendText(sender, chatId, ru.friends.self, cancelOnlyKeyboard());
      return;
    case "already_friends":
      await sendText(sender, chatId, ru.friends.alreadyFriends, friendsMenuKeyboard());
      break;
    case "already_pending":
      await sendText(sender, chatId, ru.friends.alreadyPending, friendsMenuKeyboard());
      break;
    case "incoming_pending":
      await sendText(sender, chatId, ru.friends.incomingPending, friendsMenuKeyboard());
      break;
    case "sent":
      await notifyUser(
        sender,
        result.target.telegramUserId,
        ru.friends.requestReceived(escapeHtml(displayName(user))),
        friendRequestNotificationKeyboard(result.request.id),
      );
      await sendText(
        sender,
        chatId,
        ru.friends.requestSent(escapeHtml(result.target.firstName)),
        friendsMenuKeyboard(),
      );
      break;
  }
  await deleteWorkflow(db, user.id);
}

async function handleTimezoneMessage(
  db: Db,
  sender: TelegramSender,
  chatId: string,
  user: UserRecord,
  text: string,
): Promise<void> {
  await applyTimezone(db, sender, chatId, user, text);
}

async function handleMessage(
  db: Db,
  sender: TelegramSender,
  message: TelegramMessage,
): Promise<void> {
  const from = message.from;
  const rawText = message.text;
  if (!from || !rawText) return;

  const chatId = chatIdOf(message, from);
  const trimmed = rawText.trim();
  const commandMatch = /^\/([A-Za-z0-9_]+)/.exec(trimmed);
  const command = commandMatch?.[1]?.toLowerCase();

  if (command === "start") {
    await handleStart(db, sender, chatId, from);
    return;
  }
  if (command === "menu") {
    await sendMainMenu(db, sender, chatId, from);
    return;
  }
  if (command) return;

  const user = await findUserByTelegramId(db, String(from.id));
  if (!user) {
    await sendText(sender, chatId, ru.common.noAccess);
    return;
  }

  const workflow = await getWorkflow(db, user.id);
  if (!workflow) {
    await sendText(sender, chatId, ru.common.useButtons, menuKeyboard());
    return;
  }

  if (!trimmed) {
    if (
      isListWorkflow(workflow) &&
      (workflow.data.kind === "todo_item_bulk" || workflow.data.kind === "wish_item_bulk")
    ) {
      await handleListWorkflowText(db, sender, chatId, user, workflow, rawText);
      return;
    }
    await sendText(sender, chatId, ru.common.onlyText);
    return;
  }

  if (isListWorkflow(workflow)) {
    await handleListWorkflowText(db, sender, chatId, user, workflow, trimmed);
    return;
  }

  if (workflow.data.kind === "draft") {
    await handleDraftText(db, sender, chatId, user, workflow, trimmed);
    return;
  }
  if (workflow.data.kind === "friend") {
    await handleFriendUsername(db, sender, chatId, user, trimmed);
    return;
  }
  if (workflow.data.kind === "habit_name") {
    await handleHabitName(db, sender, chatId, user, trimmed);
    return;
  }
  if (workflow.data.kind === "timezone") {
    await handleTimezoneMessage(db, sender, chatId, user, trimmed);
  }
}

export async function handleTelegramUpdate(
  db: Db,
  update: TelegramUpdate,
  sender: TelegramSender = new GrammyTelegramSender(),
): Promise<void> {
  const actor = update.callback_query?.from ?? update.message?.from;
  const primaryChatId = update.callback_query
    ? String(update.callback_query.message?.chat?.id ?? update.callback_query.from.id)
    : update.message
      ? String(update.message.chat?.id ?? update.message.from?.id ?? "")
      : "";

  // Routine UI updates edit the persisted primary message; notifications sent
  // to other chats and the scheduler's own sender remain untouched.
  const effectiveSender: TelegramSender =
    actor && primaryChatId
      ? new PrimaryUiSender(db, sender, primaryChatId, async () => {
          const user = await upsertUser(db, actor);
          return user.id;
        })
      : sender;

  try {
    if (update.callback_query) {
      await handleCallback(db, effectiveSender, update.callback_query);
      return;
    }
    if (update.message) {
      await handleMessage(db, effectiveSender, update.message);
    }
  } catch (error) {
    logger.error("telegram_update_failed", error, {
      updateId: update.update_id,
      callbackData: update.callback_query?.data,
    });
    const chatId = update.message
      ? String(update.message.chat?.id ?? update.message.from?.id ?? "")
      : update.callback_query
        ? String(update.callback_query.message?.chat?.id ?? update.callback_query.from.id)
        : "";
    if (chatId) {
      try {
        await effectiveSender.sendMessage(chatId, ru.common.internalError, menuKeyboard());
      } catch {
        // ignore secondary failure
      }
    }
  }
}
