import { cb } from "./callbacks";
import type { InlineButton, InlineKeyboard } from "./types";

export const HOURS = Array.from({ length: 24 }, (_, index) => index);
export const MINUTES = [0, 15, 30, 45];

export function row(...buttons: InlineButton[]): InlineButton[] {
  return buttons;
}

export function keyboard(rows: InlineButton[][]): InlineKeyboard {
  return { inline_keyboard: rows };
}

export function menuKeyboard() {
  return keyboard([
    row({ text: "➕ Создать напоминание", callback_data: cb.createType() }),
    row({ text: "📋 Мои напоминания", callback_data: cb.reminders(1) }),
    row({ text: "✅ Мои привычки", callback_data: cb.habitsMenu() }),
    row({ text: "📊 Статистика привычек", callback_data: cb.habitStats() }),
    row({ text: "👥 Друзья", callback_data: cb.friendsMenu() }),
    row({ text: "⚙️ Настройки", callback_data: cb.settings() }),
  ]);
}

export function backToMenuKeyboard() {
  return keyboard([
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function backCancelKeyboard(backData: string) {
  return keyboard([
    row({ text: "⬅️ Назад", callback_data: backData }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function cancelOnlyKeyboard() {
  return keyboard([
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function createTypeKeyboard() {
  return keyboard([
    row({ text: "Один раз", callback_data: cb.createOnce() }),
    row({ text: "Повторяющееся", callback_data: cb.createRecurring() }),
    row({ text: "⬅️ Назад", callback_data: cb.main() }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function recurrenceTypeKeyboard() {
  return keyboard([
    row({ text: "Каждую неделю", callback_data: cb.weekly() }),
    row({ text: "Каждый месяц", callback_data: cb.monthly() }),
    row({ text: "⬅️ Назад", callback_data: cb.createType() }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function editTypeKeyboard(reminderId: string) {
  return keyboard([
    row({ text: "Один раз", callback_data: cb.createOnce() }),
    row({ text: "Каждую неделю", callback_data: cb.weekly() }),
    row({ text: "Каждый месяц", callback_data: cb.monthly() }),
    row({ text: "⬅️ Назад", callback_data: cb.reminderEdit(reminderId, 1) }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function weekdaysKeyboard(selected: number[]) {
  const labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const buttons = labels.map((label, index) => {
    const day = index + 1;
    const mark = selected.includes(day) ? "✓ " : "";
    return { text: `${mark}${label}`, callback_data: cb.toggleWeekday(day) };
  });

  const rows: InlineButton[][] = [
    [buttons[0], buttons[1], buttons[2], buttons[3]],
    [buttons[4], buttons[5], buttons[6]],
    row({ text: "✅ Готово", callback_data: cb.saveWeekdays() }),
    row({ text: "⬅️ Назад", callback_data: cb.createRecurring() }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ];
  return keyboard(rows);
}

export function monthDaysKeyboard(selected: number[], page = 1) {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const pageSize = 12;
  const totalPages = Math.ceil(days.length / pageSize);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = days.slice((safePage - 1) * pageSize, safePage * pageSize);
  const buttons = slice.map((day) => {
    const mark = selected.includes(day) ? "✓ " : "";
    return { text: `${mark}${day}`, callback_data: cb.toggleMonthDay(day) };
  });

  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }

  const nav: InlineButton[] = [];
  if (safePage > 1) nav.push({ text: "⬅️", callback_data: `md:page:${safePage - 1}` });
  nav.push({ text: `${safePage}/${totalPages}`, callback_data: cb.noop() });
  if (safePage < totalPages) nav.push({ text: "➡️", callback_data: `md:page:${safePage + 1}` });
  if (nav.length) rows.push(nav);

  rows.push(row({ text: "✅ Готово", callback_data: cb.saveMonthDays() }));
  rows.push(row({ text: "⬅️ Назад", callback_data: cb.createRecurring() }));
  rows.push(row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }));
  return keyboard(rows);
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function calendarKeyboard(
  year: number,
  month: number,
  selectedDate: string | null,
  cells: Array<number | null>,
) {
  const labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const header = labels.map((label) => ({ text: label, callback_data: cb.noop() }));
  const rows: InlineButton[][] = [header];

  let week: InlineButton[] = [];
  for (const cell of cells) {
    if (cell === null) {
      week.push({ text: "·", callback_data: cb.noop() });
    } else {
      const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(cell).padStart(2, "0")}`;
      const mark = selectedDate === date ? "✓ " : "";
      week.push({ text: `${mark}${cell}`, callback_data: cb.selectDay(cell) });
    }

    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length) rows.push(week);

  rows.push([
    { text: "⬅️", callback_data: cb.calendarPrev() },
    { text: `${monthKey(year, month)}`, callback_data: cb.noop() },
    { text: "➡️", callback_data: cb.calendarNext() },
  ]);
  rows.push(row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }));
  return keyboard(rows);
}

export function hourKeyboard() {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < HOURS.length; i += 4) {
    rows.push(
      HOURS.slice(i, i + 4).map((hour) => ({
        text: String(hour).padStart(2, "0"),
        callback_data: cb.selectHour(hour),
      })),
    );
  }
  rows.push(row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }));
  return keyboard(rows);
}

export function minuteKeyboard(hour: number) {
  const rows: InlineButton[][] = [
    MINUTES.map((minute) => ({
      text: `:${String(minute).padStart(2, "0")}`,
      callback_data: cb.selectMinute(minute),
    })),
  ];
  rows.push([
    { text: "00", callback_data: cb.selectMinute(0) },
    { text: "05", callback_data: cb.selectMinute(5) },
    { text: "10", callback_data: cb.selectMinute(10) },
    { text: "20", callback_data: cb.selectMinute(20) },
  ]);
  rows.push([
    { text: "25", callback_data: cb.selectMinute(25) },
    { text: "35", callback_data: cb.selectMinute(35) },
    { text: "40", callback_data: cb.selectMinute(40) },
    { text: "50", callback_data: cb.selectMinute(50) },
  ]);
  rows.push([
    { text: "55", callback_data: cb.selectMinute(55) },
    { text: `Час ${String(hour).padStart(2, "0")}`, callback_data: cb.noop() },
  ]);
  rows.push(row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }));
  return keyboard(rows);
}

export function recipientKeyboard() {
  return keyboard([
    row({ text: "👤 Только я", callback_data: cb.recipientSelf() }),
    row({ text: "👥 Я и друг", callback_data: cb.recipientFriend() }),
    row({ text: "⬅️ Назад", callback_data: cb.recipientBack() }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function friendSelectKeyboard(
  friends: Array<{ id: string; firstName: string; telegramUsername: string | null }>,
) {
  const rows: InlineButton[][] = friends.map((friend) => [
    {
      text: friend.telegramUsername ? `${friend.firstName} (@${friend.telegramUsername})` : friend.firstName,
      callback_data: cb.recipientFriendId(friend.id),
    },
  ]);
  rows.push(row({ text: "⬅️ Назад", callback_data: cb.recipientBack() }));
  rows.push(row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }));
  return keyboard(rows);
}

export function confirmKeyboard() {
  return keyboard([
    row({ text: "✅ Подтвердить", callback_data: cb.confirmSave() }),
    row({ text: "📅 Дата", callback_data: cb.confirmEditDate() }),
    row({ text: "🕒 Время", callback_data: cb.confirmEditTime() }),
    row({ text: "📝 Текст", callback_data: cb.confirmEditText() }),
    row({ text: "👥 Получатели", callback_data: cb.confirmEditRecipients() }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function editMenuKeyboard(reminderId: string, page: number) {
  return keyboard([
    row({ text: "📝 Текст", callback_data: cb.editText(reminderId) }),
    row({ text: "📅 Дата", callback_data: cb.editDate(reminderId) }),
    row({ text: "🕒 Время", callback_data: cb.editTime(reminderId) }),
    row({ text: "📆 Дни", callback_data: cb.editDays(reminderId) }),
    row({ text: "🔁 Тип", callback_data: cb.editType(reminderId) }),
    row({ text: "👥 Получатели", callback_data: cb.editRecipients(reminderId) }),
    row({ text: "⬅️ К напоминанию", callback_data: cb.reminderView(reminderId, page) }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function reminderListKeyboard(
  items: Array<{ id: string }>,
  page: number,
  totalPages: number,
) {
  const rows: InlineButton[][] = items.map((item, index) => [
    { text: `${index + 1 + (page - 1) * 5}. Открыть`, callback_data: cb.reminderView(item.id, page) },
  ]);

  const nav: InlineButton[] = [];
  if (page > 1) nav.push({ text: "⬅️", callback_data: cb.reminders(page - 1) });
  nav.push({ text: `${page}/${totalPages}`, callback_data: cb.noop() });
  if (page < totalPages) nav.push({ text: "➡️", callback_data: cb.reminders(page + 1) });
  if (nav.length) rows.push(nav);

  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function reminderViewKeyboard(reminderId: string, page: number, enabled: boolean) {
  return keyboard([
    row({ text: "✏️ Изменить", callback_data: cb.reminderEdit(reminderId, page) }),
    row(
      { text: enabled ? "⏸ Отключить" : "▶️ Включить", callback_data: cb.reminderToggle(reminderId, page) },
      { text: "🗑 Удалить", callback_data: cb.reminderDelete(reminderId, page) },
    ),
    row({ text: "⬅️ К списку", callback_data: cb.reminders(page) }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function deleteConfirmKeyboard(reminderId: string, page: number) {
  return keyboard([
    row({ text: "🗑 Да, удалить", callback_data: cb.reminderDeleteConfirm(reminderId, page) }),
    row({ text: "⬅️ Назад", callback_data: cb.reminderView(reminderId, page) }),
    row({ text: "✖️ Отмена", callback_data: cb.cancelWorkflow() }),
  ]);
}

export function friendsMenuKeyboard() {
  return keyboard([
    row({ text: "➕ Добавить друга", callback_data: cb.addFriend() }),
    row({ text: "📨 Входящие заявки", callback_data: cb.friendRequests(1) }),
    row({ text: "👥 Мои друзья", callback_data: cb.friendList(1) }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function requestsKeyboard(
  requests: Array<{ id: string; requester: { firstName: string } }>,
) {
  const rows: InlineButton[][] = requests.map((request) => [
    { text: `📨 ${request.requester.firstName}`, callback_data: cb.noop() },
    {
      text: "✅ Принять",
      callback_data: cb.friendAccept(request.id),
    },
    {
      text: "❌ Отклонить",
      callback_data: cb.friendReject(request.id),
    },
  ]);
  rows.push(row({ text: "⬅️ Назад", callback_data: cb.friendsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function friendRequestNotificationKeyboard(requestId: string) {
  return keyboard([
    row(
      { text: "✅ Принять", callback_data: cb.friendAccept(requestId) },
      { text: "❌ Отклонить", callback_data: cb.friendReject(requestId) },
    ),
  ]);
}

export function friendListKeyboard(friends: Array<{ id: string; firstName: string }>) {
  const rows: InlineButton[][] = friends.map((friend) => [
    { text: friend.firstName, callback_data: cb.noop() },
    { text: "🗑 Удалить", callback_data: cb.friendRemove(friend.id) },
  ]);
  rows.push(row({ text: "⬅️ Назад", callback_data: cb.friendsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function friendRemoveConfirmKeyboard(friendId: string) {
  return keyboard([
    row({ text: "🗑 Да, удалить", callback_data: cb.friendRemoveConfirm(friendId) }),
    row({ text: "⬅️ Назад", callback_data: cb.friendList(1) }),
  ]);
}

export function settingsKeyboard() {
  return keyboard([
    row({ text: "🌍 Часовой пояс", callback_data: cb.settingsTimezone() }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function timezoneListKeyboard(zones: string[], page: number) {
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(zones.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = zones.slice((safePage - 1) * pageSize, safePage * pageSize);

  const rows: InlineButton[][] = slice.map((zone) => [
    { text: zone, callback_data: cb.timezoneSet(zone) },
  ]);

  const nav: InlineButton[] = [];
  if (safePage > 1) nav.push({ text: "⬅️", callback_data: cb.timezones(safePage - 1) });
  nav.push({ text: `${safePage}/${totalPages}`, callback_data: cb.noop() });
  if (safePage < totalPages) nav.push({ text: "➡️", callback_data: cb.timezones(safePage + 1) });
  if (nav.length) rows.push(nav);

  rows.push(row({ text: "✍️ Ввести вручную", callback_data: cb.timezoneCustom() }));
  rows.push(row({ text: "⬅️ Назад", callback_data: cb.settings() }));
  return keyboard(rows);
}

export const HABIT_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

function shortenButtonLabel(value: string, maxUnits = 56): string {
  let result = "";
  for (const char of value) {
    // Telegram limits button text in UTF-16 units; never split a surrogate pair.
    if (result.length + char.length > maxUnits - 1) return `${result}…`;
    result += char;
  }
  return result;
}

export function habitsListKeyboard(hasHabits: boolean, reminderEnabled: boolean) {
  const rows: InlineButton[][] = [
    row({ text: "➕ Добавить привычку", callback_data: cb.habitAdd() }),
  ];
  if (hasHabits) {
    rows.push(row({ text: "✅ Отметить на сегодня", callback_data: cb.habitTrack() }));
    rows.push(
      row(
        { text: "🗑 Удалить привычку", callback_data: cb.habitDeleteMenu() },
        { text: "📊 Статистика", callback_data: cb.habitStats() },
      ),
    );
  }
  rows.push(
    row({
      text: reminderEnabled ? "⏰ Время трекинга" : "⏰ Настроить напоминание",
      callback_data: cb.habitReminder(),
    }),
  );
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitEmptyKeyboard() {
  return keyboard([
    row({ text: "➕ Добавить привычку", callback_data: cb.habitAdd() }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}

export function habitDeleteListKeyboard(habits: Array<{ id: string; name: string }>) {
  const buttons: InlineButton[] = habits.map((habit) => ({
    text: `🗑 ${shortenButtonLabel(habit.name)}`,
    callback_data: cb.habitDelete(habit.id),
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }
  rows.push(row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitDeleteConfirmKeyboard(habitId: string) {
  return keyboard([
    row({ text: "🗑 Да, удалить", callback_data: cb.habitDeleteConfirm(habitId) }),
    row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }),
  ]);
}

export function habitTrackingKeyboard(
  habits: Array<{ id: string; name: string; completed: boolean }>,
) {
  const buttons: InlineButton[] = habits.map((habit) => ({
    text: `${habit.completed ? "☑️" : "⬜️"} ${shortenButtonLabel(habit.name)}`,
    callback_data: cb.habitToggle(habit.id, !habit.completed),
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < buttons.length; i += 3) {
    rows.push(buttons.slice(i, i + 3));
  }
  rows.push(row({ text: "✅ Готово на сегодня", callback_data: cb.habitDone() }));
  rows.push(row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitPromptKeyboard() {
  return keyboard([
    row({ text: "✅ Отметить привычки", callback_data: cb.habitTrack() }),
    row({ text: "❌ Не сейчас", callback_data: cb.habitNotNow() }),
  ]);
}

export function habitReminderHoursKeyboard(reminderEnabled: boolean) {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < HOURS.length; i += 4) {
    rows.push(
      HOURS.slice(i, i + 4).map((hour) => ({
        text: String(hour).padStart(2, "0"),
        callback_data: cb.habitReminderHour(hour),
      })),
    );
  }
  if (reminderEnabled) {
    rows.push(
      row({ text: "⏸ Выключить напоминание", callback_data: cb.habitReminderDisable() }),
    );
  }
  rows.push(row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitReminderMinutesKeyboard(hour: number) {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < HABIT_MINUTES.length; i += 4) {
    rows.push(
      HABIT_MINUTES.slice(i, i + 4).map((minute) => ({
        text: String(minute).padStart(2, "0"),
        callback_data: cb.habitReminderMinute(hour, minute),
      })),
    );
  }
  rows.push(row({ text: "⬅️ К выбору часа", callback_data: cb.habitReminder() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitReminderSettingsKeyboard(reminderEnabled: boolean) {
  const rows: InlineButton[][] = [
    row({ text: "🕒 Изменить время", callback_data: cb.habitReminder() }),
  ];
  if (reminderEnabled) {
    rows.push(
      row({ text: "⏸ Выключить напоминание", callback_data: cb.habitReminderDisable() }),
    );
  }
  rows.push(row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }));
  rows.push(row({ text: "🏠 Главное меню", callback_data: cb.main() }));
  return keyboard(rows);
}

export function habitStatsKeyboard(view: "week" | "all") {
  return keyboard([
    row(
      view === "week"
        ? { text: "🗓 Всё время", callback_data: cb.habitStatsAll() }
        : { text: "📅 Эта неделя", callback_data: cb.habitStatsWeek() },
    ),
    row({ text: "⬅️ К привычкам", callback_data: cb.habitsMenu() }),
    row({ text: "🏠 Главное меню", callback_data: cb.main() }),
  ]);
}
