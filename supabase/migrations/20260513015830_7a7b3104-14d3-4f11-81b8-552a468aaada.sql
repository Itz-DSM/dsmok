GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS comments_parent_comment_id_idx ON public.comments(parent_comment_id);

DROP POLICY IF EXISTS comments_update_own ON public.comments;
CREATE POLICY comments_update_own
ON public.comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.reposts (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);

ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reposts_select_all ON public.reposts;
CREATE POLICY reposts_select_all
ON public.reposts
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS reposts_insert_own ON public.reposts;
CREATE POLICY reposts_insert_own
ON public.reposts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reposts_delete_own ON public.reposts;
CREATE POLICY reposts_delete_own
ON public.reposts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reposts_user_created_idx ON public.reposts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reposts_video_idx ON public.reposts (video_id);

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a_id <> user_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_unique_idx
ON public.conversations (LEAST(user_a_id, user_b_id), GREATEST(user_a_id, user_b_id));

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_participants ON public.conversations;
CREATE POLICY conversations_select_participants
ON public.conversations
FOR SELECT
TO authenticated
USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS conversations_insert_participants ON public.conversations;
CREATE POLICY conversations_insert_participants
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE OR REPLACE FUNCTION public.can_access_conversation(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = _conversation_id
      AND (_user_id = user_a_id OR _user_id = user_b_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_conversation(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages (sender_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_participants ON public.messages;
CREATE POLICY messages_select_participants
ON public.messages
FOR SELECT
TO authenticated
USING (public.can_access_conversation(conversation_id, auth.uid()));

DROP POLICY IF EXISTS messages_insert_participants ON public.messages;
CREATE POLICY messages_insert_participants
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.can_access_conversation(conversation_id, auth.uid())
);

DROP POLICY IF EXISTS messages_update_participants ON public.messages;
CREATE POLICY messages_update_participants
ON public.messages
FOR UPDATE
TO authenticated
USING (public.can_access_conversation(conversation_id, auth.uid()))
WITH CHECK (public.can_access_conversation(conversation_id, auth.uid()));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like','follow','comment','repost','message'));

CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM public.videos WHERE id = NEW.video_id;
  IF owner_id IS NOT NULL AND owner_id <> NEW.user_id THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type, video_id)
    VALUES (owner_id, NEW.user_id, 'repost', NEW.video_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE other_user_id uuid;
BEGIN
  SELECT CASE
    WHEN user_a_id = NEW.sender_id THEN user_b_id
    ELSE user_a_id
  END
  INTO other_user_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF other_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, actor_id, type)
    VALUES (other_user_id, NEW.sender_id, 'message');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reposts_notify ON public.reposts;
CREATE TRIGGER reposts_notify
AFTER INSERT ON public.reposts
FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();

DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.notify_on_message();

ALTER TABLE public.reposts REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;