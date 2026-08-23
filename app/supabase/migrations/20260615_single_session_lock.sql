-- ── Single-session lock ───────────────────────────────────────────
-- One active session per user. On login, if a row already exists
-- the client shows a "force logout other device" modal.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,          -- UUID generated on login
  device_hint  TEXT,                    -- e.g. "Mac" or hostname (optional)
  last_seen    TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_sessions_select_own" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_sessions_insert_own" ON public.user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sessions_update_own" ON public.user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_sessions_delete_own" ON public.user_sessions
  FOR DELETE USING (auth.uid() = user_id);
