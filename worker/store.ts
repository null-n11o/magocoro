const MAX_PHOTO_BYTES = 1024 * 1024;
const MAX_CLIP_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_ADDRESS = "じいじ、ばあばへ";
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CLIP_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const AUDIO_TYPES = new Set(["audio/mp4", "audio/aac", "audio/webm", "audio/ogg"]);

export type Stamps = { read: number; cute: number };
export type StampKind = "read" | "cute";

export type LetterMediaRecord =
  | { kind: "photos"; photos: { contentType: string }[] }
  | { kind: "clip"; clip: { contentType: string } };

export type LetterRecord = {
  id: string;
  createdAt: string;
  expiresAt: string;
  addressTo: string;
  body: string;
  signature: string;
  media: LetterMediaRecord;
  audio?: { contentType: string };
  stamps: Stamps;
};

export type LetterPublic = {
  id: string;
  createdAt: string;
  expiresAt: string;
  addressTo: string;
  body: string;
  signature: string;
  media:
    | { kind: "photos"; photoUrls: string[] }
    | { kind: "clip"; clipUrl: string };
  audioUrl: string | null;
  stamps: Stamps;
};

export type GetLetterResult =
  | { status: "ok"; record: LetterRecord }
  | { status: "not_found" }
  | { status: "expired" };

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `l_${hex}`;
}

function jsonKey(id: string): string {
  return `letters/${id}.json`;
}
function photoKey(id: string, n: number): string {
  return `letters/${id}/photo-${n}`;
}
function clipKey(id: string): string {
  return `letters/${id}/clip`;
}
function audioKey(id: string): string {
  return `letters/${id}/audio`;
}

function isId(id: string): boolean {
  return /^l_[0-9a-f]{32}$/.test(id);
}
function isStampKind(kind: string): kind is StampKind {
  return kind === "read" || kind === "cute";
}
function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function baseContentType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

function isAllowedType(type: string, allowed: Set<string>): boolean {
  return allowed.has(baseContentType(type));
}

function isLetterRecord(value: unknown, id: string): value is LetterRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LetterRecord>;
  if (
    record.id !== id ||
    typeof record.createdAt !== "string" ||
    typeof record.expiresAt !== "string" ||
    typeof record.addressTo !== "string" ||
    record.addressTo.length === 0 ||
    typeof record.body !== "string" ||
    record.body.length < 1 ||
    record.body.length > 1000 ||
    typeof record.signature !== "string" ||
    record.signature.length < 1 ||
    record.signature.length > 20 ||
    !record.media ||
    typeof record.stamps !== "object" ||
    record.stamps === null ||
    !Number.isInteger(record.stamps.read) ||
    record.stamps.read < 0 ||
    !Number.isInteger(record.stamps.cute) ||
    record.stamps.cute < 0
  ) {
    return false;
  }
  if (record.audio) {
    if (!isAllowedType(record.audio.contentType, AUDIO_TYPES)) return false;
  }
  if (record.media.kind === "photos") {
    return (
      Array.isArray(record.media.photos) &&
      record.media.photos.length >= 1 &&
      record.media.photos.length <= 3 &&
      record.media.photos.every((item) => PHOTO_TYPES.has(item.contentType))
    );
  }
  if (record.media.kind === "clip") {
    return isAllowedType(record.media.clip.contentType, CLIP_TYPES);
  }
  return false;
}

export function toPublic(record: LetterRecord): LetterPublic {
  const media =
    record.media.kind === "photos"
      ? {
          kind: "photos" as const,
          photoUrls: record.media.photos.map(
            (_, n) => `/api/letters/${record.id}/photos/${n}`,
          ),
        }
      : {
          kind: "clip" as const,
          clipUrl: `/api/letters/${record.id}/clip`,
        };
  return {
    id: record.id,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    addressTo: record.addressTo,
    body: record.body,
    signature: record.signature,
    media,
    audioUrl: record.audio ? `/api/letters/${record.id}/audio` : null,
    stamps: record.stamps,
  };
}

export async function createLetter(
  env: Env,
  form: FormData,
): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 503 }> {
  const addressRaw = String(form.get("addressTo") ?? "").trim();
  const addressTo = addressRaw === "" ? DEFAULT_ADDRESS : addressRaw;
  const body = String(form.get("body") ?? "").trim();
  const signature = String(form.get("signature") ?? "").trim();
  const photos = form.getAll("photos").filter(isFile);
  const clipValue = form.get("clip");
  const audioValue = form.get("audio");
  const clipFile = isFile(clipValue) ? clipValue : null;
  const audioFile = isFile(audioValue) ? audioValue : null;

  if (body.length < 1 || body.length > 1000) return { ok: false, status: 400 };
  if (signature.length < 1 || signature.length > 20) {
    return { ok: false, status: 400 };
  }
  if (photos.length > 0 && clipFile) return { ok: false, status: 400 };
  if (photos.length === 0 && !clipFile) return { ok: false, status: 400 };
  if (photos.length > 3) return { ok: false, status: 400 };

  for (const file of photos) {
    if (!PHOTO_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES) {
      return { ok: false, status: 400 };
    }
  }
  if (
    clipFile &&
    (!isAllowedType(clipFile.type, CLIP_TYPES) || clipFile.size > MAX_CLIP_BYTES)
  ) {
    return { ok: false, status: 400 };
  }
  if (
    audioFile &&
    (!isAllowedType(audioFile.type, AUDIO_TYPES) || audioFile.size > MAX_AUDIO_BYTES)
  ) {
    return { ok: false, status: 400 };
  }

  const total =
    photos.reduce((sum, file) => sum + file.size, 0) +
    (clipFile?.size ?? 0) +
    (audioFile?.size ?? 0);
  if (total > MAX_TOTAL_BYTES) return { ok: false, status: 400 };

  const id = newId();
  const createdAt = new Date().toISOString();
  const record: LetterRecord = {
    id,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + TTL_MS).toISOString(),
    addressTo,
    body,
    signature,
    media: clipFile
      ? { kind: "clip", clip: { contentType: baseContentType(clipFile.type) } }
      : { kind: "photos", photos: photos.map((file) => ({ contentType: file.type })) },
    stamps: { read: 0, cute: 0 },
  };
  if (audioFile) record.audio = { contentType: baseContentType(audioFile.type) };

  const keysToCleanup: string[] = [];
  try {
    if (record.media.kind === "photos") {
      for (const [n, file] of photos.entries()) {
        const key = photoKey(id, n);
        keysToCleanup.push(key);
        await env.LETTERS.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type },
        });
      }
    } else if (clipFile) {
      const key = clipKey(id);
      keysToCleanup.push(key);
      await env.LETTERS.put(key, await clipFile.arrayBuffer(), {
        httpMetadata: { contentType: baseContentType(clipFile.type) },
      });
    }
    if (audioFile) {
      const key = audioKey(id);
      keysToCleanup.push(key);
      await env.LETTERS.put(key, await audioFile.arrayBuffer(), {
        httpMetadata: { contentType: baseContentType(audioFile.type) },
      });
    }
    const key = jsonKey(id);
    keysToCleanup.push(key);
    await env.LETTERS.put(key, JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    for (const key of keysToCleanup) {
      try {
        await env.LETTERS.delete(key);
      } catch {
        // A cleanup failure must not mask the unavailable response.
      }
    }
    return { ok: false, status: 503 };
  }
  return { ok: true, id };
}

export async function getLetter(env: Env, id: string): Promise<GetLetterResult> {
  if (!isId(id)) return { status: "not_found" };
  const obj = await env.LETTERS.get(jsonKey(id));
  if (!obj) return { status: "not_found" };
  try {
    const parsed: unknown = JSON.parse(await obj.text());
    if (!isLetterRecord(parsed, id)) return { status: "not_found" };
    if (Date.parse(parsed.expiresAt) <= Date.now()) return { status: "expired" };
    return { status: "ok", record: parsed };
  } catch {
    return { status: "not_found" };
  }
}

async function readObject(
  env: Env,
  key: string,
  contentType: string,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const obj = await env.LETTERS.get(key);
  if (!obj) return null;
  return { bytes: await obj.arrayBuffer(), contentType };
}

export async function getPhoto(
  env: Env,
  id: string,
  n: number,
): Promise<
  | { status: "ok"; bytes: ArrayBuffer; contentType: string }
  | { status: "not_found" }
  | { status: "expired" }
> {
  const result = await getLetter(env, id);
  if (result.status !== "ok") return result;
  if (result.record.media.kind !== "photos") return { status: "not_found" };
  if (!Number.isInteger(n) || n < 0 || n >= result.record.media.photos.length) {
    return { status: "not_found" };
  }
  const obj = await readObject(
    env,
    photoKey(id, n),
    result.record.media.photos[n].contentType,
  );
  return obj ? { status: "ok", ...obj } : { status: "not_found" };
}

export async function getClip(
  env: Env,
  id: string,
): Promise<
  | { status: "ok"; bytes: ArrayBuffer; contentType: string }
  | { status: "not_found" }
  | { status: "expired" }
> {
  const result = await getLetter(env, id);
  if (result.status !== "ok") return result;
  if (result.record.media.kind !== "clip") return { status: "not_found" };
  const obj = await readObject(env, clipKey(id), result.record.media.clip.contentType);
  return obj ? { status: "ok", ...obj } : { status: "not_found" };
}

export async function getAudio(
  env: Env,
  id: string,
): Promise<
  | { status: "ok"; bytes: ArrayBuffer; contentType: string }
  | { status: "not_found" }
  | { status: "expired" }
> {
  const result = await getLetter(env, id);
  if (result.status !== "ok") return result;
  if (!result.record.audio) return { status: "not_found" };
  const obj = await readObject(env, audioKey(id), result.record.audio.contentType);
  return obj ? { status: "ok", ...obj } : { status: "not_found" };
}

export async function addStamp(
  env: Env,
  id: string,
  kind: string,
): Promise<{ stamps: Stamps } | "not_found" | "expired" | "bad_kind" | "unavailable"> {
  if (!isStampKind(kind)) return "bad_kind";
  const result = await getLetter(env, id);
  if (result.status !== "ok") return result.status;
  result.record.stamps[kind] += 1;
  try {
    await env.LETTERS.put(jsonKey(id), JSON.stringify(result.record), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    return "unavailable";
  }
  return { stamps: result.record.stamps };
}
