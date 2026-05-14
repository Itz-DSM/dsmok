import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DirectMessageSheet } from "@/components/DirectMessageSheet";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Dsmok" }] }),
  component: InboxPage,
});

type ProfileLite = { id: string; username: string; avatar_url: string | null; verified: boolean | null };

type Conversation = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string;
  other: ProfileLite | null;
  preview: string | null;
};

function InboxPage() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ProfileLite | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("conversations")
        .select("id, user_a_id, user_b_id, last_message_at")
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .order("last_message_at", { ascending: false });
      const rows = (data || []) as any[];
      const otherIds = rows.map((c) => (c.user_a_id === user.id ? c.user_b_id : c.user_a_id));
      const [{ data: profs }, { data: msgs }] = await Promise.all([
        otherIds.length ? supabase.from("profiles").select("id, username, avatar_url, verified").in("id", otherIds) : Promise.resolve({ data: [] as any[] }),
        rows.length ? supabase.from("messages").select("conversation_id, text, created_at").in("conversation_id", rows.map((r) => r.id)).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
      ]);
      const profMap: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: any) => (profMap[p.id] = p));
      const lastMsg: Record<string, string> = {};
      (msgs || []).forEach((m: any) => {
        if (!lastMsg[m.conversation_id]) lastMsg[m.conversation_id] = m.text;
      });
      setConvos(rows.map((c) => {
        const otherId = c.user_a_id === user.id ? c.user_b_id : c.user_a_id;
        return { ...c, other: profMap[otherId] ?? null, preview: lastMsg[c.id] ?? null };
      }));
      setLoading(false);
    })();
  }, [user?.id]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 1) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, verified")
        .ilike("username", `%${q}%`)
        .neq("id", user?.id ?? "")
        .limit(8);
      setSearchResults((data as any) || []);
    }, 200);
    return () => clearTimeout(t);
  }, [search, user?.id]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-6">
      <h1 className="mb-4 text-2xl font-bold">Inbox</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Find someone to message…"
        className="w-full rounded-full bg-muted px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
      />

      {searchResults.length > 0 && (
        <div className="mt-2 space-y-1 rounded-xl border border-border bg-card p-2">
          {searchResults.map((p) => (
            <button
              key={p.id}
              onClick={() => { setTarget(p); setSearch(""); setSearchResults([]); }}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"
            >
              <div className="h-9 w-9 overflow-hidden rounded-full bg-muted">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-xs font-bold text-primary-foreground">{p.username[0]?.toUpperCase()}</div>}
              </div>
              <span className="flex items-center gap-1 text-sm font-semibold">@{p.username}<VerifiedBadge verified={p.verified} owner={p.username.toLowerCase() === "itzdsm"} /></span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : convos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10 opacity-60" />
            <p className="text-sm">No conversations yet. Search for someone above to start.</p>
          </div>
        ) : (
          convos.map((c) => (
            <button
              key={c.id}
              onClick={() => c.other && setTarget(c.other)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                {c.other?.avatar_url ? <img src={c.other.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-sm font-bold text-primary-foreground">{c.other?.username?.[0]?.toUpperCase() ?? "?"}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold">
                  @{c.other?.username ?? "unknown"}
                  <VerifiedBadge verified={c.other?.verified} owner={c.other?.username?.toLowerCase() === "itzdsm"} />
                </p>
                <p className="truncate text-xs text-muted-foreground">{c.preview ?? "No messages yet"}</p>
              </div>
            </button>
          ))
        )}
      </div>

      <DirectMessageSheet open={!!target} onClose={() => setTarget(null)} target={target} />
    </div>
  );
}
