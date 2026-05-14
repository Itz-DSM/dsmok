import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, MessageCircle, UserPlus, Bell, Repeat2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Dsmok" }] }),
  component: NotificationsPage,
});

type Notif = {
  id: string;
  type: "like" | "follow" | "comment" | "repost" | "message";
  video_id: string | null;
  read: boolean;
  created_at: string;
  actor: { username: string; avatar_url: string | null; verified: boolean | null } | null;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function NotificationsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const { data: rows } = await supabase
        .from("notifications")
        .select("id, type, video_id, read, created_at, actor_id")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = (rows as any[]) || [];
      const actorIds = Array.from(new Set(list.map((r) => r.actor_id)));
      let actorMap: Record<string, Notif["actor"]> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, verified")
          .in("id", actorIds);
        (profs || []).forEach((p: any) => {
          actorMap[p.id] = { username: p.username, avatar_url: p.avatar_url, verified: p.verified };
        });
      }
      setItems(list.map((r) => ({ ...r, actor: actorMap[r.actor_id] ?? null })));
      setBusy(false);
      await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
    })();
  }, [user, loading]);

  const verb = (n: Notif) =>
    n.type === "like" ? "liked your video"
      : n.type === "comment" ? "commented on your video"
      : n.type === "repost" ? "reposted your video"
      : n.type === "message" ? "sent you a message"
      : "started following you";
  const Icon = (t: Notif["type"]) =>
    t === "like" ? Heart : t === "comment" ? MessageCircle : t === "repost" ? Repeat2 : t === "message" ? Mail : UserPlus;
  const tint = (t: Notif["type"]) =>
    t === "like" ? "text-primary" : t === "repost" ? "text-secondary" : t === "follow" ? "text-emerald-400" : "text-foreground";

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6" /> Notifications
        </h1>
        <Link to="/inbox" className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted">
          <Mail className="h-4 w-4" /> Messages
        </Link>
      </div>
      {busy ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notifications yet. Get out there and post!</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => {
            const I = Icon(n.type);
            const username = n.actor?.username ?? "someone";
            return (
              <li key={n.id}>
                <Link
                  to="/u/$username"
                  params={{ username }}
                  className={`flex items-center gap-3 rounded-xl p-3 transition hover:bg-muted ${
                    n.read ? "" : "bg-primary/5"
                  }`}
                >
                  <div className="relative">
                    <div className="h-11 w-11 overflow-hidden rounded-full bg-muted">
                      {n.actor?.avatar_url ? (
                        <img src={n.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-sm font-bold text-primary-foreground">
                          {username[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
                      <I className={`h-4 w-4 ${tint(n.type)}`} fill={n.type === "like" ? "currentColor" : "none"} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        @{username}
                        <VerifiedBadge verified={n.actor?.verified} />
                      </span>{" "}
                      <span className="text-muted-foreground">{verb(n)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{timeAgo(n.created_at)} ago</p>
                  </div>
                  {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
