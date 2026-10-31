-- Per-list daily reminders for ToDo lists.
-- Additive and idempotent: safe to run on an existing production database.
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/migrations/20261031_todo_reminders.up.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.todo_list_reminders (
    list_id bigint NOT NULL,
    reminder_time time without time zone NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    last_notified_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT todo_list_reminders_pkey PRIMARY KEY (list_id),
    CONSTRAINT todo_list_reminders_list_id_fkey
        FOREIGN KEY (list_id) REFERENCES public.todo_lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS todo_list_reminders_enabled_idx
    ON public.todo_list_reminders USING btree (list_id) WHERE is_enabled;

DROP TRIGGER IF EXISTS todo_list_reminders_set_updated_at ON public.todo_list_reminders;
CREATE TRIGGER todo_list_reminders_set_updated_at
    BEFORE UPDATE ON public.todo_list_reminders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
