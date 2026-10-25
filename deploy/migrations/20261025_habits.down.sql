-- Rollback for 20261025_habits.up.sql.
-- Destructive: removes only the tables added by the habit tracker.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/migrations/20261025_habits.down.sql

BEGIN;

DROP TABLE IF EXISTS public.habit_completions;
DROP TABLE IF EXISTS public.habit_reminder_settings;
DROP TABLE IF EXISTS public.habits;

COMMIT;
