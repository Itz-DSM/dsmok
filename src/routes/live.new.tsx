import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Radio, X, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { ICE_SERVERS, channelName, type SignalMessage } from "@/lib/webrtc";
import { LiveChat } from "@/components/LiveChat";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/live/new")({
  head: () => ({ meta: [{ title: "Go Live — Dsmok" }] }),
  component: GoLive,
});

function GoLive() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [starting, setStarting] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const stopAll = async (id: string | null) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (id) {
      await supabase.from("live_streams").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
    }
  };

  useEffect(() => {
    return () => { void stopAll(streamId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goLive = async () => {
    if (!user) { toast.error("Sign in to go live"); return; }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const { data: row, error } = await supabase
        .from("live_streams")
        .insert({ host_id: user.id, title: title.trim() || "Live", status: "live" })
        .select("id")
        .single();
      if (error || !row) throw error ?? new Error("Failed to start");
      const id = row.id as string;
      setStreamId(id);

      const channel = supabase.channel(channelName(id), { config: { broadcast: { self: false } } });
      channelRef.current = channel;

      const sendSignal = (msg: SignalMessage) => channel.send({ type: "broadcast", event: "signal", payload: msg });

      const handleViewerJoin = async (viewerId: string) => {
        if (peersRef.current.has(viewerId)) return;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peersRef.current.set(viewerId, pc);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) sendSignal({ type: "ice", viewerId, from: "host", candidate: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => {
          if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
            peersRef.current.delete(viewerId);
            pc.close();
            setViewerCount(peersRef.current.size);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", viewerId, sdp: offer });
        setViewerCount(peersRef.current.size);
      };

      channel
        .on("broadcast", { event: "signal" }, async ({ payload }) => {
          const msg = payload as SignalMessage;
          if (msg.type === "join") {
            await handleViewerJoin(msg.viewerId);
          } else if (msg.type === "answer") {
            const pc = peersRef.current.get(msg.viewerId);
            if (pc && pc.signalingState !== "closed") await pc.setRemoteDescription(msg.sdp);
          } else if (msg.type === "ice" && msg.from === "viewer") {
            const pc = peersRef.current.get(msg.viewerId);
            if (pc) await pc.addIceCandidate(msg.candidate).catch(() => {});
          } else if (msg.type === "leave") {
            const pc = peersRef.current.get(msg.viewerId);
            if (pc) { pc.close(); peersRef.current.delete(msg.viewerId); setViewerCount(peersRef.current.size); }
          }
        })
        .subscribe();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not access camera");
      await stopAll(streamId);
    } finally {
      setStarting(false);
    }
  };

  const endLive = async () => {
    await stopAll(streamId);
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-[100dvh] bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {!streamId ? (
        <div className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black/40 p-6">
          <Radio className="h-12 w-12 text-red-500" />
          <h1 className="text-2xl font-bold">Go Live</h1>
          <p className="text-center text-sm text-white/80">
            Your camera & mic will broadcast in real time.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Stream title (optional)"
            maxLength={80}
            className="w-full max-w-xs rounded-full bg-white/15 px-4 py-2 text-sm text-white placeholder:text-white/60 outline-none"
          />
          <button
            onClick={goLive}
            disabled={starting}
            className="rounded-full bg-red-500 px-6 py-3 font-semibold shadow-lg disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start broadcasting"}
          </button>
          <button onClick={() => navigate({ to: "/" })} className="text-sm text-white/70">Cancel</button>
        </div>
      ) : (
        <>
          <div className="absolute left-3 right-3 top-3 z-20 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Live
            </div>
            <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-xs">
              <Eye className="h-3.5 w-3.5" /> {viewerCount}
            </div>
            <button
              onClick={endLive}
              className="rounded-full bg-black/55 p-2 hover:bg-black/75"
              aria-label="End live"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <LiveChat streamId={streamId} />
        </>
      )}
    </div>
  );
}
