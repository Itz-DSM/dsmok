import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, Camera, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} on Dsmok` },
      { name: "description", content: `View @${params.username}'s videos on Dsmok.` },
    ],
  }),
  component: ProfilePage,
});

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean | null;
};

function ProfilePage() {
  const { username } = Route.useParams();
  const { user, profile: meProfile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<{ id: string; video_url: string; thumbnail_url: string | null }[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const isMe = meProfile?.username === username;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (!p) { setLoading(false); return; }
      setProfile(p as Profile);
      setBio(p.bio ?? "");
      setDisplayName(p.display_name ?? "");
      const [{ data: vids }, { data: fers }, { data: fing }] = await Promise.all([
        supabase.from("videos").select("id, video_url, thumbnail_url").eq("user_id", p.id).order("created_at", { ascending: false }),
        supabase.from("follows").select("follower_id").eq("following_id", p.id),
        supabase.from("follows").select("following_id").eq("follower_id", p.id),
      ]);
      setVideos((vids as any) || []);
      setFollowers(fers?.length || 0);
      setFollowing(fing?.length || 0);
      if (user) {
        const { data: f } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle();
        setIsFollowing(!!f);
      }
      setLoading(false);
    })();
  }, [username, user]);

  const toggleFollow = async () => {
    if (!user || !profile) { navigate({ to: "/auth" }); return; }
    if (isFollowing) {
      setIsFollowing(false); setFollowers((f) => f - 1);
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    } else {
      setIsFollowing(true); setFollowers((f) => f + 1);
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
    }).eq("id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    setEditing(false);
    await refreshProfile();
    setProfile((p) => p ? { ...p, display_name: displayName.trim() || null, bio: bio.trim() || null } : p);
  };

  const onAvatar = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
    setProfile((p) => p ? { ...p, avatar_url: pub.publicUrl } : p);
    await refreshProfile();
    toast.success("Avatar updated");
  };

  if (loading) return <div className="flex h-[80dvh] items-center justify-center text-muted-foreground">Loading…</div>;
  if (!profile) return (
    <div className="flex h-[80dvh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg font-semibold">User not found</p>
      <Link to="/search" className="text-sm text-primary underline">Search creators</Link>
    </div>
  );

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-6">
      <div className="flex items-start justify-between">
        <div className="relative">
          <div className="h-24 w-24 overflow-hidden rounded-full bg-muted ring-2 ring-primary">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-3xl font-black text-primary-foreground">
                {profile.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {isMe && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 rounded-full bg-gradient-brand p-2 text-primary-foreground shadow-glow"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onAvatar(e.target.files[0])} />
            </>
          )}
        </div>
        {isMe && (
          <div className="flex gap-2">
            <button onClick={() => setEditing((v) => !v)} className="rounded-full bg-card p-2 text-muted-foreground hover:text-foreground"><Settings className="h-5 w-5" /></button>
            <button onClick={() => signOut().then(() => navigate({ to: "/" }))} className="rounded-full bg-card p-2 text-muted-foreground hover:text-foreground"><LogOut className="h-5 w-5" /></button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h1 className="flex items-center gap-1.5 text-xl font-bold">
          {profile.display_name || profile.username}
          <VerifiedBadge verified={profile.verified} className="h-5 w-5" />
        </h1>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
        {profile.bio && !editing && <p className="mt-2 text-sm">{profile.bio}</p>}
        {meProfile?.username?.toLowerCase() === "itzdsm" && !isMe && (
          <button
            onClick={async () => {
              const next = !profile.verified;
              const { error } = await supabase.from("profiles").update({ verified: next }).eq("id", profile.id);
              if (error) { toast.error(error.message); return; }
              setProfile((p) => p ? { ...p, verified: next } : p);
              toast.success(next ? "User verified" : "Verification removed");
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
          >
            <BadgeCheck className="h-4 w-4" />
            {profile.verified ? "Remove verification" : "Verify this user"}
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-6 text-sm">
        <div><span className="font-bold">{videos.length}</span> <span className="text-muted-foreground">posts</span></div>
        <div><span className="font-bold">{followers}</span> <span className="text-muted-foreground">followers</span></div>
        <div><span className="font-bold">{following}</span> <span className="text-muted-foreground">following</span></div>
      </div>

      {!isMe && user && (
        <Button onClick={toggleFollow} className={`mt-4 w-full ${isFollowing ? "" : "bg-gradient-brand text-primary-foreground hover:opacity-90"}`} variant={isFollowing ? "outline" : "default"}>
          {isFollowing ? "Following" : "Follow"}
        </Button>
      )}

      {editing && isMe && (
        <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <Button onClick={saveProfile} className="w-full bg-gradient-brand text-primary-foreground hover:opacity-90">Save</Button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-1">
        {videos.map((v) => (
          <Link key={v.id} to="/" className="group relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
            <video src={v.video_url} poster={v.thumbnail_url ?? undefined} className="h-full w-full object-cover" muted preload="metadata" />
          </Link>
        ))}
        {videos.length === 0 && <p className="col-span-3 py-10 text-center text-sm text-muted-foreground">No videos yet.</p>}
      </div>
    </div>
  );
}
