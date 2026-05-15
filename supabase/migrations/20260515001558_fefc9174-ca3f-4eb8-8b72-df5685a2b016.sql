-- Live streams
CREATE TABLE public.live_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Live',
  status text NOT NULL DEFAULT 'live',
  viewer_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY live_streams_select_all ON public.live_streams FOR SELECT USING (true);
CREATE POLICY live_streams_insert_own ON public.live_streams FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY live_streams_update_own ON public.live_streams FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY live_streams_delete_own ON public.live_streams FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE INDEX live_streams_status_idx ON public.live_streams (status, started_at DESC);

-- Live chat
CREATE TABLE public.live_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY live_chat_select_all ON public.live_chat FOR SELECT USING (true);
CREATE POLICY live_chat_insert_own ON public.live_chat FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX live_chat_stream_idx ON public.live_chat (stream_id, created_at);

-- Live likes (hearts)
CREATE TABLE public.live_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.live_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY live_likes_select_all ON public.live_likes FOR SELECT USING (true);
CREATE POLICY live_likes_insert_own ON public.live_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX live_likes_stream_idx ON public.live_likes (stream_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_likes;
