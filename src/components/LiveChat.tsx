import { useEffect, useRef, useState } from "react";
import { Heart, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

type Msg = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: { username: string; avatar_url: string | null } | null;
};

export function LiveChat({ streamId }: { streamId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const heartId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: msgs }, { count }] = await Promise.all([
        supabase
          .from("live_chat")
          .select("id, user_id, text, created_at, profiles(username, avatar_url)")
          .eq("stream_id", streamId)
          .order("created_at", { ascending: true })
          .limit(100),
        supabase
          .from("live_likes")
          .select("id", { count: "exact", head: true })
          .eq("stream_id", streamId),
      ]);
      if (cancelled) return;
      setMessages((msgs as any) ?? []);
      setLikeCount(count ?? 0);
    })();

    const channel = supabase
      .channel(`live-feed-${streamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat", filter: `stream_id=eq.${streamId}` },
        async (payload) => {
          const row = payload.new as any;
          const { data: prof } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", row.user_id)
            .maybeSingle();
          setMessages((prev) => [...prev, { ...row, profiles: prof } as Msg]);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_likes", filter: `stream_id=eq.${streamId}` },
        () => {
          setLikeCount((c) => c + 1);
          const id = ++heartId.current;
          const left = 10 + Math.random() * 60;
          setHearts((h) => [...h, { id, left }]);
          setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 2200);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [streamId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to chat"); return; }
    const t = text.trim();
    if (!t) return;
    setText("");
    const { error } = await supabase.from("live_chat").insert({ stream_id: streamId, user_id: user.id, text: t });
    if (error) { setText(t); toast.error(error.message); }
  };

  const sendHeart = async () => {
    if (!user) { toast.error("Sign in to like"); return; }
    await supabase.from("live_likes").insert({ stream_id: streamId, user_id: user.id });
  };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
      {/* Floating hearts */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 h-72 overflow-hidden">
        {hearts.map((h) => (
          <Heart
            key={h.id}
            className="absolute h-6 w-6 animate-heart-rise fill-red-500 text-red-500 drop-shadow"
            style={{ left: `${h.left}%`, bottom: 0 }}
          />
        ))}
      </div>

      {/* Chat list */}
      <div ref={listRef} className="pointer-events-auto mb-2 max-h-64 space-y-2 overflow-y-auto px-3 pb-2">
        {messages.map((m) => (
          <div key={m.id} className="flex items-start gap-2 text-sm">
            <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
              {m.profiles?.avatar_url ? (
                <img src={m.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-[10px] font-bold text-primary-foreground">
                  {m.profiles?.username?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
            </div>
            <div className="min-w-0 rounded-2xl bg-black/55 px-3 py-1.5 text-white backdrop-blur-sm">
              <span className="font-semibold">@{m.profiles?.username ?? "user"}</span>{" "}
              <span className="text-white/90">{m.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={sendMessage}
        className="pointer-events-auto flex items-center gap-2 border-t border-white/10 bg-black/50 px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom))] backdrop-blur"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? "Say something…" : "Sign in to chat"}
          disabled={!user}
          maxLength={200}
          className="flex-1 rounded-full bg-white/15 px-4 py-2 text-sm text-white placeholder:text-white/60 outline-none"
        />
        <button
          type="button"
          onClick={sendHeart}
          className="relative rounded-full bg-white/15 p-2 text-red-400 hover:bg-white/25"
          aria-label="Send heart"
        >
          <Heart className="h-5 w-5 fill-red-500 text-red-500" />
          {likeCount > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {likeCount > 99 ? "99+" : likeCount}
            </span>
          )}
        </button>
        <button
          type="submit"
          disabled={!user || !text.trim()}
          className="rounded-full bg-gradient-brand p-2 text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
