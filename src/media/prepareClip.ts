import { recordPaperCanvas } from "./bundleVideo";
import {
  baseContentType,
  MAX_MEDIA_SECONDS,
  type PrepareResult,
} from "./prepare";

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
  if (!CLIP_TYPES.has(baseContentType(file.type)))
    return { ok: false, reason: "unsupported" };
  let duration: number;
  try {
    duration = await measureDuration(file);
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  if (duration > MAX_MEDIA_SECONDS) return { ok: false, reason: "too_long" };
  // Keep compatible originals intact: canvas transcoding must not discard their sound.
  if (file.size <= TARGET_CLIP_BYTES) return { ok: true, file };
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
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await video.play();
    video.pause();
    if (video.videoWidth === 0) throw new Error("no_video");
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("no_duration");
    const scale = Math.min(
      1,
      1280 / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const height = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const paper = document.createElement("canvas");
    paper.width = width;
    paper.height = height;
    const blob = await recordPaperCanvas({
      paper,
      width,
      height,
      durationMs: Math.round(video.duration * 1000),
      clip: {
        source: video,
        x: 0,
        y: 0,
        width,
        height,
        mute: false,
        useClipAudio: true,
      },
    });
    if (!blob.size) throw new Error("empty_transcode");
    return new File(
      [blob],
      blob.type.includes("mp4") ? "clip.mp4" : "clip.webm",
      { type: blob.type },
    );
  } finally {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
