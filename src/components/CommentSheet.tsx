import { useEffect, useMemo, useState } from "react";
import { X, Send, Reply } from "lucide-react";
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
  parent_comment_id: string | null;
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
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("comments")
      .select("id, text, created_at, user_id, parent_comment_id, profiles(username, avatar_url, verified)")
      .eq("video_id", videoId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setList((data as any) || []);
        setLoading(false);
      });
  }, [open, videoId]);

  const { roots, repliesByParent } = useMemo(() => {
    const roots: Comment[] = [];
    const repliesByParent: Record<string, Comment[]> = {};
    for (const c of list) {
      if (c.parent_comment_id) {
        (repliesByParent[c.parent_comment_id] ||= []).push(c);
      } else {
        roots.push(c);
      }
    }
    return { roots, repliesByParent };
  }, [list]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Sign in to comment"); return; }
    const t = text.trim();
    if (!t) return;
    const parentId = replyTo?.id ?? null;
    setText("");
    setReplyTo(null);
    const { data, error } = await supabase
      .from("comments")
      .insert({ video_id: videoId, user_id: user.id, text: t, parent_comment_id: parentId })
      .select("id, text, created_at, user_id, parent_comment_id, profiles(username, avatar_url, verified)")
      .single();
    if (error) { toast.error(error.message); return; }
    setList((prev) => [...prev, data as any]);
    onCountChange(1);
  };

  if (!open) return null;

  const renderComment = (c: Comment, isReply = false) => (
    <div key={c.id} className={`flex gap-3 ${isReply ? "ml-10 mt-2" : ""}`}>
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
        <p className="flex items-center gap-1 text-sm font-semibold">
          @{c.profiles?.username ?? "unknown"}
          <VerifiedBadge verified={c.profiles?.verified} owner={c.profiles?.username?.toLowerCase() === "itzdsm"} />
        </p>
        <p className="text-sm text-foreground/90 break-words">{renderWithMentions(c.text)}</p>
        {!isReply && (
          <button onClick={() => setReplyTo(c)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Reply className="h-3 w-3" /> Reply
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative flex h-[80dvh] w-full flex-col rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="font-semibold">Comments ({list.length})</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : roots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Be the first to comment.</p>
          ) : (
            roots.map((c) => (
              <div key={c.id}>
                {renderComment(c)}
                {(repliesByParent[c.id] || []).map((r) => renderComment(r, true))}
              </div>
            ))
          )}
        </div>

        {replyTo && (
          <div className="mt-2 flex shrink-0 items-center justify-between rounded-lg bg-muted px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Replying to <span className="font-semibold text-foreground">@{replyTo.profiles?.username}</span></span>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>
        )}

        <form onSubmit={submit} className="mt-3 flex shrink-0 items-center gap-2 border-t border-border pt-3">
          <MentionInput
            value={text}
            onChange={setText}
            placeholder={user ? (replyTo ? `Reply to @${replyTo.profiles?.username}…` : "Add a comment… use @ to mention") : "Sign in to comment"}
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
