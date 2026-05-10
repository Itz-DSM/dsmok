import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, Upload as UploadIcon, Square, Circle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/upload")({
  head: () => ({ meta: [{ title: "Create — Dsmok" }] }),
  component: UploadPage,
});

const MAX_DURATION = 180;

function UploadPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSelectedFile = (f: File) => {
    if (!f.type.startsWith("video/")) { toast.error("Please select a video file"); return; }
    if (f.size > 200 * 1024 * 1024) { toast.error("Max file size 200 MB"); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }
    } catch (e: any) {
      toast.error("Camera access denied");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    const chunks: BlobPart[] = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const ext = mime.includes("webm") ? "webm" : "mp4";
      const f = new File([blob], `recording-${Date.now()}.${ext}`, { type: mime });
      setSelectedFile(f);
      stopCamera();
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setRecordingTime(0);
    timerRef.current = window.setInterval(() => {
      setRecordingTime((t) => {
        if (t + 1 >= MAX_DURATION) { stopRecording(); return MAX_DURATION; }
        return t + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setCaption(""); setProgress(0);
  };

  const upload = async () => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${user.id}/${Date.now()}.${ext}`;
      setProgress(20);
      const { error: upErr } = await supabase.storage.from("videos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      setProgress(80);
      const { data: pub } = supabase.storage.from("videos").getPublicUrl(path);
      const { error: insErr } = await supabase.from("videos").insert({
        user_id: user.id,
        video_url: pub.publicUrl,
        caption: caption.trim() || null,
      });
      if (insErr) throw insErr;
      setProgress(100);
      toast.success("Posted to Dsmok!");
      reset();
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-28 pt-8">
      <h1 className="mb-6 text-2xl font-bold">Create</h1>

      {!file ? (
        <>
          {streamRef.current ? (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video ref={liveVideoRef} className="aspect-[9/16] w-full object-cover" muted playsInline />
              <div className="absolute right-3 top-3">
                <button onClick={stopCamera} className="rounded-full bg-black/60 p-2 text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {recording && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")} / 3:00
                </div>
              )}
              <div className="absolute inset-x-0 bottom-6 flex justify-center">
                {!recording ? (
                  <button onClick={startRecording} className="h-16 w-16 rounded-full border-4 border-white bg-primary shadow-glow">
                    <Circle className="mx-auto h-7 w-7 text-white" fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={stopRecording} className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-destructive">
                    <Square className="h-6 w-6 text-white" fill="currentColor" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="group relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card transition hover:border-primary hover:shadow-glow">
                <div className="rounded-full bg-gradient-brand p-4">
                  <UploadIcon className="h-8 w-8 text-primary-foreground" />
                </div>
                <p className="font-semibold">Upload from device</p>
                <p className="text-xs text-muted-foreground">MP4, WebM, MOV · up to 3 min</p>
                <input
                  type="file"
                  accept="video/*"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
                />
              </label>

              <button
                onClick={startCamera}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card transition hover:border-secondary hover:shadow-glow"
              >
                <div className="rounded-full bg-gradient-brand p-4">
                  <Camera className="h-8 w-8 text-primary-foreground" />
                </div>
                <p className="font-semibold">Record now</p>
                <p className="text-xs text-muted-foreground">Use your camera & mic</p>
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video src={previewUrl!} controls playsInline className="aspect-[9/16] w-full object-contain" />
            <button onClick={reset} className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write a caption…"
            maxLength={300}
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
          />

          {uploading && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-gradient-brand transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset} disabled={uploading} className="flex-1">Discard</Button>
            <Button onClick={upload} disabled={uploading} className="flex-1 bg-gradient-brand text-primary-foreground hover:opacity-90">
              {uploading ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
