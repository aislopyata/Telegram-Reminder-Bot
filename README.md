# Telegram Reminder Bot

Telegram-бот напоминаний: одноразовые и повторяющиеся (еженедельно/ежемесячно)
напоминания, получатели — сам пользователь или подтверждённый друг, доставка с
повторами при временных ошибках Telegram. Дополнительно — ежедневный трекер
привычек с напоминанием в выбранное локальное время и статистикой.

Проект рассчитан на **один Node.js-процесс на VPS рядом с PostgreSQL**:
long polling Telegram + планировщик `node-cron` каждую минуту. Vercel, Redis и
очереди не используются.

## Стек

- Node.js 20+, TypeScript
- grammY (Telegram Bot API)
- `pg` (параметризованный SQL, без ORM в рантайме)
- `node-cron` — планировщик каждую минуту
- luxon — часовые пояса и DST
- zod — валидация env и данных
- Next.js — только опциональные HTTP-эндпоинты (`/api/health`, webhook, cron)

## Быстрый старт (локально)

```bash
npm ci
cp .env.example .env
# заполнить DATABASE_URL и TELEGRAM_BOT_TOKEN
npm run bot:start
```

Проверки:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` запускает unit-тесты. Интеграционные тесты привычек подключаются к
отдельной тестовой PostgreSQL через `TEST_DATABASE_URL` и пропускаются, если
переменная не задана:

```bash
TEST_DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/telegram_habits_test' npm test
```

Подготовка отдельной тестовой базы (имена/пароль — локальные, не для прода):

```bash
sudo -u postgres psql -c "CREATE ROLE habits_test LOGIN PASSWORD 'habits_test'"
sudo -u postgres createdb -O habits_test telegram_habits_test
psql 'postgresql://habits_test:habits_test@127.0.0.1:5432/telegram_habits_test' \
  -v ON_ERROR_STOP=1 -f deploy/schema.sql
```

## Переменные окружения

| Переменная | Обязательна | Описание |
|---|---|---|
| `DATABASE_URL` | да | `postgresql://user:pass@127.0.0.1:5432/telegram_reminders` |
| `TELEGRAM_BOT_TOKEN` | да | токен от @BotFather |
| `BOT_MODE` | нет | `polling` (по умолчанию) или `webhook` |
| `TELEGRAM_WEBHOOK_SECRET` | для webhook | секрет заголовка Telegram |
| `CRON_SECRET` | нет | защита HTTP-cron роута (если используется Next.js) |
| `APP_BASE_URL` | нет | внешний URL для webhook |
| `LOG_LEVEL` | нет | `debug` / `info` / `warn` / `error` |
| `REMINDER_BATCH_SIZE` | нет | по умолчанию 25 |
| `DELIVERY_BATCH_SIZE` | нет | по умолчанию 50 |
| `MAX_DELIVERY_ATTEMPTS` | нет | по умолчанию 5 |

## Как работает планировщик

Один процесс (`src/bot/index.ts`) каждую минуту (`* * * * *`):

1. Освобождает просроченные lease-блокировки.
2. Забирает до `REMINDER_BATCH_SIZE` напоминаний с `next_run_at <= now` и
   `status = ACTIVE`, ставит им `claim_token`.
3. Создаёт запись `reminder_occurrences` (уникальность `reminder_id + scheduled_at`).
4. Создаёт `reminder_deliveries` для владельца и подтверждённых друзей
   (уникальность `occurrence_id + recipient_user_id`).
5. Одноразовое напоминание переводит в `COMPLETED`, повторяющееся — вычисляет
   следующий запуск в его часовом поясе (DST учитывается).
6. Забирает до `DELIVERY_BATCH_SIZE` доставок (`PENDING`/`RETRYABLE`), отправляет
   и фиксирует `SENT`, `RETRYABLE` (с экспоненциальным backoff) или `PERMANENT`.
7. Синхронизирует статус occurrence с доставками.
8. Отправляет ежедневные напоминания о привычках не чаще одного раза на
   локальный календарный день пользователя. День «занимается» условным
   `UPDATE last_notified_date` до отправки, поэтому перезапуск процесса и
   пересекающиеся запуски cron не создают дублей. Промпт не отправляется, если
   у пользователя нет активных привычек или напоминание выключено.

Статусы доставки: `PENDING`, `PROCESSING`, `SENT`, `RETRYABLE`, `PERMANENT`,
`SKIPPED`. Permanent-ошибки (403/400 от Telegram) не ретраятся бесконечно.

## Трекер привычек

Кнопки «Мои привычки» и «Статистика привычек» находятся в главном меню.

- Привычек может быть любое количество; название — обычный текст до 100
  символов, обрезается по краям, внутренние пробелы схлопываются.
- Ежедневная отметка хранится как календарная дата в часовом поясе пользователя,
  уникальность `(habit_id, completion_date)` не даёт создать дубль. Callback
  содержит желаемое состояние, поэтому повторная доставка update не переключает
  отметку дважды.
- Удаление — мягкое (`is_active = false`): привычка исчезает из трекинга и
  статистики, история отметок сохраняется.
- «Готово на сегодня» только закрывает экран и **не** отмечает невыбранные
  привычки; каждая отметка сохраняется сразу при нажатии.
- Время ежедневного напоминания задаётся в часах и минутах и сохраняется вместе с
  флагом включения. Используется `users.time_zone` (fallback `UTC`). После
  смены часового пояса время трактуется в новом поясе.
- Неделя начинается с понедельника. Знаменатель считается только по прошедшим
  дням: с даты создания привычки (или начала недели, если она создана раньше) по
  сегодня включительно. Будущие даты и удалённые привычки в статистику не
  попадают. Процент округляется до одного знака после запятой.

## База данных

Схема: [`deploy/schema.sql`](deploy/schema.sql). Таблицы:

`users`, `reminders`, `reminder_recipients`, `friend_requests`, `friendships`,
`reminder_occurrences`, `reminder_deliveries`, `conversation_states`, `habits`,
`habit_completions`, `habit_reminder_settings`.

Для существующей базы обновление схемы выполняется версионированными SQL-миграциями
из [`deploy/migrations`](deploy/migrations). Миграция привычек аддитивна и
идемпотентна:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/migrations/20261025_habits.up.sql
```

Откат (удаляет только таблицы трекера привычек и их данные):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f deploy/migrations/20261025_habits.down.sql
```

> В этом проекте реальная схема ведётся через `deploy/schema.sql` и SQL-миграции,
> а не через `prisma migrate deploy`: Prisma-схема не отражает фактическую
> snake_case-схему продакшена. Не применяйте к рабочей базе `prisma migrate`.

Создание БД и пользователя (пример):

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE telegram_reminders_app LOGIN PASSWORD '...';
CREATE DATABASE telegram_reminders OWNER telegram_reminders_app;
SQL

sudo -u postgres psql -d telegram_reminders -f deploy/schema.sql
```

Для чистой установки `deploy/schema.sql` уже содержит таблицы привычек; отдельно
применять миграцию не нужно. Применение миграции поверх свежей схемы безопасно —
все объекты создаются через `IF NOT EXISTS`.

Приложение использует только `DATABASE_URL`; серверный конфиг PostgreSQL менять
не нужно.

## Установка на VPS (systemd)

```bash
# 1. Пользователь и каталог
useradd --system --home /opt/telegram-reminder-bot --shell /usr/sbin/nologin reminderbot || true
mkdir -p /opt/telegram-reminder-bot /etc/telegram-reminder-bot

# 2. Код (rsync с локальной машины)
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .git \
  ./ root@SERVER:/opt/telegram-reminder-bot/

# 3. Зависимости (tsx нужен для запуска TypeScript)
cd /opt/telegram-reminder-bot
npm ci --include=dev

# 4. Окружение
install -m 600 deploy/bot.env.example /etc/telegram-reminder-bot/bot.env
# отредактировать /etc/telegram-reminder-bot/bot.env
chown root:reminderbot /etc/telegram-reminder-bot/bot.env

# 5. systemd
install -m 644 deploy/telegram-reminder-bot.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now telegram-reminder-bot
journalctl -u telegram-reminder-bot -f
```

`deploy/bot.env.example` — тот же набор переменных, что в `.env.example`.

После добавления токена:

```bash
systemctl restart telegram-reminder-bot
journalctl -u telegram-reminder-bot -n 100 --no-pager
```

## Режим webhook (опционально)

По умолчанию используется long polling. Если нужен webhook, поднимите Next.js
(`npm run start`) и выполните:

```bash
BOT_MODE=webhook TELEGRAM_WEBHOOK_SECRET=... APP_BASE_URL=https://... npm run webhook:set
```

HTTP-cron роут (`/api/cron/process-reminders`) оставлен для совместимости, но на
VPS он не нужен: планировщик работает внутри процесса бота.

## Структура

```
src/bot/index.ts             точка входа: cron + long polling
src/lib/scheduler/           claim/lease, создание occurrence/delivery, backoff
src/lib/scheduler/habits.ts  ежедневные напоминания о привычках
src/lib/habits/stats.ts      локальные даты, границы недели, проценты
src/lib/bot/dispatcher.ts    обработка update: команды, callback, диалоги
src/lib/services/            SQL-сервисы (users, friends, reminders, habits, workflows)
src/lib/telegram/            grammY sender, клавиатуры, callback-парсер, рендер
src/lib/time.ts              часовые пояса, DST, следующее срабатывание
src/lib/i18n/ru.ts           все пользовательские строки
```
