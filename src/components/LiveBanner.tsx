import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LiveItem = {
  id: string;
  title: string;
  host_id: string;
  profiles: { username: string; avatar_url: string | null } | null;
};

export function LiveBanner() {
  const [items, setItems] = useState<LiveItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("live_streams")
        .select("id, title, host_id, profiles:host_id(username, avatar_url)")
        .eq("status", "live")
        .order("started_at", { ascending: false })
        .limit(10);
      if (!cancelled) setItems((data as any) ?? []);
    };
    load();
    const channel = supabase
      .channel("live-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white">
        <Radio className="h-3.5 w-3.5 text-red-500" /> Live now
      </p>
      <div className="no-scrollbar flex gap-3 overflow-x-auto">
        {items.map((s) => (
          <Link
            key={s.id}
            to="/live/$streamId"
            params={{ streamId: s.id }}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <div className="relative h-14 w-14 rounded-full bg-gradient-to-tr from-red-500 to-pink-500 p-[2px]">
              <div className="h-full w-full overflow-hidden rounded-full bg-muted">
                {s.profiles?.avatar_url ? (
                  <img src={s.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-sm font-bold text-primary-foreground">
                    {s.profiles?.username?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold uppercase text-white">
                Live
              </span>
            </div>
            <span className="max-w-[64px] truncate text-[11px] text-white">@{s.profiles?.username ?? "user"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
