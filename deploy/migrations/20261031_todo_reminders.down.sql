-- Rollback for 20261031_todo_reminders.up.sql.
-- Destructive: removes only the per-list reminder settings added by this migration.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/migrations/20261031_todo_reminders.down.sql

BEGIN;

DROP TABLE IF EXISTS public.todo_list_reminders;

COMMIT;
