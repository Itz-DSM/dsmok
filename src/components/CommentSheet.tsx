import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { renderWithMentions } from "@/lib/mentions";
import { MentionInput } from "./MentionInput";
import { VerifiedBadge } from "./VerifiedBadge";

type Comment = {
  id: string;
  text: string;
  created_at: string;
  user_id: string;
  profiles: { username: string; avatar_url: string | null; verified?: boolean | null } | null;
};

export function CommentSheet({
  open,
  onClose,
  videoId,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  videoId: string;
  onCountChange: (delta: number) => void;
}) {
  const { user } = useAuth();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("comments")
      .select("id, text, created_at, user_id, profiles(username, avatar_url)")
      .eq("video_id", videoId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setList((data as any) || []);
        setLoading(false);
      });
  }, [open, videoId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to comment"); return; }
    const t = text.trim();
    if (!t) return;
    setText("");
    const { data, error } = await supabase
      .from("comments")
      .insert({ video_id: videoId, user_id: user.id, text: t })
      .select("id, text, created_at, user_id, profiles(username, avatar_url)")
      .single();
    if (error) { toast.error(error.message); return; }
    setList((prev) => [data as any, ...prev]);
    onCountChange(1);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative max-h-[75dvh] w-full rounded-t-2xl border-t border-border bg-card p-4 pb-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Comments ({list.length})</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[50dvh] space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Be the first to comment.</p>
          ) : (
            list.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                  {c.profiles?.avatar_url ? (
                    <img src={c.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-xs font-bold text-primary-foreground">
                      {c.profiles?.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">@{c.profiles?.username ?? "unknown"}</p>
                  <p className="text-sm text-foreground/90 break-words">{renderWithMentions(c.text)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={submit} className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <MentionInput
            value={text}
            onChange={setText}
            placeholder={user ? "Add a comment… use @ to mention" : "Sign in to comment"}
            disabled={!user}
            maxLength={500}
            className="flex-1"
            inputClassName="w-full rounded-full bg-muted px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!user || !text.trim()} className="rounded-full bg-gradient-brand p-2 text-primary-foreground disabled:opacity-50">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
