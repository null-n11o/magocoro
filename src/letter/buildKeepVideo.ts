import type { LetterPublic } from "../api/types";
import { measureDuration } from "../media/measureDuration";
import {
  canvasToJpeg,
  clipInPaperPlan,
  keepShareKind,
  keepVideoFile,
  letterBundleDurationMs,
  mediaRectInPaper,
  recordPaperCanvas,
  snapshotToJpeg,
  type PaperBundlePlan,
} from "../media/bundleVideo";
import { snapshotPaper } from "../media/snapshotPaper";

export type BuildKeepVideoDeps = {
  snapshot?: (paper: HTMLElement) => Promise<HTMLCanvasElement>;
  toJpeg?: (canvas: HTMLCanvasElement) => Promise<Blob>;
  record?: (plan: PaperBundlePlan) => Promise<Blob>;
  fetchBlob?: (url: string) => Promise<Blob>;
  measureDuration?: (blob: Blob) => Promise<number>;
};

async function defaultFetchBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

async function defaultMeasureDuration(blob: Blob): Promise<number> {
  return measureDuration(new File([blob], "keep-audio", { type: blob.type }));
}

async function clipDurationSec(video: HTMLVideoElement): Promise<number | null> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  }
  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("no_clip")), { once: true });
  });
  return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
}

export async function buildKeepVideo(
  letter: LetterPublic,
  paper: HTMLElement,
  deps: BuildKeepVideoDeps = {},
): Promise<File> {
  // Local File only. Never POST this blob to /api.
  const snapshot = deps.snapshot ?? snapshotPaper;
  const canvas = await snapshot(paper);
  if (keepShareKind(letter) === "image") {
    const blob = await snapshotToJpeg(canvas, deps.toJpeg ?? canvasToJpeg);
    return new File([blob], "magocoro.jpg", { type: blob.type || "image/jpeg" });
  }

  const fetchBlob = deps.fetchBlob ?? defaultFetchBlob;
  const measure = deps.measureDuration ?? defaultMeasureDuration;
  const audio = letter.audioUrl ? await fetchBlob(letter.audioUrl) : undefined;
  const clip = paper.querySelector("video.letter-clip");
  const clipEl = clip instanceof HTMLVideoElement ? clip : null;
  const planClip = clipInPaperPlan(Boolean(audio));
  const paperBox = paper.getBoundingClientRect();
  const scaleX = paperBox.width > 0 ? canvas.width / paperBox.width : 1;
  const scaleY = paperBox.height > 0 ? canvas.height / paperBox.height : 1;
  const clipRect = clipEl ? mediaRectInPaper(paper, clipEl) : null;
  const durationMs = letterBundleDurationMs({
    audioDurationSec: audio ? await measure(audio) : null,
    clipDurationSec: clipEl ? await clipDurationSec(clipEl) : null,
  });
  if (durationMs <= 0) throw new Error("no_keep_duration");

  const plan: PaperBundlePlan = {
    paper: canvas,
    width: canvas.width,
    height: canvas.height,
    durationMs,
    audio,
    clip:
      clipEl && clipRect
        ? {
            source: clipEl,
            x: clipRect.x * scaleX,
            y: clipRect.y * scaleY,
            width: clipRect.width * scaleX,
            height: clipRect.height * scaleY,
            mute: planClip.muteClip,
            useClipAudio: !planClip.useParentAudio,
          }
        : undefined,
  };
  const blob = await (deps.record ?? recordPaperCanvas)(plan);
  return keepVideoFile(blob);
}
