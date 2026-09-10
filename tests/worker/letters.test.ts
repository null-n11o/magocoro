import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addStamp, createLetter } from "../../worker/store";

const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ID_RE = /^l_[0-9a-f]{32}$/;

function photo(type: string, size: number, name: string): File {
  return new File([new Uint8Array(size)], name, { type });
}
function clip(type = "video/mp4", size = 64, name = "a.mp4"): File {
  return new File([new Uint8Array(size)], name, { type });
}
function audio(type = "audio/webm", size = 32, name = "a.webm"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function textForm(): FormData {
  const form = new FormData();
  form.set("addressTo", "じいじ、ばあばへ");
  form.set("body", "きょうね、たてたよ");
  form.set("signature", "はると");
  return form;
}

async function post(form: FormData): Promise<Response> {
  return exports.default.fetch(
    new Request("http://example.com/api/letters", { method: "POST", body: form }),
  );
}

async function createPhotos(files: File[] = [photo("image/jpeg", 32, "a.jpg")]): Promise<string> {
  const form = textForm();
  for (const file of files) form.append("photos", file);
  const res = await post(form);
  expect(res.status).toBe(201);
  const json = (await res.json()) as { id: string };
  expect(json.id).toMatch(ID_RE);
  return json.id;
}

describe("letters api", () => {
  it("creates a photo letter, fetches public json, serves the photo, and increments stamps", async () => {
    const id = await createPhotos();
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    expect(got.status).toBe(200);
    const letter = (await got.json()) as {
      createdAt: string;
      expiresAt: string;
      addressTo: string;
      body: string;
      signature: string;
      media: { kind: string; photoUrls?: string[]; clipUrl?: string };
      audioUrl: string | null;
      stamps: { read: number; cute: number };
      photos?: unknown;
    };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
    expect(letter.body).toBe("きょうね、たてたよ");
    expect(letter.signature).toBe("はると");
    expect(letter.media).toEqual({
      kind: "photos",
      photoUrls: [`/api/letters/${id}/photos/0`],
    });
    expect(letter.audioUrl).toBeNull();
    expect(letter.photos).toBeUndefined();
    expect(Date.parse(letter.expiresAt) - Date.parse(letter.createdAt)).toBe(TTL_MS);
    expect(letter.stamps).toEqual({ read: 0, cute: 0 });

    const img = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/photos/0`),
    );
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");

    const clipMissing = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/clip`),
    );
    expect(clipMissing.status).toBe(404);

    const stamped = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "read" }),
      }),
    );
    expect(stamped.status).toBe(200);
    expect(await stamped.json()).toEqual({ stamps: { read: 1, cute: 0 } });
  });

  it("creates a clip letter with optional audio and serves both bytes", async () => {
    const form = textForm();
    form.set("clip", clip());
    form.set("audio", audio("audio/mp4", 48, "v.m4a"));
    const res = await post(form);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    const letter = (await got.json()) as {
      media: { kind: string; clipUrl?: string };
      audioUrl: string | null;
    };
    expect(letter.media).toEqual({ kind: "clip", clipUrl: `/api/letters/${id}/clip` });
    expect(letter.audioUrl).toBe(`/api/letters/${id}/audio`);

    const clipRes = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/clip`),
    );
    expect(clipRes.status).toBe(200);
    expect(clipRes.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await clipRes.arrayBuffer()).byteLength).toBe(64);

    const audioRes = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/audio`),
    );
    expect(audioRes.status).toBe(200);
    expect(audioRes.headers.get("content-type")).toBe("audio/mp4");

    const photoMissing = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/photos/0`),
    );
    expect(photoMissing.status).toBe(404);
  });

  it("creates a photo letter without audio", async () => {
    const id = await createPhotos();
    const audioRes = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/audio`),
    );
    expect(audioRes.status).toBe(404);
    expect(await audioRes.json()).toEqual({ error: "not_found" });
  });

  it("rejects photos and clip together, and rejects neither", async () => {
    const both = textForm();
    both.append("photos", photo("image/jpeg", 8, "a.jpg"));
    both.set("clip", clip());
    expect((await post(both)).status).toBe(400);

    const neither = textForm();
    expect((await post(neither)).status).toBe(400);
  });

  it("uses default addressTo when empty", async () => {
    const form = new FormData();
    form.set("addressTo", "  ");
    form.set("body", "げんき？");
    form.set("signature", "はると");
    form.append("photos", photo("image/png", 16, "a.png"));
    const res = await post(form);
    const { id } = (await res.json()) as { id: string };
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    const letter = (await got.json()) as { addressTo: string };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
  });

  it("rejects missing body and photos larger than 1MB", async () => {
    const empty = textForm();
    empty.set("body", "");
    empty.append("photos", photo("image/jpeg", 8, "a.jpg"));
    expect((await post(empty)).status).toBe(400);

    const big = textForm();
    big.append("photos", photo("image/jpeg", 1024 * 1024 + 1, "a.jpg"));
    expect((await post(big)).status).toBe(400);
  });

  it("accepts a photo up to 1MB and a clip up to 10MB", async () => {
    const okPhoto = textForm();
    okPhoto.append("photos", photo("image/jpeg", 1024 * 1024, "large.jpg"));
    expect((await post(okPhoto)).status).toBe(201);

    const okClip = textForm();
    okClip.set("clip", clip("video/webm", 10 * 1024 * 1024, "a.webm"));
    expect((await post(okClip)).status).toBe(201);

    const bigClip = textForm();
    bigClip.set("clip", clip("video/mp4", 10 * 1024 * 1024 + 1));
    expect((await post(bigClip)).status).toBe(400);

    const bigAudio = textForm();
    bigAudio.append("photos", photo("image/jpeg", 8, "a.jpg"));
    bigAudio.set("audio", audio("audio/webm", 1024 * 1024 + 1));
    expect((await post(bigAudio)).status).toBe(400);
  });

  it("rejects four photos and a letter whose files exceed 10MB together", async () => {
    const four = textForm();
    for (let i = 0; i < 4; i += 1) {
      four.append("photos", photo("image/jpeg", 8, `${i}.jpg`));
    }
    expect((await post(four)).status).toBe(400);

    const form = textForm();
    form.set("clip", clip("video/mp4", Math.floor(9.5 * 1024 * 1024)));
    form.set("audio", audio("audio/webm", Math.floor(0.6 * 1024 * 1024)));
    expect((await post(form)).status).toBe(400);
  });

  it("returns 410 for expired json, media, and stamps without incrementing", async () => {
    const id = "l_ffffffffffffffffffffffffffffffff";
    const record = {
      id,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-02T00:00:00.000Z",
      addressTo: "じいじ、ばあばへ",
      body: "きょうね",
      signature: "はると",
      media: { kind: "photos" as const, photos: [{ contentType: "image/jpeg" }] },
      stamps: { read: 0, cute: 0 },
    };
    await env.LETTERS.put(`letters/${id}.json`, JSON.stringify(record));
    await env.LETTERS.put(`letters/${id}/photo-0`, new Uint8Array([1, 2, 3]), {
      httpMetadata: { contentType: "image/jpeg" },
    });

    const json = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    expect(json.status).toBe(410);
    expect(await json.json()).toEqual({ error: "expired" });

    const img = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/photos/0`),
    );
    expect(img.status).toBe(410);

    const stamped = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "read" }),
      }),
    );
    expect(stamped.status).toBe(410);
    const stored = JSON.parse(
      await (await env.LETTERS.get(`letters/${id}.json`))!.text(),
    ) as { stamps: { read: number } };
    expect(stored.stamps.read).toBe(0);
  });

  it("returns invalid_input for a non-multipart create request", async () => {
    const res = await exports.default.fetch(
      new Request("http://example.com/api/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_input" });
  });

  it("returns not_found for unknown id and corrupt json", async () => {
    const missing = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });

    await env.LETTERS.put(
      "letters/l_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json",
      "not-json",
    );
    const corrupt = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    );
    expect(corrupt.status).toBe(404);

    await env.LETTERS.put(
      "letters/l_dddddddddddddddddddddddddddddddd.json",
      "{}",
    );
    const structurallyCorrupt = await exports.default.fetch(
      new Request("http://example.com/api/letters/l_dddddddddddddddddddddddddddddddd"),
    );
    expect(structurallyCorrupt.status).toBe(404);
  });

  it("does not expose generate or bundle upload routes", async () => {
    const generate = await exports.default.fetch(
      new Request("http://example.com/api/generate", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(generate.status).toBe(404);

    const bundle = await exports.default.fetch(
      new Request(
        "http://example.com/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bundle",
        { method: "POST" },
      ),
    );
    expect(bundle.status).toBe(404);
  });

  it("cleans up attempted R2 keys after a failed create", async () => {
    const deleted: string[] = [];
    const bucket = {
      async put(key: string) {
        if (key.endsWith(".json")) throw new Error("write failed");
      },
      async delete(key: string | string[]) {
        deleted.push(...(Array.isArray(key) ? key : [key]));
      },
    } as unknown as R2Bucket;
    const form = textForm();
    form.append("photos", photo("image/jpeg", 32, "a.jpg"));

    await expect(createLetter({ LETTERS: bucket }, form)).resolves.toEqual({
      ok: false,
      status: 503,
    });
    expect(deleted).toHaveLength(2);
    expect(deleted[0]).toMatch(/^letters\/l_[0-9a-f]{32}\/photo-0$/);
    expect(deleted[1]).toMatch(/^letters\/l_[0-9a-f]{32}\.json$/);
  });

  it("rejects unknown stamp kind and missing letter stamps", async () => {
    const id = await createPhotos();
    const bad = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "love" }),
      }),
    );
    expect(bad.status).toBe(400);
    const missing = await exports.default.fetch(
      new Request(
        "http://example.com/api/letters/l_cccccccccccccccccccccccccccccccc/stamps",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "cute" }),
        },
      ),
    );
    expect(missing.status).toBe(404);
  });

  it("reports unavailable when persisting a stamp fails", async () => {
    const id = "l_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const record = {
      id,
      createdAt: "2026-09-08T12:00:00.000Z",
      expiresAt: "2026-12-07T12:00:00.000Z",
      addressTo: "じいじ、ばあばへ",
      body: "きょうね、たてたよ",
      signature: "はると",
      media: { kind: "photos", photos: [{ contentType: "image/jpeg" }] },
      stamps: { read: 0, cute: 0 },
    };
    const bucket = {
      async get() {
        return { text: async () => JSON.stringify(record) };
      },
      async put() {
        throw new Error("write failed");
      },
    } as unknown as R2Bucket;

    await expect(addStamp({ LETTERS: bucket }, id, "read")).resolves.toBe(
      "unavailable",
    );
  });
});
