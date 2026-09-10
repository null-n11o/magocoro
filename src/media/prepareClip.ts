import { baseContentType, MAX_MEDIA_SECONDS, type PrepareResult } from "./prepare";

export const TARGET_CLIP_BYTES = 8 * 1024 * 1024;
export const CLIP_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export async function prepareClip(
  file: File,
  measureDuration: (file: File) => Promise<number>,
  transcode?: (file: File) => Promise<File>,
): Promise<PrepareResult> {
  if (!CLIP_TYPES.has(baseContentType(file.type))) return { ok: false, reason: "unsupported" };
  let duration: number;
  try {
    duration = await measureDuration(file);
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  if (duration > MAX_MEDIA_SECONDS) return { ok: false, reason: "too_long" };
  // Keep compatible originals intact: canvas transcoding must not discard their sound.
  if (file.size <= TARGET_CLIP_BYTES && ["video/mp4", "video/webm"].includes(baseContentType(file.type))) return { ok: true, file };
  if (transcode) {
    try {
      const next = await transcode(file);
      if (next.size > 0 && next.size <= TARGET_CLIP_BYTES) {
        return { ok: true, file: next };
      }
    } catch {
      // Fall through to the original when MediaRecorder cannot run
      // or the transcoded file is larger than the 8MB target.
    }
  }
  if (file.size > TARGET_CLIP_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, file };
}

export async function transcodeClipTo720p(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await video.play();
    if (video.videoWidth === 0) throw new Error("no_video");
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas");
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: pickRecorderMime() });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    const draw = () => {
      if (video.ended || video.paused) {
        recorder.stop();
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(draw);
    };
    draw();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    if (blob.size === 0) throw new Error("empty_transcode");
    return new File([blob], "clip.webm", { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
    return "video/webm;codecs=vp9";
  }
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4")) return "video/mp4";
  return "";
}
