import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search as SearchIcon, Hash, Video as VideoIcon, User as UserIcon, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — Dsmok" }] }),
  component: SearchPage,
});

type Person = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string | null; verified: boolean | null };
type Vid = {
  id: string;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  profiles: { username: string; avatar_url: string | null } | null;
};
type Tab = "top" | "people" | "videos" | "tags";

function SearchPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("top");
  const [people, setPeople] = useState<Person[]>([]);
  const [videos, setVideos] = useState<Vid[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Allow shortcuts: "@name" → people, "#tag" → tags
  const parsed = useMemo(() => {
    const raw = q.trim();
    if (raw.startsWith("@")) return { mode: "people" as const, term: raw.slice(1) };
    if (raw.startsWith("#")) return { mode: "tags" as const, term: raw.slice(1) };
    return { mode: "all" as const, term: raw };
  }, [q]);

  useEffect(() => {
    if (parsed.mode === "people") setTab("people");
    else if (parsed.mode === "tags") setTab("tags");
  }, [parsed.mode]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const term = parsed.term.replace(/[%_]/g, "");

      // People
      const peopleQ = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, verified")
        .order("created_at", { ascending: false })
        .limit(30);
      if (term) peopleQ.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);

      // Videos by caption
      const videosQ = supabase
        .from("videos")
        .select("id, caption, video_url, thumbnail_url, profiles!videos_user_id_fkey(username, avatar_url, verified)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (term) videosQ.ilike("caption", `%${term}%`);

      const [{ data: pData }, { data: vData }] = await Promise.all([peopleQ, videosQ]);
      setPeople((pData as Person[]) || []);
      setVideos((vData as any) || []);

      // Tags: pull captions matching #term and aggregate
      const tagQ = supabase.from("videos").select("caption").not("caption", "is", null).limit(300);
      if (term) tagQ.ilike("caption", `%#${term}%`);
      else tagQ.ilike("caption", `%#%`);
      const { data: tData } = await tagQ;
      const counts = new Map<string, number>();
      (tData || []).forEach((row: any) => {
        const matches = (row.caption as string).match(/#([a-zA-Z0-9_]{1,40})/g) || [];
        matches.forEach((m) => {
          const tag = m.slice(1).toLowerCase();
          if (term && !tag.includes(term.toLowerCase())) return;
          counts.set(tag, (counts.get(tag) || 0) + 1);
        });
      });
      setTags(
        Array.from(counts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 30)
      );

      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [parsed.term]);

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "top", label: "Top", icon: SearchIcon },
    { id: "people", label: "People", icon: UserIcon },
    { id: "videos", label: "Videos", icon: VideoIcon },
    { id: "tags", label: "Tags", icon: Hash },
  ];

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-6">
      <h1 className="mb-4 text-2xl font-bold">Search</h1>
      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people, videos, or #tags…"
          className="w-full rounded-full border border-border bg-card py-3 pl-11 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {loading && people.length === 0 && videos.length === 0 && tags.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Searching…</p>
      ) : (
        <>
          {(tab === "top" || tab === "tags") && tags.length > 0 && (
            <Section title="Tags">
              <ul className="flex flex-wrap gap-2">
                {(tab === "top" ? tags.slice(0, 8) : tags).map((t) => (
                  <li key={t.tag}>
                    <button
                      onClick={() => setQ(`#${t.tag}`)}
                      className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
                    >
                      <Hash className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{t.tag}</span>
                      <span className="text-xs text-muted-foreground">{t.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(tab === "top" || tab === "people") && people.length > 0 && (
            <Section title="People">
              <ul className="space-y-2">
                {(tab === "top" ? people.slice(0, 5) : people).map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/u/$username"
                      params={{ username: r.username }}
                      className="flex items-center gap-3 rounded-xl bg-card p-3 transition hover:bg-muted"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                        {r.avatar_url ? (
                          <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-base font-bold text-primary-foreground">
                            {r.username[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate font-semibold">@{r.username}<VerifiedBadge verified={r.verified} /></p>
                        {r.display_name && <p className="truncate text-sm text-muted-foreground">{r.display_name}</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(tab === "top" || tab === "videos") && videos.length > 0 && (
            <Section title="Videos">
              <ul className="grid grid-cols-3 gap-2">
                {(tab === "top" ? videos.slice(0, 6) : videos).map((v) => (
                  <li key={v.id}>
                    <Link
                      to="/u/$username"
                      params={{ username: v.profiles?.username ?? "" }}
                      className="group relative block aspect-[9/14] overflow-hidden rounded-lg bg-muted"
                    >
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt={v.caption ?? ""} className="h-full w-full object-cover" />
                      ) : (
                        <video src={v.video_url} className="h-full w-full object-cover" muted preload="metadata" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                      <Play className="absolute right-1.5 top-1.5 h-4 w-4 text-white drop-shadow" fill="currentColor" />
                      {v.caption && (
                        <p className="absolute inset-x-1.5 bottom-1.5 line-clamp-2 text-[11px] font-medium text-white drop-shadow">
                          {v.caption}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!loading && people.length === 0 && videos.length === 0 && tags.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No results. Try a different search.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
