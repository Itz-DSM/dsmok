import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { VideoCard, type FeedVideo } from "@/components/VideoCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dsmok — short videos, your way" },
      { name: "description", content: "Discover short videos from creators on Dsmok." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user } = useAuth();
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: vids } = await supabase
        .from("videos")
        .select("id, user_id, caption, video_url, thumbnail_url, created_at, profiles!videos_user_id_fkey(username, display_name, avatar_url, verified)")
        .order("created_at", { ascending: false })
        .limit(50);
      const list = (vids || []) as any[];
      const ids = list.map((v) => v.id);

      let likedSet = new Set<string>();
      let repostedSet = new Set<string>();
      if (user && ids.length) {
        const [{ data: liked }, { data: rep }] = await Promise.all([
          supabase.from("likes").select("video_id").eq("user_id", user.id).in("video_id", ids),
          supabase.from("reposts").select("video_id").eq("user_id", user.id).in("video_id", ids),
        ]);
        likedSet = new Set((liked || []).map((l: any) => l.video_id));
        repostedSet = new Set((rep || []).map((l: any) => l.video_id));
      }

      // counts
      const counts: Record<string, { likes: number; comments: number; reposts: number }> = {};
      if (ids.length) {
        const [{ data: lc }, { data: cc }, { data: rc }] = await Promise.all([
          supabase.from("likes").select("video_id").in("video_id", ids),
          supabase.from("comments").select("video_id").in("video_id", ids),
          supabase.from("reposts").select("video_id").in("video_id", ids),
        ]);
        ids.forEach((id) => (counts[id] = { likes: 0, comments: 0, reposts: 0 }));
        (lc || []).forEach((r: any) => counts[r.video_id].likes++);
        (cc || []).forEach((r: any) => counts[r.video_id].comments++);
        (rc || []).forEach((r: any) => counts[r.video_id].reposts++);
      }

      setVideos(
        list.map((v) => ({
          id: v.id,
          user_id: v.user_id,
          caption: v.caption,
          video_url: v.video_url,
          thumbnail_url: v.thumbnail_url,
          created_at: v.created_at,
          profile: v.profiles,
          likes_count: counts[v.id]?.likes ?? 0,
          comments_count: counts[v.id]?.comments ?? 0,
          reposts_count: counts[v.id]?.reposts ?? 0,
          liked_by_me: likedSet.has(v.id),
          reposted_by_me: repostedSet.has(v.id),
        }))
      );
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || videos.length === 0) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-video-item]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        });
      },
      { root: el, threshold: [0, 0.6, 1] }
    );
    items.forEach((it) => observer.observe(it));
    return () => observer.disconnect();
  }, [videos.length]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="mb-3 text-3xl font-black text-gradient-brand">Dsmok</div>
          <p>Loading feed…</p>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="relative flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-glow)" }} />
        <h1 className="relative text-5xl font-black text-gradient-brand">Dsmok</h1>
        <p className="relative mt-3 max-w-sm text-muted-foreground">No videos yet. Be the first creator on Dsmok.</p>
        <Link to="/upload" className="relative mt-6 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow">
          Upload your first video
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-center pt-4">
        <span className="text-2xl font-black text-gradient-brand drop-shadow">Dsmok</span>
      </div>
      <div
        ref={containerRef}
        className="no-scrollbar h-[100dvh] snap-y snap-mandatory overflow-y-scroll"
      >
        {videos.map((v, i) => (
          <div key={v.id} data-video-item data-index={i} className="h-[100dvh] w-full snap-start snap-always">
            <VideoCard
              video={v}
              active={i === active}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onChange={(next) =>
                setVideos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...next } : p)))
              }
              onDeleted={(id) => setVideos((prev) => prev.filter((p) => p.id !== id))}
            />
          </div>
        ))}
      </div>
    </>
  );
}
