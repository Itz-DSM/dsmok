import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Volume2, VolumeX, Play, MoreVertical, Pencil, Trash2, Repeat2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { CommentSheet } from "./CommentSheet";
import { renderWithMentions } from "@/lib/mentions";
import { MentionInput } from "./MentionInput";
import { VerifiedBadge } from "./VerifiedBadge";

export type FeedVideo = {
  id: string;
  user_id: string;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  profile: { username: string; display_name: string | null; avatar_url: string | null; verified?: boolean | null };
  likes_count: number;
  comments_count: number;
  reposts_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
};

export function VideoCard({
  video,
  active,
  muted,
  onToggleMute,
  onChange,
  onDeleted,
}: {
  video: FeedVideo;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onChange: (next: Partial<FeedVideo>) => void;
  onDeleted?: (id: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();
  const [paused, setPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(video.caption ?? "");
  const [saving, setSaving] = useState(false);
  const isOwner = !!user && user.id === video.user_id;

  const saveCaption = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("videos")
      .update({ caption: draft.trim() || null })
      .eq("id", video.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onChange({ caption: draft.trim() || null });
    setEditing(false);
    toast.success("Caption updated");
  };

  const deleteVideo = async () => {
    if (!confirm("Delete this video? This cannot be undone.")) return;
    const { error } = await supabase.from("videos").delete().eq("id", video.id);
    if (error) { toast.error(error.message); return; }
    // Best-effort: remove storage object if path is recoverable
    try {
      const url = new URL(video.video_url);
      const marker = "/storage/v1/object/public/videos/";
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(url.pathname.slice(idx + marker.length));
        await supabase.storage.from("videos").remove([path]);
      }
    } catch {}
    toast.success("Video deleted");
    onDeleted?.(video.id);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active) {
      el.currentTime = 0;
      el.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      el.pause();
    }
  }, [active]);

  const togglePlay = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) { el.play(); setPaused(false); } else { el.pause(); setPaused(true); }
  };

  const toggleLike = async () => {
    if (!user) { toast.error("Sign in to like videos"); return; }
    const next = !video.liked_by_me;
    onChange({
      liked_by_me: next,
      likes_count: video.likes_count + (next ? 1 : -1),
    });
    if (next) {
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 500);
      await supabase.from("likes").insert({ user_id: user.id, video_id: video.id });
    } else {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", video.id);
    }
  };

  const onDoubleClick = () => {
    if (!video.liked_by_me) toggleLike();
    else { setShowHeart(true); setTimeout(() => setShowHeart(false), 500); }
  };

  return (
    <div className="relative h-[100dvh] w-full snap-start snap-always bg-black">
      <video
        ref={ref}
        src={video.video_url}
        poster={video.thumbnail_url ?? undefined}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={onDoubleClick}
      />

      {paused && (
        <button onClick={togglePlay} className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Play className="h-20 w-20 text-white/80 drop-shadow-lg" fill="currentColor" />
        </button>
      )}

      {showHeart && (
        <Heart className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 animate-pop text-primary drop-shadow-2xl" fill="currentColor" />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />

      {isOwner && (
        <div className="absolute right-3 top-4 z-20">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="rounded-full bg-black/40 p-2 text-white backdrop-blur hover:bg-black/60"
            aria-label="Video options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
                <button
                  onClick={() => { setMenuOpen(false); setDraft(video.caption ?? ""); setEditing(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Pencil className="h-4 w-4" /> Edit caption
                </button>
                <button
                  onClick={() => { setMenuOpen(false); deleteVideo(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
                >
                  <Trash2 className="h-4 w-4" /> Delete video
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setEditing(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">Edit caption</h3>
            <MentionInput
              value={draft}
              onChange={setDraft}
              multiline
              maxLength={500}
              placeholder="Write a caption… use @ to mention someone"
              inputClassName="w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(false)} disabled={saving} className="rounded-full px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={saveCaption} disabled={saving} className="rounded-full bg-gradient-brand px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Bottom-left: author + caption */}
      <div className="absolute inset-x-0 bottom-20 px-4 pb-3 text-white">
        <Link
          to="/u/$username"
          params={{ username: video.profile.username }}
          className="inline-flex items-center gap-1 text-base font-bold drop-shadow"
        >
          @{video.profile.username}
          <VerifiedBadge verified={video.profile.verified} />
        </Link>
        {video.caption && (
          <p className="mt-1 line-clamp-3 max-w-[80%] text-sm leading-snug drop-shadow">
            {renderWithMentions(video.caption)}
          </p>
        )}
      </div>

      {/* Right rail */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5">
        <Link to="/u/$username" params={{ username: video.profile.username }}>
          <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-white bg-muted">
            {video.profile.avatar_url ? (
              <img src={video.profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-base font-bold text-primary-foreground">
                {video.profile.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </Link>

        <button onClick={toggleLike} className="flex flex-col items-center gap-1 text-white">
          <Heart
            className={`h-9 w-9 drop-shadow transition-transform active:scale-90 ${video.liked_by_me ? "text-primary" : "text-white"}`}
            fill={video.liked_by_me ? "currentColor" : "none"}
          />
          <span className="text-xs font-semibold drop-shadow">{video.likes_count}</span>
        </button>

        <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1 text-white">
          <MessageCircle className="h-9 w-9 drop-shadow" />
          <span className="text-xs font-semibold drop-shadow">{video.comments_count}</span>
        </button>

        <button onClick={onToggleMute} className="text-white">
          {muted ? <VolumeX className="h-7 w-7 drop-shadow" /> : <Volume2 className="h-7 w-7 drop-shadow" />}
        </button>
      </div>

      <CommentSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        videoId={video.id}
        onCountChange={(d) => onChange({ comments_count: video.comments_count + d })}
      />
    </div>
  );
}
