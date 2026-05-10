import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — Dsmok" }] }),
  component: SearchPage,
});

type Row = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string | null };

function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .order("created_at", { ascending: false })
        .limit(40);
      if (q.trim()) query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      const { data } = await query;
      setResults((data as Row[]) || []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-6">
      <h1 className="mb-4 text-2xl font-bold">Find creators</h1>
      <div className="relative mb-5">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username…"
          className="w-full rounded-full border border-border bg-card py-3 pl-11 pr-4 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading && results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Searching…</p>
      ) : results.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No creators found.</p>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
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
                  <p className="truncate font-semibold">@{r.username}</p>
                  {r.display_name && <p className="truncate text-sm text-muted-foreground">{r.display_name}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
