export type PrepareOk = { ok: true; file: File };
export type PrepareErr = {
  ok: false;
  reason: "too_long" | "unsupported" | "too_large";
};
export type PrepareResult = PrepareOk | PrepareErr;
export const MAX_MEDIA_SECONDS = 30;
