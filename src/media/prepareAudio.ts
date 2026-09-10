import { baseContentType, MAX_MEDIA_SECONDS, type PrepareResult } from "./prepare";

export const AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
]);
export const HARD_AUDIO_BYTES = 1024 * 1024;
export const TARGET_AUDIO_BYTES = Math.floor(0.3 * 1024 * 1024);

export async function prepareAudio(
  file: File,
  measureDuration: (file: File) => Promise<number>,
): Promise<PrepareResult> {
  if (!AUDIO_TYPES.has(baseContentType(file.type))) return { ok: false, reason: "unsupported" };
  let duration: number;
  try {
    duration = await measureDuration(file);
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  if (duration > MAX_MEDIA_SECONDS) return { ok: false, reason: "too_long" };
  if (file.size > HARD_AUDIO_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, file };
}
