/**
 * All user-facing strings live here so another language can be added without
 * touching handlers or Telegram rendering code.
 *
 * Values that include user data are plain strings. Callers HTML-escape any
 * untrusted value (reminder text, names, usernames) before interpolation.
 */

export const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
export const WEEKDAY_FULL = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

export const ru = {
  buttons: {
    back: "⬅️ Назад",
    cancel: "✖️ Отмена",
    menu: "🏠 Главное меню",
    next: "Вперёд ➡️",
    prev: "⬅️ Назад",
    done: "✅ Готово",
    confirm: "✅ Подтвердить",
    save: "✅ Сохранить",
    yes: "✅ Да",
    no: "❌ Нет",
    delete: "🗑 Удалить",
    create: "➕ Создать напоминание",
    myReminders: "📋 Мои напоминания",
    friends: "👥 Друзья",
    settings: "⚙️ Настройки",
    once: "Один раз",
    recurring: "Повторяющееся",
    weekly: "Каждую неделю",
    monthly: "Каждый месяц",
    selfOnly: "👤 Только я",
    withFriend: "👥 Я и друг",
    enable: "▶️ Включить",
    disable: "⏸ Отключить",
    edit: "✏️ Изменить",
    details: "ℹ️ Подробнее",
    editDate: "📅 Изменить дату",
    editTime: "🕒 Изменить время",
    editText: "📝 Изменить текст",
    editDays: "📆 Изменить дни",
    editType: "🔁 Изменить тип",
    editRecipients: "👥 Изменить получателей",
    addFriend: "➕ Добавить друга",
    requests: "📨 Входящие заявки",
    friendList: "👥 Мои друзья",
    removeFriend: "Удалить из друзей",
    timezone: "🌍 Часовой пояс",
    customTimezone: "✍️ Ввести пояс вручную",
    accept: "✅ Принять",
    reject: "❌ Отклонить",
    habits: "✅ Мои привычки",
    habitStats: "📊 Статистика привычек",
    addHabit: "➕ Добавить привычку",
    deleteHabit: "🗑 Удалить привычку",
    trackHabits: "✅ Отметить на сегодня",
    doneToday: "✅ Готово на сегодня",
    notNow: "❌ Не сейчас",
    statsWeek: "📅 Эта неделя",
    statsAll: "🗓 Всё время",
    habitReminder: "⏰ Время трекинга",
    changeTime: "🕒 Изменить время",
    disableHabitReminder: "⏸ Выключить напоминание",
  },

  weekdays: {
    short: WEEKDAY_SHORT,
    full: WEEKDAY_FULL,
  },

  calendar: {
    monthLabel: (year: number, month: number) =>
      new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(
        new Date(Date.UTC(year, month - 1, 1)),
      ),
  },

  common: {
    chipSeparator: ", ",
    noValue: "—",
    page: (page: number, total: number) => `Страница ${page} из ${Math.max(total, 1)}`,
    expired:
      "⏳ Сессия устарела или была отменена. Начните заново из главного меню.",
    noAccess: "🔒 У вас нет доступа к этому действию.",
    staleButton: "Эта кнопка устарела. Откройте меню заново.",
    unknownAction: "Неизвестное действие.",
    internalError: "😔 Что-то пошло не так. Попробуйте ещё раз.",
    onlyText: "Пожалуйста, отправьте текстовое сообщение.",
    useButtons:
      "Я работаю через кнопки. Выберите действие в меню ниже, а текст отправляйте только когда бот его попросит.",
    mainMenu: "Главное меню.",
    noReminders: "У вас пока нет напоминаний.",
    noFriends:
      "У вас пока нет друзей. Добавьте друга по его Telegram-username — он должен сначала открыть этого бота.",
    noRequests: "Входящих заявок нет.",
  },

  onboarding: {
    greeting: (name: string) => `Привет, ${name}! Я бот напоминаний.`,
    chooseTimezone:
      "🌍 Выберите ваш часовой пояс. По нему будут рассчитываться дата и время напоминаний.",
    customPrompt:
      "Отправьте IANA-идентификатор часового пояса одним сообщением, например <code>Europe/Minsk</code>.\n\nНажмите «Отмена», чтобы вернуться.",
    invalidTimezone:
      "Не удалось распознать часовой пояс. Примеры: <code>Europe/Minsk</code>, <code>Europe/Warsaw</code>, <code>Asia/Tokyo</code>. Попробуйте ещё раз или выберите из списка.",
    saved: (zone: string) => `✅ Часовой пояс сохранён: <b>${zone}</b>.`,
  },

  main: {
    title: "🏠 <b>Главное меню</b>",
    greeting: (name: string) => `🏠 <b>Главное меню</b>\n\nПривет, ${name}! Выберите действие.`,
    timezoneLine: (zone: string) => `🌍 Часовой пояс: <b>${zone}</b>`,
  },

  timezone: {
    title: "🌍 <b>Часовой пояс</b>\n\nВыберите из списка или введите IANA-идентификатор вручную.",
    current: (zone: string | null) =>
      zone ? `Текущий пояс: <b>${zone}</b>` : "Часовой пояс ещё не выбран.",
    confirmChanged: (zone: string) =>
      `✅ Часовой пояс изменён на <b>${zone}</b>. Существующие напоминания сохраняют свой прежний пояс.`,
  },

  create: {
    chooseType: "➕ <b>Создание напоминания</b>\n\nКакое напоминание создать?",
    chooseRecurrence:
      "🔁 <b>Тип повторения</b>\n\nВыберите, как часто повторять напоминание.",
    weekdaysTitle:
      "📆 <b>Дни недели</b>\n\nОтметьте один или несколько дней. Напоминание будет приходить в выбранные дни по местному времени.",
    weekdaysEmpty: "Отметьте хотя бы один день недели.",
    monthDaysTitle:
      "📆 <b>Дни месяца</b>\n\nОтметьте один или несколько дней месяца. Если в месяце нет выбранного дня (например, 31-го), этот месяц будет пропущен.",
    monthDaysEmpty: "Отметьте хотя бы один день месяца.",
    chooseDate: (month: string) =>
      `📅 <b>Выбор даты</b>\n\n${month}\nНажмите на день. Стрелки переключают месяц.`,
    chooseHour: "🕒 <b>Выбор часа</b>\n\nСначала выберите час.",
    chooseMinute: (hour: number) =>
      `🕒 <b>Выбор минут</b>\n\nВыбран час: <b>${String(hour).padStart(2, "0")}</b>. Выберите минуты.`,
    enterText:
      "📝 <b>Текст напоминания</b>\n\nОтправьте одним сообщением текст напоминания (до 1000 символов).",
    editTextPrompt:
      "📝 <b>Новый текст</b>\n\nОтправьте одним сообщением новый текст напоминания (до 1000 символов).",
    textEmpty: "Текст напоминания не может быть пустым.",
    textTooLong: (max: number) => `Текст слишком длинный. Максимум ${max} символов.`,
    recipientsTitle:
      "👥 <b>Получатели</b>\n\nНапоминание может получать только вы или вы и один подтверждённый друг.",
    chooseFriend:
      "👥 <b>Выберите друга</b>\n\nДруг получит это напоминание. Редактировать его сможете только вы.",
    friendsEmptyForShare:
      "У вас нет подтверждённых друзей, которым можно отправить напоминание. Добавьте друга в разделе «Друзья».",
    friendUnavailable: "Этот друг больше не доступен. Выберите другого.",
    confirmTitle: "✅ <b>Проверьте напоминание</b>",
    confirmCreated: "✅ <b>Напоминание создано</b>",
    confirmUpdated: "✅ <b>Напоминание обновлено</b>",
    saveFailed: "Не удалось сохранить напоминание.",
    pastTime:
      "⌛ Это время уже прошло. Выберите другое время или дату — напоминания можно создавать только на будущее.",
    invalidSchedule: "Некорректная дата или время. Проверьте выбор.",
    noType: "Сначала выберите тип напоминания.",
    noDays: "Выберите хотя бы один день.",
    noText: "Сначала введите текст напоминания.",
    createdHint: "Напоминание сохранено. Когда наступит время, бот пришлёт сообщение.",
    updatedHint: "Изменения сохранены.",
  },

  fields: {
    text: "📝 <b>Текст:</b>",
    type: "🔁 <b>Тип:</b>",
    recurrence: "🔁 <b>Повторение:</b>",
    date: "📅 <b>Дата и время:</b>",
    nextRun: "⏰ <b>Следующий запуск:</b>",
    timeZone: "🌍 <b>Часовой пояс:</b>",
    recipients: "👥 <b>Получатели:</b>",
    status: "📌 <b>Статус:</b>",
    days: "📆 <b>Дни:</b>",
  },

  reminders: {
    listTitle: "📋 <b>Мои напоминания</b>",
    listEmpty:
      "📋 <b>Мои напоминания</b>\n\nУ вас пока нет напоминаний. Создайте первое!",
    itemOpen: (index: number, title: string) => `${index}. ${title}`,
    total: (count: number) => `Всего: <b>${count}</b>`,
    detailTitle: "ℹ️ <b>Напоминание</b>",
    deleteConfirm:
      "🗑 <b>Удалить напоминание?</b>\n\nЭто действие нельзя отменить. Напоминание и его история доставок будут удалены.",
    deleted: "🗑 Напоминание удалено.",
    enabled: "✅ Напоминание включено.",
    disabled: "⏸ Напоминание отключено.",
    cannotEnablePast:
      "Нельзя включить: время этого одноразового напоминания уже прошло. Измените дату и время.",
    notFound: "Напоминание не найдено.",
    statusActive: "Включено",
    statusDisabled: "Отключено",
    statusCompleted: "Завершено",
    typeOnce: "Один раз",
    typeWeekly: "Еженедельно",
    typeMonthly: "Ежемесячно",
    recipientSelf: "только я",
    recipientFriend: (name: string) => `я и ${name}`,
    daysWeekly: (labels: string[]) => labels.join(", "),
    daysMonthly: (days: number[]) => days.join(", "),
    nextRunNone: "нет (завершено или отключено)",
    toggleActive: "⏸ Отключить",
    toggleDisabled: "▶️ Включить",
    toggleCompleted: "▶️ Включить",
  },

  edit: {
    title: "✏️ <b>Редактирование</b>\n\nЧто изменить?",
    onceNote: "Для одноразового напоминания доступны дата и время.",
  },

  friends: {
    menuTitle:
      "👥 <b>Друзья</b>\n\nДобавляйте друзей по Telegram-username. Друг должен открыть бота и подтвердить заявку.",
    addPrompt:
      "✍️ Отправьте Telegram-username друга одним сообщением, можно с @ или без.\n\nНапример: <code>@username</code>\n\nПользователь должен быть зарегистрирован в боте.",
    invalidUsername:
      "Некорректный username. Используйте латинские буквы, цифры и подчёркивания, например <code>@username</code>.",
    notFound:
      "Пользователь с таким username не найден среди зарегистрированных. Попросите его открыть этого бота и нажать /start, затем попробуйте снова.",
    self: "Нельзя добавить самого себя.",
    alreadyFriends: "Вы уже друзья.",
    alreadyPending: "Заявка уже отправлена и ждёт подтверждения.",
    incomingPending:
      "Этот пользователь уже отправил вам заявку. Откройте «Входящие заявки», чтобы принять её.",
    requestSent: (name: string) => `✅ Заявка отправлена пользователю ${name}. Ждём подтверждения.`,
    requestReceived: (name: string) =>
      `📨 <b>Новая заявка в друзья</b>\n\nПользователь ${name} хочет добавить вас в друзья. Принять?`,
    accepted: (name: string) => `✅ Вы теперь друзья с ${name}.`,
    acceptedBoth: (name: string) => `✅ Заявка принята: вы теперь друзья с ${name}.`,
    acceptedNotify: (name: string) => `✅ ${name} принял(а) вашу заявку. Теперь вы друзья.`,
    rejected: (name: string) => `❌ Заявка от ${name} отклонена.`,
    rejectedNotify: (name: string) => `❌ ${name} отклонил(а) вашу заявку.`,
    requestGone: "Заявка уже обработана или недоступна.",
    requestsTitle: "📨 <b>Входящие заявки</b>",
    listTitle: "👥 <b>Мои друзья</b>",
    listEmpty: "У вас пока нет друзей.",
    listCount: (count: number) => `Всего друзей: <b>${count}</b>`,
    removeConfirm: (name: string) =>
      `Удалить ${name} из друзей?\n\nБудущие совместные напоминания больше не будут ему отправляться. Напоминания останутся у владельца.`,
    removed: (name: string) => `🗑 ${name} удалён(а) из друзей.`,
    removedYou: (name: string) => `👥 ${name} удалил(а) вас из друзей.`,
    sharedReminderLost: (friendName: string, preview: string) =>
      `⚠️ Вы больше не друзья с ${friendName}. Совместное напоминание «${preview}» теперь будет приходить только вам.`,
    requestButton: (name: string) => `📨 ${name}`,
  },

  notifications: {
    reminder: (text: string, fromName?: string) =>
      fromName
        ? `🔔 <b>Напоминание</b>\n\n${text}\n\n👤 От: ${fromName}`
        : `🔔 <b>Напоминание</b>\n\n${text}`,
    recipientRemoved: (friendName: string, preview: string) =>
      `⚠️ <b>Получатель больше не доступен</b>\n\n${friendName} больше не у вас в друзьях, поэтому совместное напоминание «${preview}» будет приходить только вам. Само напоминание сохранено.`,
  },

  habits: {
    menuTitle: "✅ <b>Мои привычки</b>",
    empty:
      "✅ <b>Мои привычки</b>\n\nУ вас пока нет привычек. Создайте первую — и отмечайте её каждый день.",
    created: (name: string) => `✅ Привычка «${name}» создана.`,
    addPrompt:
      "✍️ <b>Новая привычка</b>\n\nОтправьте название одним сообщением (до 100 символов). Например: «Утренняя пробежка».",
    nameEmpty:
      "Название привычки не может быть пустым. Отправьте название ещё раз.",
    nameTooLong: (max: number) =>
      `Название слишком длинное. Максимум ${max} символов.`,
    nameInvalid: "Не удалось сохранить привычку. Попробуйте ещё раз.",
    deleteTitle:
      "🗑 <b>Удалить привычку</b>\n\nВыберите привычку. История отметок сохранится, но привычка исчезнет из трекинга и статистики.",
    deleteEmpty: "Удалять пока нечего: у вас нет активных привычек.",
    deleteConfirm: (name: string) =>
      `🗑 Удалить привычку «${name}»?\n\nИстория отметок сохранится, но она перестанет появляться в трекинге и статистике.`,
    deleted: (name: string) =>
      `🗑 Привычка «${name}» удалена. История сохранена.`,
    notFound: "Привычка не найдена или уже удалена.",
    trackingTitle: "✅ <b>Отметьте привычки</b>",
    trackingDate: (date: string) => `📅 ${date}`,
    trackingEmpty:
      "У вас нет активных привычек. Создайте привычку, чтобы начать трекинг.",
    trackingSaved: "✅ Отметки сохранены.",
    done: "✅ Готово на сегодня. Хорошего дня!",
    notNowDone:
      "Ок, скрыл напоминание. Отметить привычки можно в любой момент в разделе «Мои привычки».",
    statsWeeklyTitle: "📊 <b>Статистика привычек — эта неделя</b>",
    statsAllTimeTitle: "📊 <b>Статистика привычек — всё время</b>",
    statsEmpty:
      "📊 <b>Статистика привычек</b>\n\nПока нет активных привычек для статистики.",
    statsWeekLine: (name: string, completed: number, eligible: number, percent: string) =>
      `${name}: <b>${completed}/${eligible}</b> дн. (${percent}%)`,
    statsWeekNote:
      "Считаются только прошедшие дни недели, начиная с даты создания привычки.",
    statsCreated: (date: string) => `Добавлена: ${date}`,
    statsCompleted: (days: number) => `Отмечено: <b>${days}</b> дн.`,
    statsPeriod: (days: number) => `Период: <b>${days}</b> дн.`,
    statsRate: (percent: string) => `Процент: <b>${percent}%</b>`,
    reminderTitle: "⏰ <b>Ежедневное напоминание</b>",
    reminderCurrent: (time: string | null, enabled: boolean, zone: string) =>
      enabled && time
        ? `Текущее время: <b>${time}</b> (${zone})\nНапоминание включено.`
        : "Напоминание выключено.",
    reminderChooseHour:
      "⏰ <b>Время трекинга</b>\n\nВыберите час, когда присылать напоминание.",
    reminderChooseMinute: (hour: number) =>
      `⏰ <b>Время трекинга</b>\n\nЧас: <b>${String(hour).padStart(2, "0")}</b>. Выберите минуты.`,
    reminderSaved: (time: string, zone: string) =>
      `✅ Напоминание включено: <b>${time}</b> (${zone}).`,
    reminderDisabled: "⏸ Ежедневное напоминание выключено.",
    reminderLine: (time: string, zone: string) =>
      `⏰ Напоминание: <b>${time}</b> (${zone})`,
    reminderLineOff: "⏰ Напоминание: выключено",
    dailyPrompt:
      "⏰ <b>Пора отметить привычки на сегодня!</b>\n\nНажмите «Отметить», чтобы открыть трекер.",
  },

  lists: {
    todoTitle: "📝 <b>Списки задач</b>",
    wishTitle: "🎁 <b>Списки желаний</b>",
    myLists: "📋 <b>Мои списки</b>",
    sharedLists: "👥 <b>Списки друзей</b>",
    noShared: "Пока никто не поделился списками.",
    todoManageTitle:
      "⚙️ <b>Управление списками задач</b>\n\nПереименуйте список или удалите его. Список по умолчанию удалить нельзя.",
    wishManageTitle:
      "⚙️ <b>Управление списками желаний</b>\n\nПереименуйте список или удалите его. Список по умолчанию удалить нельзя.",
    todoCreatePrompt:
      "✍️ <b>Новый список задач</b>\n\nОтправьте название одним сообщением (до 100 символов).",
    wishCreatePrompt:
      "✍️ <b>Новый список желаний</b>\n\nОтправьте название одним сообщением (до 100 символов).",
    renamePrompt: (name: string) =>
      `✍️ <b>Новое название</b>\n\nТекущее название: «${name}». Отправьте новое одним сообщением.`,
    owner: "👤 <b>Владелец:</b>",
    readOnly: "📖 Только чтение",
    editable: "✏️ Можно редактировать",
    todoEmptyItems: "В этом списке пока нет задач.",
    wishEmptyItems: "В этом списке пока нет желаний.",
    reminderTitle: (name: string) =>
      `⏰ <b>Ежедневное напоминание</b>\n\nСписок задач: «${name}»`,
    reminderCurrent: (time: string | null, enabled: boolean, zone: string) =>
      enabled && time
        ? `Текущее время: <b>${time}</b> (${zone})\nНапоминание включено. Задачи приходят полным списком, без кнопок.`
        : "Напоминание выключено.",
    reminderChooseMinute: (hour: number) =>
      `⏰ <b>Время напоминания</b>\n\nЧас: <b>${String(hour).padStart(2, "0")}</b>. Выберите минуты.`,
    reminderSaved: (time: string, zone: string) =>
      `✅ Напоминание включено: <b>${time}</b> (${zone}).\nКаждый день вы будете получать полный список задач.`,
    reminderDisabled: "⏸ Ежедневное напоминание выключено.",
    reminderInvalidTime: "Некорректное время напоминания. Попробуйте ещё раз.",
    todoAddTitlePrompt:
      "✍️ <b>Новая задача</b>\n\nОтправьте название задачи одним сообщением (до 200 символов).",
    wishAddTitlePrompt:
      "🎁 <b>Новое желание</b>\n\nОтправьте название одним сообщением (до 200 символов).",
    addDescriptionPrompt:
      "📝 <b>Описание</b>\n\nОтправьте описание одним сообщением. Можно несколько строк. Отправьте «-», чтобы пропустить.",
    addUrlPrompt:
      "🔗 <b>Ссылка</b>\n\nОтправьте ссылку, начинающуюся с http:// или https://. Отправьте «-», чтобы пропустить.",
    todoBulkPrompt:
      "📥 <b>Добавить несколько задач</b>\n\nОтправьте задачи по одной на строку. Можно вставить список целиком — нумерация и маркеры списка будут удалены автоматически.",
    wishBulkPrompt:
      "📥 <b>Добавить несколько желаний</b>\n\nОтправьте желания по одному на строку. Можно вставить список целиком — нумерация и маркеры списка будут удалены автоматически.",
    bulkNoItems:
      "Не найдено ни одного элемента. Отправьте хотя бы одну непустую строку.",
    bulkTooMany: (max: number) =>
      `Слишком много элементов. Максимум ${max} за одно сообщение. Ничего не добавлено.`,
    bulkAddedTodo: (count: number) => `✅ Добавлено задач: ${count}.`,
    bulkAddedWish: (count: number) => `✅ Добавлено желаний: ${count}.`,
    bulkSkippedTitle: "Не добавлены строки:",
    bulkTitleTooLong: (line: number, max: number) =>
      `строка ${line}: название длиннее ${max} символов`,
    bulkInvalidUrl: (line: number) => `строка ${line}: некорректная ссылка`,
    bulkSkippedMore: (count: number) => `…и ещё ${count}.`,
    editTitlePrompt: (value: string) =>
      `✏️ <b>Новое название</b>\n\nСейчас: «${value}». Отправьте новое название одним сообщением.`,
    editDescriptionPrompt: (value: string | null) =>
      `📝 <b>Новое описание</b>\n\nСейчас: ${value ? `«${value}»` : "пусто"}. Отправьте описание или «-», чтобы очистить.`,
    editUrlPrompt: (value: string | null) =>
      `🔗 <b>Новая ссылка</b>\n\nСейчас: ${value ? `<a href="${value}">${value}</a>` : "пусто"}. Отправьте http(s)-ссылку или «-», чтобы очистить.`,
    todoItemTitle: "📋 <b>Задача</b>",
    wishItemTitle: "🎁 <b>Желание</b>",
    descriptionLabel: "📄 <b>Описание:</b>",
    urlLabel: "🔗 <b>Ссылка:</b>",
    deleteItemConfirm: (title: string) => `🗑 Удалить «${title}»?\n\nЭто действие нельзя отменить.`,
    todoDeleteListConfirm: (name: string) =>
      `🗑 Удалить список задач «${name}»?\n\nВсе задачи внутри будут удалены. Это действие нельзя отменить.`,
    wishDeleteListConfirm: (name: string) =>
      `🗑 Удалить список желаний «${name}»?\n\nВсе желания внутри будут удалены. Это действие нельзя отменить.`,
    defaultCannotDelete: "Список по умолчанию удалить нельзя.",
    itemDeleted: "🗑 Удалено.",
    listDeleted: "🗑 Список удалён.",
    todoCreated: (name: string) => `✅ Список задач «${name}» создан.`,
    wishCreated: (name: string) => `✅ Список желаний «${name}» создан.`,
    renamed: (name: string) => `✅ Новое название: «${name}».`,
    itemSaved: "✅ Сохранено.",
    todoShareTitle: (name: string) =>
      `🔗 <b>Доступ к списку задач</b>\n\n«${name}». Выберите друга и уровень доступа. Делиться можно только с подтверждёнными друзьями.`,
    wishShareTitle: (name: string) =>
      `🔗 <b>Доступ к списку желаний</b>\n\n«${name}». Друзья получают доступ только для чтения.`,
    sharePermissionTitle: (name: string) =>
      `🔐 <b>Уровень доступа</b>\n\nДруг: ${name}. Выберите, что он сможет делать.`,
    shareSaved: (name: string, permission: string) => `✅ Доступ для ${name}: ${permission}.`,
    unshared: (name: string) => `✅ Доступ для ${name} отозван.`,
    noFriends: "У вас пока нет подтверждённых друзей, с которыми можно поделиться списком.",
    invalidName: (max: number) => `Название должно быть от 1 до ${max} символов.`,
    invalidTitle: (max: number) => `Название должно быть от 1 до ${max} символов.`,
    invalidDescription: (max: number) => `Описание слишком длинное. Максимум ${max} символов.`,
    invalidUrl:
      "Ссылка должна начинаться с http:// или https://. Отправьте корректную ссылку или «-».",
    notFound: "Список или элемент не найден.",
    forbidden: "У вас нет прав на это действие.",
    notFriend: "Пользователь больше не у вас в друзьях.",
    emptyDash: "—",
  },

  errors: {
    telegramUnavailable:
      "Не удалось связаться с Telegram. Попробуйте ещё раз через минуту.",
    friendRequestNotifyFailed:
      "Заявка создана, но уведомить получателя не удалось. Он увидит её в разделе «Входящие заявки».",
    notOwner: "Только владелец может изменять это напоминание.",
  },
} as const;
