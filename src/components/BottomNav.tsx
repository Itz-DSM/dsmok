import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, PlusSquare, User, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export function BottomNav() {
  const { pathname } = useLocation();
  const { profile, user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("read", false);
      if (!cancelled) setUnread(count ?? 0);
    };
    load();
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => setUnread((c) => c + 1)
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.id]);

  // Clear badge once viewing notifications
  useEffect(() => {
    if (pathname === "/notifications") setUnread(0);
  }, [pathname]);

  const items: { to: string; icon: typeof Home; label: string; highlight?: boolean; badge?: number }[] = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/upload", icon: PlusSquare, label: "Create", highlight: true },
    { to: "/notifications", icon: Bell, label: "Inbox", badge: unread },
    { to: profile ? `/u/${profile.username}` : "/auth", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
        {items.map((it) => {
          const active =
            it.to === "/"
              ? pathname === "/"
              : pathname.startsWith(it.to.split("/").slice(0, 2).join("/"));
          const Icon = it.icon;
          if (it.highlight) {
            return (
              <Link key={it.label} to={it.to} className="-mt-3">
                <div className="flex h-12 w-14 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </div>
              </Link>
            );
          }
          return (
            <Link
              key={it.label}
              to={it.to}
              className={`relative flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon className="h-6 w-6" />
                {!!it.badge && it.badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {it.badge > 9 ? "9+" : it.badge}
                  </span>
                )}
              </div>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
