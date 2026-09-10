import type { LetterPublic } from "../api/types";
import {
  photoDurationsMs,
  recordClipBundle,
  recordTimeline,
  renderPhotoBundle,
} from "../media/bundleVideo";

export async function buildKeepVideo(letter: LetterPublic): Promise<File> {
  // Local File only. Never POST this blob to /api.

  if (letter.media.kind === "clip") {
    const clip = await (await fetch(letter.media.clipUrl)).blob();
    const parentAudio = letter.audioUrl
      ? await (await fetch(letter.audioUrl)).blob()
      : undefined;
    const blob = await recordClipBundle({
      clip,
      body: letter.body,
      parentAudio,
    });
    return new File([blob], "magocoro.webm", { type: blob.type || "video/webm" });
  }
  const bitmaps: ImageBitmap[] = [];
  for (const src of letter.media.photoUrls) {
    bitmaps.push(await createImageBitmap(await (await fetch(src)).blob()));
  }
  const audio = letter.audioUrl
    ? await (await fetch(letter.audioUrl)).blob()
    : undefined;
  const audioDuration = audio
    ? await new Promise<number>((resolve, reject) => {
        const el = document.createElement("audio");
        el.src = URL.createObjectURL(audio);
        el.onloadedmetadata = () => resolve(el.duration);
        el.onerror = () => reject(new Error("audio"));
      })
    : null;
  const durations = photoDurationsMs(bitmaps.length, audioDuration);
  const blob = await renderPhotoBundle({
    frames: bitmaps.map((source, index) => ({
      source,
      durationMs: durations[index] ?? 3000,
    })),
    audio,
    width: 720,
    height: 1280,
    record: recordTimeline,
  });
  return new File([blob], "magocoro.webm", { type: blob.type || "video/webm" });
}
