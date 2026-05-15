import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ICE_SERVERS, channelName, type SignalMessage } from "@/lib/webrtc";
import { LiveChat } from "@/components/LiveChat";
import { toast } from "sonner";

export const Route = createFileRoute("/live/$streamId")({
  head: () => ({ meta: [{ title: "Live — Dsmok" }] }),
  component: WatchLive,
});

function WatchLive() {
  const { streamId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef<string>(crypto.randomUUID());
  const [host, setHost] = useState<{ username: string; avatar_url: string | null; display_name: string | null } | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "ended">("connecting");
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: stream } = await supabase
        .from("live_streams")
        .select("host_id, status, profiles:host_id(username, avatar_url, display_name)")
        .eq("id", streamId)
        .maybeSingle();
      if (cancelled) return;
      if (!stream) { setStatus("ended"); return; }
      setHost((stream as any).profiles ?? null);
      if (stream.status !== "live") { setStatus("ended"); return; }

      const channel = supabase.channel(channelName(streamId), { config: { broadcast: { self: false } } });
      const viewerId = viewerIdRef.current;

      const sendSignal = (msg: SignalMessage) => channel.send({ type: "broadcast", event: "signal", payload: msg });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => {});
          setStatus("live");
        }
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ type: "ice", viewerId, from: "viewer", candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(pc.connectionState)) toast.error("Connection lost");
      };

      channel
        .on("broadcast", { event: "signal" }, async ({ payload }) => {
          const msg = payload as SignalMessage;
          if (msg.viewerId !== viewerId) return;
          if (msg.type === "offer") {
            await pc.setRemoteDescription(msg.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ type: "answer", viewerId, sdp: answer });
          } else if (msg.type === "ice" && msg.from === "host") {
            await pc.addIceCandidate(msg.candidate).catch(() => {});
          }
        })
        .subscribe((s) => {
          if (s === "SUBSCRIBED") sendSignal({ type: "join", viewerId });
        });

      // Listen for stream end
      const liveChan = supabase
        .channel(`live-status-${streamId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${streamId}` },
          (p) => {
            if ((p.new as any).status === "ended") setStatus("ended");
          }
        )
        .subscribe();

      return () => {
        sendSignal({ type: "leave", viewerId });
        supabase.removeChannel(channel);
        supabase.removeChannel(liveChan);
        pc.close();
      };
    })().then((cleanup) => { if (cancelled && cleanup) cleanup(); });

    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [streamId, user?.id]);

  return (
    <div className="relative min-h-[100dvh] bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate({ to: "/" })} className="rounded-full bg-black/55 p-2"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5">
            <div className="h-7 w-7 overflow-hidden rounded-full bg-muted">
              {host?.avatar_url ? <img src={host.avatar_url} alt="" className="h-full w-full object-cover" /> : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-brand text-xs font-bold">{host?.username?.[0]?.toUpperCase()}</div>
              )}
            </div>
            <span className="text-sm font-semibold">@{host?.username ?? "…"}</span>
            <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase">Live</span>
          </div>
          <button onClick={() => setMuted((m) => !m)} className="rounded-full bg-black/55 p-2">
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {status === "connecting" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm text-white/80">
          Connecting to live…
        </div>
      )}
      {status === "ended" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 text-center">
          <Eye className="h-10 w-10 text-white/60" />
          <p className="text-lg font-semibold">This live has ended</p>
          <button onClick={() => navigate({ to: "/" })} className="rounded-full bg-gradient-brand px-5 py-2 text-sm font-semibold text-primary-foreground">Back to feed</button>
        </div>
      )}

      {status === "live" && <LiveChat streamId={streamId} />}
    </div>
  );
}
