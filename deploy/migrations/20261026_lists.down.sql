-- Rollback for ToDo/Wish lists and primary-UI state. Destructive: removes list
-- contents and shares, but does not touch reminders, habits, users or friendships.

DROP TABLE IF EXISTS public.ui_state;
DROP TABLE IF EXISTS public.wish_list_shares;
DROP TABLE IF EXISTS public.wish_list_items;
DROP TABLE IF EXISTS public.wish_lists;
DROP TABLE IF EXISTS public.todo_list_shares;
DROP TABLE IF EXISTS public.todo_items;
DROP TABLE IF EXISTS public.todo_lists;
