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
      await env.LETTERS.put(photoKey(id, n), await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
    }
    await env.LETTERS.put(jsonKey(id), JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    return { ok: false, status: 503 };
  }
  return { ok: true, id };
}

export async function getLetter(env: Env, id: string): Promise<LetterRecord | null> {
  if (!isId(id)) return null;
  const obj = await env.LETTERS.get(jsonKey(id));
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text()) as LetterRecord;
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
): Promise<{ stamps: Stamps } | "not_found" | "bad_kind"> {
  if (!isStampKind(kind)) return "bad_kind";
  const record = await getLetter(env, id);
  if (!record) return "not_found";
  record.stamps[kind] += 1;
  try {
    await env.LETTERS.put(jsonKey(id), JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch {
    return "not_found";
  }
  return { stamps: record.stamps };
}
