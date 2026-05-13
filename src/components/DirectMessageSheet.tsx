import { useEffect, useMemo, useState } from "react";
import { X, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProfileSummary = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type MessageRow = {
  id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

export function DirectMessageSheet({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: ProfileSummary | null;
}) {
  const { user, isGuest } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const channelName = useMemo(
    () => (conversationId ? `conversation-${conversationId}` : null),
    [conversationId]
  );

  useEffect(() => {
    if (!open || !user || !target) return;
    let cancelled = false;

    const loadConversation = async () => {
      setLoading(true);
      const pairA = [user.id, target.id].sort();

      let { data: convo, error } = await supabase
        .from("conversations")
        .select("id, user_a_id, user_b_id")
        .eq("user_a_id", pairA[0])
        .eq("user_b_id", pairA[1])
        .maybeSingle();

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      if (!convo) {
        const created = await supabase
          .from("conversations")
          .insert({ user_a_id: pairA[0], user_b_id: pairA[1] })
          .select("id, user_a_id, user_b_id")
          .single();
        if (created.error) {
          toast.error(created.error.message);
          setLoading(false);
          return;
        }
        convo = created.data;
      }

      const { data: rows, error: msgError } = await supabase
        .from("messages")
        .select("id, sender_id, text, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: true });

      if (!cancelled) {
        setConversationId(convo.id);
        setMessages((rows as MessageRow[]) ?? []);
        setLoading(false);
      }

      if (msgError) toast.error(msgError.message);
    };

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id, target?.id]);

  useEffect(() => {
    if (!channelName || !conversationId) return;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as MessageRow];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, conversationId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !conversationId) return;
    const value = text.trim();
    if (!value) return;
    setSending(true);
    setText("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      text: value,
    });
    setSending(false);
    if (error) {
      setText(value);
      toast.error(error.message);
    }
  };

  if (!open || !target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative flex h-[80dvh] w-full flex-col rounded-t-2xl border-t border-border bg-card p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Messages with @{target.username}</h3>
            {isGuest && <p className="text-xs text-muted-foreground">Guest accounts can message during their active session.</p>}
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pb-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Say hey.</p>
          ) : (
            messages.map((message) => {
              const mine = message.sender_id === user?.id;
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {message.text}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border pt-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message…"
            maxLength={1000}
            className="flex-1 rounded-full bg-muted px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={sending || !text.trim()} className="rounded-full bg-gradient-brand text-primary-foreground hover:opacity-90">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}