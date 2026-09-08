const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_ADDRESS = "じいじ、ばあばへ";

export type Stamps = { read: number; cute: number };
export type StampKind = "read" | "cute";

export type LetterRecord = {
  id: string;
  createdAt: string;
  addressTo: string;
  body: string;
  signature: string;
  photos: { contentType: string }[];
  stamps: Stamps;
};

export type LetterPublic = LetterRecord & { photoUrls: string[] };

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

function isId(id: string): boolean {
  return /^l_[0-9a-f]{32}$/.test(id);
}

function isStampKind(kind: string): kind is StampKind {
  return kind === "read" || kind === "cute";
}

function isLetterRecord(value: unknown, id: string): value is LetterRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LetterRecord>;
  return (
    record.id === id &&
    typeof record.createdAt === "string" &&
    typeof record.addressTo === "string" &&
    record.addressTo.length > 0 &&
    typeof record.body === "string" &&
    record.body.length >= 1 &&
    record.body.length <= 1000 &&
    typeof record.signature === "string" &&
    record.signature.length >= 1 &&
    record.signature.length <= 20 &&
    Array.isArray(record.photos) &&
    record.photos.length >= 1 &&
    record.photos.length <= 3 &&
    record.photos.every(
      (photo) =>
        typeof photo === "object" &&
        photo !== null &&
        ALLOWED_TYPES.has((photo as { contentType?: unknown }).contentType as string),
    ) &&
    typeof record.stamps === "object" &&
    record.stamps !== null &&
    Number.isInteger(record.stamps.read) &&
    record.stamps.read >= 0 &&
    Number.isInteger(record.stamps.cute) &&
    record.stamps.cute >= 0
  );
}

export function toPublic(record: LetterRecord): LetterPublic {
  return {
    ...record,
    photoUrls: record.photos.map((_, n) => `/api/letters/${record.id}/photos/${n}`),
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
  const photos = form.getAll("photos").filter((v): v is File => v instanceof File && v.size > 0);

  if (photos.length < 1 || photos.length > 3) return { ok: false, status: 400 };
  if (body.length < 1 || body.length > 1000) return { ok: false, status: 400 };
  if (signature.length < 1 || signature.length > 20) return { ok: false, status: 400 };
  for (const file of photos) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES) {
      return { ok: false, status: 400 };
    }
  }

  const id = newId();
  const keysToCleanup: string[] = [];
  const record: LetterRecord = {
    id,
    createdAt: new Date().toISOString(),
    addressTo,
    body,
    signature,
    photos: photos.map((p) => ({ contentType: p.type })),
    stamps: { read: 0, cute: 0 },
  };

  try {
    for (const [n, file] of photos.entries()) {
      const key = photoKey(id, n);
      keysToCleanup.push(key);
      await env.LETTERS.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
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

export async function getLetter(env: Env, id: string): Promise<LetterRecord | null> {
  if (!isId(id)) return null;
  const obj = await env.LETTERS.get(jsonKey(id));
  if (!obj) return null;
  try {
    const record: unknown = JSON.parse(await obj.text());
    return isLetterRecord(record, id) ? record : null;
  } catch {
    return null;
  }
}

export async function getPhoto(
  env: Env,
  id: string,
  n: number,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const record = await getLetter(env, id);
  if (!record || n < 0 || n >= record.photos.length) return null;
  const obj = await env.LETTERS.get(photoKey(id, n));
  if (!obj) return null;
  return {
    bytes: await obj.arrayBuffer(),
    contentType: record.photos[n].contentType,
  };
}

export async function addStamp(
  env: Env,
  id: string,
  kind: string,
): Promise<{ stamps: Stamps } | "not_found" | "bad_kind" | "unavailable"> {
  if (!isStampKind(kind)) return "bad_kind";
  const record = await getLetter(env, id);
  if (!record) return "not_found";
  record.stamps[kind] += 1;
  try {
    await env.LETTERS.put(jsonKey(id), JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    return "unavailable";
  }
  return { stamps: record.stamps };
}
