# Magocoro まとめ手紙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 親が写真または短い動画と、ことばと任意の声を1通にまとめ、祖父母がURLまたは端末で作った動画で受け取れる無料枠の1ループを、現行の写真のみWeb手紙の上に実装する。

**Architecture:** 画面は `LetterApi`（`src/api/letters.ts`）だけを呼ぶ。Worker が `/api/*` を処理し、手紙JSONと圧縮済み素材（photos XOR clip、任意 audio）を R2 に置く。変換とまとめ動画はブラウザだけが行い、結合ファイルは R2 に上げない。既存の便箋UI（4手順・写真3枠・切手フレーム）は写真モードで残し、媒体切替と音声・クリップ再生・期限切れ表示を足す。

**Tech Stack:** Vite + React 19 + TypeScript + Tailwind v4 + React Router + Vitest + Testing Library + `@cloudflare/vite-plugin` + `@cloudflare/vitest-plugin` + Wrangler + R2。MediaRecorder / canvas はブラウザ標準のみ。ffmpeg・Cloudflare Stream・LINE SDKは足さない。

**Spec:** `docs/superpowers/specs/2026-09-10-magocoro-letter-bundle-design.md` — 実行者はSpecと本計画の両方を読むこと。旧正本 `2026-09-08-magocoro-web-letter-design.md` と旧計画 `2026-09-08-magocoro-web-letter.md` は使わない。`2026-09-10-magocoro-compose-ui-refresh.md` の保存境界は本仕様が上書きする（媒体切替・圧縮・音声）。

## Global Constraints

- 日本語のみ。文書言語 `lang="ja"`。
- 地 `#f7f2e9`、面 `#fffdf8`、本文 `#33302a`、補助 `#8a7f72`、罫線 `#ddd2c2`、強調（朱） `#c4543a`。切手風フレームは白縁＋波線。
- 紫・ネオン・金グラデ・飾り絵文字は禁止。本文中の絵文字は親が書いた場合のみ素通し。
- 見出しと本文は Noto Sans JP。動き150–400ms。`prefers-reduced-motion` で装飾は無効化。まとめ動画の作成自体は止めない。
- タップ面44px以上。スタンプは `aria-label`＋`aria-pressed`。
- ページ全体の横スクロール禁止。最大幅モバイルカラム（`max-w-lg`）中央寄せ。
- 秘密値はリポジトリに入れない。外部LLM・決済・LINEにはつながない（自前WorkerとフォントCDNのみ）。
- 媒体は画像1〜3枚 XOR 動画1本。両方・どちらも無しは 400。音声は任意。
- 画像: 端末で長辺1280 JPEG。サーバは JPEG/PNG/WebP以外・1枚1MB超・4枚以上を拒否。
- 動画: 端末で30秒超を拒否。サーバは形式・10MB超を拒否。尺は読まない。
- 音声: 端末で30秒超を拒否。サーバは1MB超・非対応形式を拒否。
- 1通のR2合計が10MB超なら 400。IDは `l_` + 32桁hex。作成から90日で 410。
- 本文は親の入力のまま。孫口調の案内も生成APIも出さない。デプロイ・公開URL確定は対象外。

---

## File Structure

```text
src/
  api/
    types.ts                 # LetterPublic（media XOR / audioUrl / expiresAt）、CreateLetterInput、LetterGetResult、StampResult
    letters.ts               # FormData は photos XOR clip + 任意 audio。404/410 を結果型へ
  media/
    compressImage.ts         # 長辺1280 JPEG。目標400KB、硬上限1MB
    measureDuration.ts       # video/audio の metadata 尺
    prepare.ts               # PrepareResult と MAX_MEDIA_SECONDS
    prepareClip.ts           # 形式・30秒・8MB。可能なら720pへ再エンコード
    prepareAudio.ts          # 形式・30秒・目標0.3MB、硬上限1MB
    bundleVideo.ts           # 写真経路 / クリップ経路の1本化（recorder を注入可能）
    shareBundle.ts           # Web Share（ファイル）または端末保存
  compose/
    ComposePage.tsx          # 媒体切替、圧縮、任意音声、孫口調案内なし
  letter/
    LetterPage.tsx           # 写真またはクリップ、音声再生、期限切れ、コピー、動画にして送る
    buildKeepVideo.ts        # 手紙素材から端末内まとめ動画 File を返す。POST しない
  index.css                  # トグル・クリップ・音声・空状態の便箋スタイル
worker/
  store.ts                   # LetterRecord.media / audio / expiresAt、XOR、サイズ、410判定
  index.ts                   # GET clip / audio、素材とスタンプの 410
tests/
  api/letters.test.ts        # LetterApi の FormData と 404/410
  media/compressImage.test.ts
  media/prepareClip.test.ts
  media/prepareAudio.test.ts
  media/bundleVideo.test.ts
  media/shareBundle.test.ts
  compose/ComposePage.test.tsx
  letter/LetterPage.test.tsx
  worker/letters.test.ts
```

触らない（本スライスで足さない）: LINE SDK、Cloudflare Stream、ffmpeg、決済、アカウント、手紙一覧、削除UI、デプロイ設定の公開URL。

---

### Task 1: Worker の手紙APIをまとめ手紙モデルへ拡張する

**Files:**
- Modify: `worker/store.ts`
- Modify: `worker/index.ts`
- Modify: `tests/worker/letters.test.ts`
- Test: `tests/worker/letters.test.ts`

**Interfaces:**
- Consumes: 既存の R2 バインディング `env.LETTERS`、ID `l_` + 32桁hex。
- Produces:
  - `LetterRecord` は `media: { kind: "photos"; photos: { contentType: string }[] } | { kind: "clip"; clip: { contentType: string } }`、任意 `audio?: { contentType: string }`、`expiresAt: string`。
  - `toPublic(record)` は `{ id, createdAt, expiresAt, addressTo, body, signature, media: { kind: "photos", photoUrls } | { kind: "clip", clipUrl }, audioUrl: string | null, stamps }`。内部の `photos` 配列は公開しない。
  - `getLetter(env, id)` → `{ status: "ok"; record: LetterRecord } | { status: "not_found" } | { status: "expired" }`
  - `createLetter` は photos XOR clip、任意 audio。失敗は `{ ok: false, status: 400 | 503 }`
  - `addStamp` は `"not_found" | "expired" | "bad_kind" | "unavailable" | { stamps }`
  - R2キー: `letters/{id}.json`、`letters/{id}/photo-{n}`、`letters/{id}/clip`、`letters/{id}/audio`
  - HTTP: `GET /clip`、`GET /audio`、期限切れは JSON `{ "error": "expired" }` で 410。`POST /api/generate` と `POST /api/letters/:id/bundle` は 404。

- [ ] **Step 1: Write the failing tests**

`tests/worker/letters.test.ts` を次で置き換える。既存の写真ハッピーパスは公開JSONの形だけ新仕様に合わせる。

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.worker.config.ts tests/worker/letters.test.ts`

Expected: FAIL（公開JSONがまだ `photoUrls` 直下、clip/audio/410 が無い、写真上限が10MB）

- [ ] **Step 3: Write minimal implementation**

`worker/store.ts` を次で置き換える。

```ts
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
    if (!AUDIO_TYPES.has(record.audio.contentType)) return false;
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
    return CLIP_TYPES.has(record.media.clip.contentType);
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
  if (clipFile && (!CLIP_TYPES.has(clipFile.type) || clipFile.size > MAX_CLIP_BYTES)) {
    return { ok: false, status: 400 };
  }
  if (
    audioFile &&
    (!AUDIO_TYPES.has(audioFile.type) || audioFile.size > MAX_AUDIO_BYTES)
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
      ? { kind: "clip", clip: { contentType: clipFile.type } }
      : { kind: "photos", photos: photos.map((file) => ({ contentType: file.type })) },
    stamps: { read: 0, cute: 0 },
  };
  if (audioFile) record.audio = { contentType: audioFile.type };

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
        httpMetadata: { contentType: clipFile.type },
      });
    }
    if (audioFile) {
      const key = audioKey(id);
      keysToCleanup.push(key);
      await env.LETTERS.put(key, await audioFile.arrayBuffer(), {
        httpMetadata: { contentType: audioFile.type },
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
```

`worker/index.ts` を次で置き換える。

```ts
import {
  addStamp,
  createLetter,
  getAudio,
  getClip,
  getLetter,
  getPhoto,
  toPublic,
} from "./store";

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}
function gone(): Response {
  return Response.json({ error: "expired" }, { status: 410 });
}
function mediaResponse(bytes: ArrayBuffer, contentType: string): Response {
  return new Response(bytes, {
    headers: {
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api" || parts[1] !== "letters") {
      return notFound();
    }

    if (request.method === "POST" && parts.length === 2) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const result = await createLetter(env, form);
      if (!result.ok) {
        return Response.json(
          { error: result.status === 503 ? "unavailable" : "invalid_input" },
          { status: result.status },
        );
      }
      return Response.json({ id: result.id }, { status: 201 });
    }

    const id = parts[2] ?? "";

    if (request.method === "GET" && parts.length === 3) {
      const result = await getLetter(env, id);
      if (result.status === "not_found") return notFound();
      if (result.status === "expired") return gone();
      return Response.json(toPublic(result.record));
    }

    if (request.method === "GET" && parts[3] === "photos" && parts.length === 5) {
      const n = Number(parts[4]);
      const photo = await getPhoto(env, id, n);
      if (photo.status === "expired") return gone();
      if (photo.status !== "ok") return notFound();
      return mediaResponse(photo.bytes, photo.contentType);
    }

    if (request.method === "GET" && parts[3] === "clip" && parts.length === 4) {
      const clip = await getClip(env, id);
      if (clip.status === "expired") return gone();
      if (clip.status !== "ok") return notFound();
      return mediaResponse(clip.bytes, clip.contentType);
    }

    if (request.method === "GET" && parts[3] === "audio" && parts.length === 4) {
      const audio = await getAudio(env, id);
      if (audio.status === "expired") return gone();
      if (audio.status !== "ok") return notFound();
      return mediaResponse(audio.bytes, audio.contentType);
    }

    if (request.method === "POST" && parts[3] === "stamps" && parts.length === 4) {
      let kind = "";
      try {
        const body = (await request.json()) as { kind?: string };
        kind = String(body.kind ?? "");
      } catch {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      const result = await addStamp(env, id, kind);
      if (result === "bad_kind") {
        return Response.json({ error: "invalid_input" }, { status: 400 });
      }
      if (result === "not_found") return notFound();
      if (result === "expired") return gone();
      if (result === "unavailable") {
        return Response.json({ error: "unavailable" }, { status: 503 });
      }
      return Response.json({ stamps: result.stamps });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.worker.config.ts tests/worker/letters.test.ts`

Expected: PASS

この時点では UI テストは古い `LetterPublic.photoUrls` のままなので、`npm test` 全体はまだ落とさない。Worker だけ緑にする。

- [ ] **Step 5: Commit**

```bash
git add worker/store.ts worker/index.ts tests/worker/letters.test.ts
git commit -m "$(cat <<'EOF'
feat: store letters as photos or a clip with optional audio

Switch the Worker to the bundle letter model so grandparents can open
either photos or a short clip, with 90-day expiry and no server transcode.
EOF
)"
```

---

### Task 2: LetterApi と既存画面を新公開JSONに合わせる

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/letters.ts`
- Create: `tests/api/letters.test.ts`
- Modify: `src/compose/ComposePage.tsx`（`createLetter` 引数だけ）
- Modify: `src/letter/LetterPage.tsx`（`media.photoUrls`・410・StampResult）
- Modify: `tests/compose/ComposePage.test.tsx`
- Modify: `tests/letter/LetterPage.test.tsx`

**Interfaces:**
- Consumes: Task 1 の公開JSONと HTTP 404/410。
- Produces:
```ts
export type LetterMediaPublic =
  | { kind: "photos"; photoUrls: string[] }
  | { kind: "clip"; clipUrl: string };

export type LetterPublic = {
  id: string;
  createdAt: string;
  expiresAt: string;
  addressTo: string;
  body: string;
  signature: string;
  media: LetterMediaPublic;
  audioUrl: string | null;
  stamps: Stamps;
};

export type CreateLetterInput = {
  addressTo: string;
  body: string;
  signature: string;
  media: { kind: "photos"; photos: File[] } | { kind: "clip"; clip: File };
  audio?: File;
};

export type LetterGetResult =
  | { status: "ok"; letter: LetterPublic }
  | { status: "not_found" }
  | { status: "expired" };

export type StampResult =
  | { status: "ok"; stamps: Stamps }
  | { status: "not_found" }
  | { status: "expired" };

export type LetterApi = {
  createLetter(input: CreateLetterInput): Promise<{ id: string }>;
  getLetter(id: string): Promise<LetterGetResult>;
  addStamp(id: string, kind: StampKind): Promise<StampResult>;
};
```

- [ ] **Step 1: Write the failing tests**

`tests/api/letters.test.ts` を新規作成する。

```ts
import { describe, expect, it, vi } from "vitest";
import { createLetterApi } from "../../src/api/letters";

const id = "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("createLetterApi", () => {
  it("posts photos xor clip and optional audio", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id }),
    });
    const api = createLetterApi(fetchImpl as unknown as typeof fetch);
    const photo = new File([new Uint8Array(4)], "a.jpg", { type: "image/jpeg" });
    await api.createLetter({
      addressTo: "じいじ、ばあばへ",
      body: "きょうね",
      signature: "はると",
      media: { kind: "photos", photos: [photo] },
    });
    const photoInit = fetchImpl.mock.calls[0][1] as RequestInit;
    const photoForm = photoInit.body as FormData;
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/letters");
    expect(photoForm.getAll("photos")).toHaveLength(1);
    expect(photoForm.get("clip")).toBeNull();

    const clip = new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" });
    const voice = new File([new Uint8Array(4)], "a.webm", { type: "audio/webm" });
    await api.createLetter({
      addressTo: "じいじ、ばあばへ",
      body: "きょうね",
      signature: "はると",
      media: { kind: "clip", clip },
      audio: voice,
    });
    const clipForm = (fetchImpl.mock.calls[1][1] as RequestInit).body as FormData;
    expect(clipForm.get("clip")).toBe(clip);
    expect(clipForm.get("audio")).toBe(voice);
    expect(clipForm.getAll("photos")).toEqual([]);
  });

  it("maps 404 and 410 on get and stamp", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ status: 410, ok: false })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({
          id,
          createdAt: "2026-09-10T00:00:00.000Z",
          expiresAt: "2026-12-09T00:00:00.000Z",
          addressTo: "じいじ、ばあばへ",
          body: "きょうね",
          signature: "はると",
          media: { kind: "photos", photoUrls: [`/api/letters/${id}/photos/0`] },
          audioUrl: null,
          stamps: { read: 0, cute: 0 },
        }),
      })
      .mockResolvedValueOnce({ status: 410, ok: false });
    const api = createLetterApi(fetchImpl as unknown as typeof fetch);
    await expect(api.getLetter(id)).resolves.toEqual({ status: "not_found" });
    await expect(api.getLetter(id)).resolves.toEqual({ status: "expired" });
    await expect(api.getLetter(id)).resolves.toMatchObject({ status: "ok" });
    await expect(api.addStamp(id, "read")).resolves.toEqual({ status: "expired" });
  });
});
```

`tests/letter/LetterPage.test.tsx` の fixture と mock を新型に合わせ、期限切れテストを足す。**すべての** `getLetter` / `addStamp` mock を結果型にする。`mockResolvedValue(letter)` は `{ status: "ok", letter }`。`mockResolvedValue(null)`（未知ID・stamp が null）は `{ status: "not_found" }`。`mockRejectedValue` はそのまま（画面は throw を見つからない表示へ倒す）。成功スタンプは `{ status: "ok", stamps: { read: 1, cute: 2 } }`。

```tsx
const letter: LetterPublic = {
  id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-08T12:00:00.000Z",
  expiresAt: "2026-12-07T12:00:00.000Z",
  addressTo: "じいじ、ばあばへ",
  body: "きょうね、たてたよ",
  signature: "はると",
  media: {
    kind: "photos",
    photoUrls: ["/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/photos/0"],
  },
  audioUrl: null,
  stamps: { read: 0, cute: 2 },
};

function apiWithLetter(
  overrides: Partial<LetterApi> = {},
): LetterApi {
  return {
    createLetter: vi.fn(),
    getLetter: vi.fn().mockResolvedValue({ status: "ok", letter }),
    addStamp: vi.fn(),
    ...overrides,
  };
}
```

既存テストの `getLetter: vi.fn().mockResolvedValue(letter)` もすべて `{ status: "ok", letter }` にする。未知IDの `mockResolvedValue(null)` と stamp 失敗の `mockResolvedValue(null)` は `{ status: "not_found" }` にする。残してはいけない。

写真 src の assertion は `letter.media.kind === "photos" ? letter.media.photoUrls[0] : ""` を使う。

期限切れテストを追加する。

```tsx
it("shows a closed letter for expired id", async () => {
  renderLetter(
    apiWithLetter({
      getLetter: vi.fn().mockResolvedValue({ status: "expired" }),
    }),
  );
  expect(
    await screen.findByText("このお手紙は90日で閉じました"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
    "href",
    "/",
  );
  expect(screen.queryByText("きょうね、たてたよ")).not.toBeInTheDocument();
});
```

`getLetter` が reject する既存テストは「お手紙が見つからない」のまま。

`tests/compose/ComposePage.test.tsx` の `createLetter` 期待値を次の形にする（写真削除・並べ替えの3テスト）。

```ts
expect(api.createLetter).toHaveBeenCalledWith({
  media: { kind: "photos", photos: [files[1]] },
  addressTo: "じいじ、ばあばへ",
  body: "きょうね、たてたよ",
  signature: "はると",
});
```

並べ替えテストも `media: { kind: "photos", photos: [...] }` にする。`audio` は付けない。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/letters.test.ts tests/letter/LetterPage.test.tsx tests/compose/ComposePage.test.tsx`

Expected: FAIL（型と `createLetter` 引数が古い、期限切れ画面が無い）

- [ ] **Step 3: Write minimal implementation**

`src/api/types.ts` を Produces の型どおり置き換える。`StampKind` と `Stamps` は残す。

`src/api/letters.ts`:

```ts
import type {
  CreateLetterInput,
  LetterApi,
  LetterGetResult,
  StampKind,
  StampResult,
  Stamps,
} from "./types";

export function createLetterApi(fetchImpl: typeof fetch = fetch): LetterApi {
  return {
    async createLetter(input: CreateLetterInput): Promise<{ id: string }> {
      const form = new FormData();
      form.set("addressTo", input.addressTo);
      form.set("body", input.body);
      form.set("signature", input.signature);
      if (input.media.kind === "photos") {
        for (const photo of input.media.photos) form.append("photos", photo);
      } else {
        form.set("clip", input.media.clip);
      }
      if (input.audio) form.set("audio", input.audio);
      const res = await fetchImpl("/api/letters", { method: "POST", body: form });
      if (!res.ok) throw new Error("create_failed");
      return (await res.json()) as { id: string };
    },
    async getLetter(id: string): Promise<LetterGetResult> {
      const res = await fetchImpl(`/api/letters/${id}`);
      if (res.status === 404) return { status: "not_found" };
      if (res.status === 410) return { status: "expired" };
      if (!res.ok) throw new Error("get_failed");
      return { status: "ok", letter: await res.json() };
    },
    async addStamp(id: string, kind: StampKind): Promise<StampResult> {
      const res = await fetchImpl(`/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.status === 404) return { status: "not_found" };
      if (res.status === 410) return { status: "expired" };
      if (!res.ok) throw new Error("stamp_failed");
      const json = (await res.json()) as { stamps: Stamps };
      return { status: "ok", stamps: json.stamps };
    },
  };
}
```

`ComposePage` の保存だけを変える。

```ts
const { id } = await api.createLetter({
  media: { kind: "photos", photos },
  addressTo,
  body,
  signature,
});
```

`LetterPage` の状態を次にする。

```ts
type View =
  | { status: "loading" }
  | { status: "ok"; letter: LetterPublic }
  | { status: "not_found" }
  | { status: "expired" };
```

`getLetter` の結果をそのまま View にする（throw は `not_found`）。写真グリッドは `letter.media.kind === "photos"` のときだけ `letter.media.photoUrls` を描く。`addStamp` が `not_found` / `expired` ならその View へ切り替える。成功時は `stamps` だけ更新。

期限切れの専用表示:

```tsx
if (view.status === "expired") {
  return (
    <main className="page-shell letter-shell">
      <div className="page-column empty-letter">
        <p className="wordmark">Magocoro</p>
        <div className="empty-paper">
          <p className="empty-kicker">便りをひらけませんでした</p>
          <h1 className="empty-title">このお手紙は90日で閉じました</h1>
          <p className="empty-copy">期限がすぎたお手紙です。新しいお手紙をつくれます。</p>
          <Link to="/" className="text-link">
            お手紙をつくる
          </Link>
        </div>
      </div>
    </main>
  );
}
```

見つからない表示の文言は現行どおり「お手紙が見つからない」。例外画面（React error boundary や `throw` UI）は足さない。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/letters.test.ts tests/letter/LetterPage.test.tsx tests/compose/ComposePage.test.tsx`

Expected: PASS

続けて型チェックが通るか見る。

Run: `npx tsc --noEmit -p tsconfig.app.json`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/letters.ts tests/api/letters.test.ts src/compose/ComposePage.tsx src/letter/LetterPage.tsx tests/compose/ComposePage.test.tsx tests/letter/LetterPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: point LetterApi at photos-or-clip public JSON

Keep screens compiling against the bundle letter payload, including
404/410 result types so expired letters can close without an exception page.
EOF
)"
```

---

### Task 3: 画像を長辺1280 JPEGへ落とす

**Files:**
- Create: `src/media/compressImage.ts`
- Test: `tests/media/compressImage.test.ts`

**Interfaces:**
- Consumes: ブラウザの canvas（テストでは `load` / `toJpeg` を注入）。
- Produces: `compressImage(file: File, deps?: CompressImageDeps): Promise<File>` — 成功時 `type: "image/jpeg"`、`name: "photo.jpg"`、サイズ ≦ 1MB。目標は 400KB。長辺が1280を超える入力は長辺1280へ縮小する。

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage, type CompressImageDeps } from "../../src/media/compressImage";

function depsWith(
  width: number,
  height: number,
  sizes: number[],
): CompressImageDeps {
  const toJpeg = vi.fn();
  for (const size of sizes) {
    toJpeg.mockResolvedValueOnce(
      new Blob([new Uint8Array(size)], { type: "image/jpeg" }),
    );
  }
  return {
    async load() {
      return {
        width,
        height,
        draw() {},
      };
    },
    toJpeg,
  };
}

describe("compressImage", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage() {},
    } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resizes a long edge above 1280 and returns a jpeg under the hard limit", async () => {
    const deps = depsWith(4000, 3000, [200 * 1024]);
    const input = new File([new Uint8Array(80)], "cam.png", { type: "image/png" });
    const out = await compressImage(input, deps);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo.jpg");
    expect(out.size).toBe(200 * 1024);
    expect(deps.toJpeg).toHaveBeenCalled();
  });

  it("lowers jpeg quality until the blob is at most 400KB", async () => {
    const deps = depsWith(1280, 960, [500 * 1024, 300 * 1024]);
    const out = await compressImage(
      new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" }),
      deps,
    );
    expect(out.size).toBe(300 * 1024);
    expect(deps.toJpeg).toHaveBeenCalledTimes(2);
  });

  it("throws when the jpeg stays above 1MB", async () => {
    const deps = depsWith(1280, 960, [2 * 1024 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024]);
    await expect(
      compressImage(
        new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" }),
        deps,
      ),
    ).rejects.toThrow("too_large");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media/compressImage.test.ts`

Expected: FAIL（モジュールが無い）

- [ ] **Step 3: Write minimal implementation**

```ts
export const IMAGE_MAX_EDGE = 1280;
export const IMAGE_TARGET_BYTES = 400 * 1024;
export const IMAGE_HARD_MAX_BYTES = 1024 * 1024;

export type CompressImageDeps = {
  load: (file: File) => Promise<{
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  }>;
  toJpeg: (canvas: HTMLCanvasElement, quality: number) => Promise<Blob>;
};

export const browserImageDeps: CompressImageDeps = {
  async load(file) {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
      },
    };
  },
  toJpeg(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode"))),
        "image/jpeg",
        quality,
      );
    });
  },
};

export async function compressImage(
  file: File,
  deps: CompressImageDeps = browserImageDeps,
): Promise<File> {
  const image = await deps.load(file);
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  image.draw(ctx, width, height);

  let quality = 0.82;
  let blob = await deps.toJpeg(canvas, quality);
  while (blob.size > IMAGE_TARGET_BYTES && quality > 0.4) {
    quality -= 0.14;
    blob = await deps.toJpeg(canvas, quality);
  }
  if (blob.size > IMAGE_HARD_MAX_BYTES) throw new Error("too_large");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media/compressImage.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/media/compressImage.ts tests/media/compressImage.test.ts
git commit -m "$(cat <<'EOF'
feat: compress photos to 1280px JPEG on the device

Drop camera originals before upload so the Worker only stores sub-1MB
JPEGs and stays inside the free R2 budget.
EOF
)"
```

---

### Task 4: 動画と音声の尺・形式を端末で判定する

**Files:**
- Create: `src/media/measureDuration.ts`
- Create: `src/media/prepare.ts`
- Create: `src/media/prepareClip.ts`
- Create: `src/media/prepareAudio.ts`
- Test: `tests/media/prepareClip.test.ts`
- Test: `tests/media/prepareAudio.test.ts`

**Interfaces:**
- Consumes: `measureDuration(file: File): Promise<number>`（秒。テストでは差し替え）。
- Produces:
```ts
export type PrepareOk = { ok: true; file: File };
export type PrepareErr = { ok: false; reason: "too_long" | "unsupported" | "too_large" };
export type PrepareResult = PrepareOk | PrepareErr;

export const MAX_MEDIA_SECONDS = 30;
export const TARGET_CLIP_BYTES = 8 * 1024 * 1024;
export const TARGET_AUDIO_BYTES = Math.floor(0.3 * 1024 * 1024);
export const HARD_AUDIO_BYTES = 1024 * 1024;
export const CLIP_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
export const AUDIO_TYPES = new Set(["audio/mp4", "audio/aac", "audio/webm", "audio/ogg"]);

export async function prepareClip(
  file: File,
  measureDuration: (file: File) => Promise<number>,
  transcode?: (file: File) => Promise<File>,
): Promise<PrepareResult>;

export async function prepareAudio(
  file: File,
  measureDuration: (file: File) => Promise<number>,
): Promise<PrepareResult>;
```

サーバは尺を読まない。30秒超の拒否はここが正。`transcode` があるときは720p相当へ再エンコードした結果を送り、失敗しても形式・尺・8MBを満たす原ファイルは通す（jsdom と MediaRecorder 非対応端末のため）。再エンコード結果が8MB超でも、原ファイルが8MB以下なら原ファイルを通す。音声の 0.3MB は録音時の目標であり、拒否は 1MB 超のみ。

- [ ] **Step 1: Write the failing tests**

`tests/media/prepareClip.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { prepareClip } from "../../src/media/prepareClip";

function video(type: string, size: number): File {
  return new File([new Uint8Array(size)], "a.mp4", { type });
}

describe("prepareClip", () => {
  it("rejects clips longer than 30 seconds", async () => {
    const result = await prepareClip(
      video("video/mp4", 1000),
      async () => 30.2,
    );
    expect(result).toEqual({ ok: false, reason: "too_long" });
  });

  it("rejects unsupported types and oversized files", async () => {
    await expect(
      prepareClip(video("video/x-msvideo", 1000), async () => 3),
    ).resolves.toEqual({ ok: false, reason: "unsupported" });
    await expect(
      prepareClip(video("video/mp4", 8 * 1024 * 1024 + 1), async () => 3),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("returns the transcoded file when transcode succeeds", async () => {
    const original = video("video/quicktime", 2000);
    const out = video("video/webm", 500);
    const transcode = vi.fn().mockResolvedValue(out);
    const result = await prepareClip(original, async () => 12, transcode);
    expect(result).toEqual({ ok: true, file: out });
    expect(transcode).toHaveBeenCalledWith(original);
  });

  it("falls back to the original when transcode fails but the file is within limits", async () => {
    const original = video("video/mp4", 2000);
    const result = await prepareClip(
      original,
      async () => 8,
      async () => {
        throw new Error("no recorder");
      },
    );
    expect(result).toEqual({ ok: true, file: original });
  });

  it("keeps the original when transcode output exceeds 8MB but the source does not", async () => {
    const original = video("video/mp4", 2000);
    const bloated = video("video/webm", 8 * 1024 * 1024 + 1);
    const result = await prepareClip(original, async () => 8, async () => bloated);
    expect(result).toEqual({ ok: true, file: original });
  });
});
```

`tests/media/prepareAudio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prepareAudio } from "../../src/media/prepareAudio";

function voice(type: string, size: number): File {
  return new File([new Uint8Array(size)], "a.webm", { type });
}

describe("prepareAudio", () => {
  it("rejects audio longer than 30 seconds", async () => {
    await expect(
      prepareAudio(voice("audio/webm", 100), async () => 31),
    ).resolves.toEqual({ ok: false, reason: "too_long" });
  });

  it("accepts short opus or aac without audio", async () => {
    const file = voice("audio/webm", 2048);
    await expect(prepareAudio(file, async () => 6)).resolves.toEqual({
      ok: true,
      file,
    });
  });

  it("rejects mp3 and files over 1MB", async () => {
    await expect(
      prepareAudio(voice("audio/mpeg", 100), async () => 2),
    ).resolves.toEqual({ ok: false, reason: "unsupported" });
    await expect(
      prepareAudio(voice("audio/webm", 1024 * 1024 + 1), async () => 2),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media/prepareClip.test.ts tests/media/prepareAudio.test.ts`

Expected: FAIL（モジュールが無い）

- [ ] **Step 3: Write minimal implementation**

`src/media/measureDuration.ts`:

```ts
export function measureDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(
      file.type.startsWith("audio/") ? "audio" : "video",
    );
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const duration = el.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(duration)) reject(new Error("no_duration"));
      else resolve(duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load_failed"));
    };
    el.src = url;
  });
}
```

`src/media/prepare.ts`:

```ts
export type PrepareOk = { ok: true; file: File };
export type PrepareErr = {
  ok: false;
  reason: "too_long" | "unsupported" | "too_large";
};
export type PrepareResult = PrepareOk | PrepareErr;
export const MAX_MEDIA_SECONDS = 30;
```

`src/media/prepareClip.ts`:

```ts
import { MAX_MEDIA_SECONDS, type PrepareResult } from "./prepare";

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
  if (!CLIP_TYPES.has(file.type)) return { ok: false, reason: "unsupported" };
  const duration = await measureDuration(file);
  if (duration > MAX_MEDIA_SECONDS) return { ok: false, reason: "too_long" };
  if (transcode) {
    try {
      const next = await transcode(file);
      if (next.size <= TARGET_CLIP_BYTES) return { ok: true, file: next };
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
```

`src/media/prepareAudio.ts`:

```ts
import { MAX_MEDIA_SECONDS, type PrepareResult } from "./prepare";

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
  if (!AUDIO_TYPES.has(file.type)) return { ok: false, reason: "unsupported" };
  const duration = await measureDuration(file);
  if (duration > MAX_MEDIA_SECONDS) return { ok: false, reason: "too_long" };
  if (file.size > HARD_AUDIO_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, file };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media/prepareClip.test.ts tests/media/prepareAudio.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/media/prepare.ts src/media/measureDuration.ts src/media/prepareClip.ts src/media/prepareAudio.ts tests/media/prepareClip.test.ts tests/media/prepareAudio.test.ts
git commit -m "$(cat <<'EOF'
feat: reject overlong clips and audio on the device

Keep Worker CPU off duration parsing by gating 30s media in the browser
before a letter is saved.
EOF
)"
```

---

### Task 5: 作る画面に媒体切替・圧縮・任意音声を載せる

**Files:**
- Modify: `src/compose/ComposePage.tsx`
- Modify: `src/index.css`
- Modify: `tests/compose/ComposePage.test.tsx`

**Interfaces:**
- Consumes: `compressImage`、`prepareClip(file, measureDuration, transcodeClipTo720p)`、`prepareAudio(file, measureDuration)`、`LetterApi.createLetter`（Task 2 の引数）。
- Produces: 媒体トグル（写真 / 動画）。切替で片方の選択を捨てる。写真は選んだ直後に JPEG 圧縮。動画・音声は30秒超をその場で拒否。音声なしでも作れる。本文プレースホルダは「今週のできごとを、短くでよいので書いてください」。孫口調の案内は出さない。失敗時は「いま保存できません」で入力を残す。

- [ ] **Step 1: Write the failing tests**

`tests/compose/ComposePage.test.tsx` の先頭構造テストと disabled テストを置き換え、切替・音声・文言のテストを足す。圧縮・尺判定は mock する。

```tsx
import { prepareClip } from "../../src/media/prepareClip";

vi.mock("../../src/media/compressImage", () => ({
  compressImage: async (file: File) => file,
}));
vi.mock("../../src/media/prepareClip", () => ({
  prepareClip: vi.fn(async (file: File) => ({ ok: true as const, file })),
  transcodeClipTo720p: vi.fn(async (file: File) => file),
}));
vi.mock("../../src/media/prepareAudio", () => ({
  prepareAudio: vi.fn(async (file: File) => ({ ok: true as const, file })),
}));
vi.mock("../../src/media/measureDuration", () => ({
  measureDuration: async () => 3,
}));
```

`compressImage` は同一 `File` を返す。削除・並べ替えテストの `photos: [files[1]]` 参照がそのまま通る。

追加・変更するテスト:

```tsx
it("frames composing as stationery steps without grandchild-tone coaching", () => {
  const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
  const { container } = renderCompose(api);
  expect(screen.getByRole("heading", { name: "こんなことがあったよ" })).toBeInTheDocument();
  expect(
    screen.getByText("写真または短い動画と、ことばと声を1通にまとめる、Webのお手紙です。"),
  ).toBeInTheDocument();
  expect(screen.queryByText("孫の口調で書いてください")).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("今週のできごとを、短くでよいので書いてください")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "写真" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "動画" })).toHaveAttribute("aria-pressed", "false");
  expect(container.querySelector(".compose-seal")).not.toBeInTheDocument();
});

it("keeps submit disabled without media, body, or signature", async () => {
  const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
  renderCompose(api);
  expect(screen.getByRole("button", { name: "お手紙をつくる" })).toBeDisabled();
  expect(screen.getByText("写真を1枚以上えらんでください")).toBeInTheDocument();
});

it("clears photos when switching to video", async () => {
  const user = userEvent.setup();
  const api: LetterApi = {
    createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    getLetter: vi.fn(),
    addStamp: vi.fn(),
  };
  renderCompose(api);
  await user.upload(screen.getByLabelText("写真"), jpeg());
  await user.click(screen.getByRole("button", { name: "動画" }));
  expect(screen.queryByRole("img", { name: "選んだ写真 1" })).not.toBeInTheDocument();
  await user.upload(
    screen.getByLabelText("動画"),
    new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
  );
  await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
  await user.type(screen.getByLabelText("署名"), "はると");
  await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
  expect(api.createLetter).toHaveBeenCalledWith(
    expect.objectContaining({
      media: expect.objectContaining({ kind: "clip" }),
    }),
  );
});

it("rejects a clip over 30 seconds without clearing the body", async () => {
  const user = userEvent.setup({ applyAccept: false });
  vi.mocked(prepareClip).mockResolvedValueOnce({ ok: false, reason: "too_long" });
  const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
  renderCompose(api);
  await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
  await user.click(screen.getByRole("button", { name: "動画" }));
  await user.upload(
    screen.getByLabelText("動画"),
    new File([new Uint8Array(8)], "a.mp4", { type: "video/mp4" }),
  );
  expect(await screen.findByText("30秒以内にしてください")).toBeInTheDocument();
  expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
});

it("creates a photo letter without audio", async () => {
  const user = userEvent.setup();
  const api: LetterApi = {
    createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    getLetter: vi.fn(),
    addStamp: vi.fn(),
  };
  renderCompose(api);
  await user.upload(screen.getByLabelText("写真"), jpeg());
  await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
  await user.type(screen.getByLabelText("署名"), "はると");
  await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
  expect(api.createLetter).toHaveBeenCalledWith({
    media: { kind: "photos", photos: [expect.any(File)] },
    addressTo: "じいじ、ばあばへ",
    body: "きょうね、たてたよ",
    signature: "はると",
  });
});

it("attaches prepared audio when a voice file is chosen", async () => {
  const user = userEvent.setup();
  const voice = new File([new Uint8Array(8)], "a.webm", { type: "audio/webm" });
  const api: LetterApi = {
    createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
    getLetter: vi.fn(),
    addStamp: vi.fn(),
  };
  renderCompose(api);
  await user.upload(screen.getByLabelText("写真"), jpeg());
  await user.upload(screen.getByLabelText("声"), voice);
  await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
  await user.type(screen.getByLabelText("署名"), "はると");
  await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
  expect(api.createLetter).toHaveBeenCalledWith(
    expect.objectContaining({ audio: expect.any(File) }),
  );
});

it("keeps other fields when recording is denied", async () => {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
    },
  });
  const api: LetterApi = { createLetter: vi.fn(), getLetter: vi.fn(), addStamp: vi.fn() };
  renderCompose(api);
  await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
  await user.click(screen.getByRole("button", { name: "録音する" }));
  expect(await screen.findByText("録音できません")).toBeInTheDocument();
  expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
});
```

10MB 写真の受け入れ／拒否テストは削除する（圧縮後の1MBは Task 3 が担保。作る画面は形式エラーだけ残す）。

成功ナビ・保存失敗・非対応写真・削除・並べ替えテストは残し、`createLetter` 期待値は Task 2 の `media: { kind: "photos", photos }` のまま。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compose/ComposePage.test.tsx`

Expected: FAIL（トグルも音声も新プレースホルダも無い）

- [ ] **Step 3: Write minimal implementation**

`ComposePage` の状態を次に拡張する。既存の写真並べ替えヘルパー（`moveItem`、pointer drag、ArrowLeft/Right、`getPhotoKey`）はそのまま残す。

```ts
type MediaKind = "photos" | "clip";

const [mediaKind, setMediaKind] = useState<MediaKind>("photos");
const mediaKindRef = useRef(mediaKind);
mediaKindRef.current = mediaKind;
const [photos, setPhotos] = useState<File[]>([]);
const [clip, setClip] = useState<File | null>(null);
const [audio, setAudio] = useState<File | null>(null);
const [mediaError, setMediaError] = useState("");
```

`reason`:

```ts
if (mediaKind === "photos" && photos.length < 1) return "写真を1枚以上えらんでください";
if (mediaKind === "clip" && !clip) return "動画をえらんでください";
if (body.trim() === "") return "本文を書いてください";
if (signature.trim() === "") return "なまえを書いてください";
if (body.length > 1000) return "本文は1000字以内にしてください";
if (signature.length > 20) return "なまえは20字以内にしてください";
return "";
```

切替:

```ts
function switchKind(next: MediaKind) {
  if (next === mediaKind) return;
  setMediaKind(next);
  setMediaError("");
  if (next === "photos") setClip(null);
  else setPhotos([]);
}
```

写真選択（圧縮）:

```ts
async function onPhotos(files: FileList | null) {
  if (!files) return;
  setMediaError("");
  const next = [...photos];
  for (const file of Array.from(files)) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMediaError("この写真は使えません");
      continue;
    }
    if (next.length >= 3) break;
    try {
      next.push(await compressImage(file));
    } catch {
      setMediaError("この写真は使えません");
    }
  }
  if (mediaKindRef.current !== "photos") return;
  setPhotos(next);
}
```

動画選択:

```ts
async function onClip(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  const result = await prepareClip(file, measureDuration, transcodeClipTo720p);
  if (!result.ok) {
    setClip(null);
    setMediaError(result.reason === "too_long" ? "30秒以内にしてください" : "この動画は使えません");
    return;
  }
  if (mediaKindRef.current !== "clip") return;
  setMediaError("");
  setClip(result.file);
}
```

音声選択:

```ts
async function onAudio(files: FileList | null) {
  const file = files?.[0];
  if (!file) return;
  const result = await prepareAudio(file, measureDuration);
  if (!result.ok) {
    setAudio(null);
    setMediaError(result.reason === "too_long" ? "30秒以内にしてください" : "この音声は使えません");
    return;
  }
  setMediaError("");
  setAudio(result.file);
}
```

録音ボタン: 次の実装を使う。失敗は「録音できません」。他の入力は消さない。`aria-pressed` は録音中 `true`。

```ts
const [recording, setRecording] = useState(false);
const recorderRef = useRef<MediaRecorder | null>(null);
const recordTimerRef = useRef<number | null>(null);

async function toggleRecord() {
  if (recording) {
    recorderRef.current?.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (recordTimerRef.current !== null) window.clearTimeout(recordTimerRef.current);
      setRecording(false);
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      void onAudioFile(
        new File([blob], "voice.webm", { type: blob.type || "audio/webm" }),
      );
    };
    recorderRef.current = recorder;
    setRecording(true);
    recorder.start();
    recordTimerRef.current = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 30_000);
  } catch {
    setMediaError("録音できません");
  }
}

async function onAudioFile(file: File) {
  const result = await prepareAudio(file, measureDuration);
  if (!result.ok) {
    setAudio(null);
    setMediaError(result.reason === "too_long" ? "30秒以内にしてください" : "この音声は使えません");
    return;
  }
  setMediaError("");
  setAudio(result.file);
}
```

ファイル選択の `onAudio` は `onAudioFile(file)` を呼ぶ。

保存:

```ts
await api.createLetter({
  addressTo,
  body,
  signature,
  media:
    mediaKind === "photos"
      ? { kind: "photos", photos }
      : { kind: "clip", clip: clip as File },
  audio: audio ?? undefined,
});
```

JSX（手順1の見出し部）:

```tsx
<header className="compose-header" aria-label="便箋のヘッダー">
  <div className="brand-lockup">
    <h1 className="wordmark">Magocoro</h1>
    <span className="brand-wave" aria-hidden="true" />
  </div>
  <h2 className="compose-title">こんなことがあったよ</h2>
  <p className="compose-intro">
    写真または短い動画と、ことばと声を1通にまとめる、Webのお手紙です。
  </p>
</header>
```

媒体トグルとスロット:

```tsx
<div className="media-toggle" role="group" aria-label="写真または動画">
  <button type="button" aria-pressed={mediaKind === "photos"} onClick={() => switchKind("photos")}>
    写真
  </button>
  <button type="button" aria-pressed={mediaKind === "clip"} onClick={() => switchKind("clip")}>
    動画
  </button>
</div>
```

写真モードは現行の3枠グリッドを残す。ヘルパー文は「写真は1〜3枚まで。選んだあと小さくします」。

動画モードは1つの `label`「動画をえらぶ」+ `input[type=file][accept="video/mp4,video/webm,video/quicktime"]` `aria-label="動画"`。選んだらプレビュー `<video controls playsInline>`。自動再生しない。

音声セクション（手順1の下、宛名の前）:

```tsx
<section className="field-group compose-step">
  <div className="step-heading-row">
    <span className="step-index" aria-hidden="true">2</span>
    <div>
      <h2 className="section-title">声（任意）</h2>
      <p className="section-helper">30秒以内。なくても作れます</p>
    </div>
  </div>
  <div className="audio-row">
    <button type="button" aria-pressed={recording} aria-label="録音" onClick={toggleRecord}>
      {recording ? "録音を止める" : "録音する"}
    </button>
    <label htmlFor="audio" className="secondary-button">ファイルをえらぶ</label>
    <input id="audio" aria-label="声" type="file" accept="audio/mp4,audio/aac,audio/webm,audio/ogg" className="file-input" onChange={(e) => void onAudio(e.target.files)} />
  </div>
  {audio ? <p className="section-helper">声をのせました</p> : null}
</section>
```

宛名を3、本文を4、なまえを5にする（`.step-index` は `1`〜`5`）。本文の `field-helper` は置かない。textarea:

```tsx
placeholder="今週のできごとを、短くでよいので書いてください"
```

`src/index.css` に次を足す。既存の `.primary-button` と同じく min-height 44px。

```css
.media-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0 0 1rem;
}
.media-toggle button {
  min-height: 44px;
  border: 1px solid var(--color-line);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
}
.media-toggle button[aria-pressed="true"] {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.audio-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.audio-row button,
.audio-row label {
  min-height: 44px;
  min-width: 44px;
}
.clip-preview {
  width: 100%;
  border: 8px solid #fff;
  border-radius: 4px;
  box-shadow: 0 0 0 1px var(--color-line);
}
```

紫・ネオン・金・絵文字は使わない。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compose/ComposePage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/compose/ComposePage.tsx src/index.css tests/compose/ComposePage.test.tsx
git commit -m "$(cat <<'EOF'
feat: let parents pick photos or a clip plus optional voice

Switch the compose form to one medium, compress on select, and drop
grandchild-tone coaching so the saved letter stays the parent's words.
EOF
)"
```

---

### Task 6: 手紙画面でクリップ・音声・コピー注記を出す

**Files:**
- Modify: `src/letter/LetterPage.tsx`
- Modify: `src/index.css`
- Modify: `tests/letter/LetterPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `LetterGetResult` / `LetterPublic.media` / `audioUrl`。
- Produces: 切手枠に写真（複数なら順に）または `<video controls playsInline>`。`audioUrl` があれば `<audio controls>`（自動再生しない）。リンクコピーは閲覧者にも出す。注記は「このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます」。成功「コピーしました」。`fromCompose` での表示制限は外す（リロード後も送れるようにする）。

- [ ] **Step 1: Write the failing tests**

```tsx
it("plays a clip and optional audio without autoplay", async () => {
  const clipLetter: LetterPublic = {
    ...letter,
    media: { kind: "clip", clipUrl: `/api/letters/${letter.id}/clip` },
    audioUrl: `/api/letters/${letter.id}/audio`,
  };
  renderLetter(
    apiWithLetter({
      getLetter: vi.fn().mockResolvedValue({ status: "ok", letter: clipLetter }),
    }),
  );
  const video = await screen.findByLabelText("手紙の動画");
  expect(video.tagName).toBe("VIDEO");
  expect(video).toHaveAttribute("src", clipLetter.media.kind === "clip" ? clipLetter.media.clipUrl : "");
  expect(video).not.toHaveAttribute("autoPlay");
  const audio = screen.getByLabelText("手紙の声");
  expect(audio.tagName).toBe("AUDIO");
  expect(audio).toHaveAttribute("src", clipLetter.audioUrl);
  expect(audio).not.toHaveAttribute("autoPlay");
});

it("shows the copy note with the 90-day closing line", async () => {
  renderLetter(apiWithLetter());
  expect(
    await screen.findByText(
      "このリンクをLINEに貼ると、相手のスマホでも開けます。90日で閉じます",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
});
```

`presents the shared letter as a family photo letter` から次の2断言を削除する（独立した送り側限定テストは無い。この中にある）。

```tsx
expect(
  screen.queryByText("このリンクをLINEに貼ると、相手のスマホでも開けます"),
).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "リンクをコピー" })).not.toBeInTheDocument();
```

代わりに、コピーボタンがあることと90日注記をこのテストまたは上の新規テストで見る。コピー成功・失敗テストから `fromCompose` 引数を外す。`useLocation` も LetterPage から消すので `renderLetter` の `state` 引数は残しても無視される。

写真経路の既存テストは `letter.media.photoUrls` を使う現行のまま残す。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/letter/LetterPage.test.tsx`

Expected: FAIL（clip/audio が無い、90日注記が無い、共有が送り側限定）

- [ ] **Step 3: Write minimal implementation**

`LetterPage` から `useLocation` / `fromCompose` / `isSender` を削除する。共有セクションは `view.status === "ok"` なら常に出す。

切手枠:

```tsx
<div className="letter-photo-mat" role="group" aria-label={letter.media.kind === "photos" ? "手紙の写真" : "手紙の動画"}>
  {letter.media.kind === "photos" ? (
    <div className={`letter-photo-grid photo-count-${letter.media.photoUrls.length}`}>
      {letter.media.photoUrls.map((src, n) => (
        <img key={src} src={src} alt={`手紙の写真 ${n + 1}`} className="stamp-frame letter-photo" />
      ))}
    </div>
  ) : (
    <video
      className="stamp-frame letter-clip"
      src={letter.media.clipUrl}
      controls
      playsInline
      aria-label="手紙の動画"
    />
  )}
</div>
{letter.audioUrl ? (
  <audio className="letter-audio" src={letter.audioUrl} controls aria-label="手紙の声" />
) : null}
```

注記テキストを Spec どおりに更新する。コピー処理は現行の clipboard 実装のまま。

CSS:

```css
.letter-clip,
.letter-audio {
  width: 100%;
  display: block;
}
.letter-audio {
  margin: 0.75rem 0 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/letter/LetterPage.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/letter/LetterPage.tsx src/index.css tests/letter/LetterPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: render clip, voice, and 90-day copy on the letter

Let grandparents play whichever medium arrived, and keep the share URL
visible after reload instead of hiding it behind compose navigation state.
EOF
)"
```

---

### Task 7: 端末内のまとめ動画を合成する

**Files:**
- Create: `src/media/bundleVideo.ts`
- Test: `tests/media/bundleVideo.test.ts`

**Interfaces:**
- Consumes: 手紙の写真ビットマップまたはクリップ Blob、任意の親音声、本文。
- Produces:
```ts
export function photoDurationsMs(
  count: number,
  audioDurationSec: number | null,
): number[];
// 音声なし: 合計を 6000〜15000ms に収め、各写真へ均等割り。
// 音声あり: 音声の長さを均等割り。

export function planClipBundle(hasParentAudio: boolean): {
  muteClip: boolean;
  useParentAudio: boolean;
  overlayBody: boolean;
};
// 親音声あり → muteClip: true, useParentAudio: true。なし → クリップの音を残す。
// overlayBody は常に true（本文を下部に短く重ねてよい）。

export async function renderPhotoBundle(input: {
  frames: Array<{ source: CanvasImageSource; durationMs: number }>;
  audio?: Blob;
  width: number;
  height: number;
  record: (session: {
    frames: Array<{ source: CanvasImageSource; durationMs: number }>;
    audio?: Blob;
    width: number;
    height: number;
  }) => Promise<Blob>;
}): Promise<Blob>;
```

jsdom に MediaRecorder が無くても、`record` にダミーを渡して1本の Blob が返ることをテストする。実ブラウザの `recordTimeline`（canvas.captureStream + MediaRecorder）も同ファイルに置くが、単体テストでは呼ばない。`prefers-reduced-motion` を見ても作成は止めない。出力を fetch / `LetterApi` に渡さない。

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  photoDurationsMs,
  planClipBundle,
  renderPhotoBundle,
} from "../../src/media/bundleVideo";

describe("bundleVideo", () => {
  it("spreads photos across 6 to 15 seconds without audio", () => {
    expect(photoDurationsMs(1, null).reduce((a, b) => a + b, 0)).toBe(6000);
    const three = photoDurationsMs(3, null);
    expect(three).toHaveLength(3);
    const total = three.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(6000);
    expect(total).toBeLessThanOrEqual(15000);
    expect(photoDurationsMs(2, 10)).toEqual([5000, 5000]);
  });

  it("mutes the clip only when parent audio exists", () => {
    expect(planClipBundle(true)).toEqual({
      muteClip: true,
      useParentAudio: true,
      overlayBody: true,
    });
    expect(planClipBundle(false)).toEqual({
      muteClip: false,
      useParentAudio: false,
      overlayBody: true,
    });
  });

  it("returns one video blob from dummy frames", async () => {
    const record = vi.fn(async () => new Blob([new Uint8Array(16)], { type: "video/webm" }));
    const blob = await renderPhotoBundle({
      frames: [
        { source: {} as CanvasImageSource, durationMs: 3000 },
        { source: {} as CanvasImageSource, durationMs: 3000 },
      ],
      width: 720,
      height: 1280,
      record,
    });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toMatch(/^video\//);
    expect(record).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media/bundleVideo.test.ts`

Expected: FAIL（モジュールが無い）

- [ ] **Step 3: Write minimal implementation**

```ts
export function photoDurationsMs(
  count: number,
  audioDurationSec: number | null,
): number[] {
  if (count < 1) return [];
  const total =
    audioDurationSec && audioDurationSec > 0
      ? Math.round(audioDurationSec * 1000)
      : Math.min(15000, Math.max(6000, count * 3000));
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? total - each * (count - 1) : each,
  );
}

export function planClipBundle(hasParentAudio: boolean): {
  muteClip: boolean;
  useParentAudio: boolean;
  overlayBody: boolean;
} {
  return {
    muteClip: hasParentAudio,
    useParentAudio: hasParentAudio,
    overlayBody: true,
  };
}

export async function renderPhotoBundle(input: {
  frames: Array<{ source: CanvasImageSource; durationMs: number }>;
  audio?: Blob;
  width: number;
  height: number;
  record: (session: {
    frames: Array<{ source: CanvasImageSource; durationMs: number }>;
    audio?: Blob;
    width: number;
    height: number;
  }) => Promise<Blob>;
}): Promise<Blob> {
  return input.record({
    frames: input.frames,
    audio: input.audio,
    width: input.width,
    height: input.height,
  });
}

export async function recordTimeline(session: {
  frames: Array<{ source: CanvasImageSource; durationMs: number }>;
  audio?: Blob;
  width: number;
  height: number;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = session.width;
  canvas.height = session.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  if (session.audio) {
    const audio = document.createElement("audio");
    audio.src = URL.createObjectURL(session.audio);
    const audioStream = (audio as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream?.();
    const track = audioStream?.getAudioTracks()[0];
    if (track) stream.addTrack(track);
    void audio.play();
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  for (const frame of session.frames) {
    ctx.fillStyle = "#f7f2e9";
    ctx.fillRect(0, 0, session.width, session.height);
    ctx.drawImage(frame.source, 0, 0, session.width, session.height);
    await new Promise((resolve) => window.setTimeout(resolve, frame.durationMs));
  }
  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}

export async function recordClipBundle(input: {
  clip: Blob;
  body: string;
  parentAudio?: Blob;
}): Promise<Blob> {
  const plan = planClipBundle(Boolean(input.parentAudio));
  const url = URL.createObjectURL(input.clip);
  const video = document.createElement("video");
  video.src = url;
  video.muted = plan.muteClip;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const stream = canvas.captureStream(24);
  if (plan.useParentAudio && input.parentAudio) {
    const audio = document.createElement("audio");
    audio.src = URL.createObjectURL(input.parentAudio);
    const audioStream = (audio as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream?.();
    const track = audioStream?.getAudioTracks()[0];
    if (track) stream.addTrack(track);
    void audio.play();
  } else {
    const clipAudio = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    const track = clipAudio?.getAudioTracks()[0];
    if (track) stream.addTrack(track);
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();
  const draw = () => {
    if (video.ended) {
      recorder.stop();
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (plan.overlayBody) {
      ctx.fillStyle = "rgba(51, 48, 42, 0.55)";
      ctx.fillRect(0, canvas.height - 64, canvas.width, 64);
      ctx.fillStyle = "#fffdf8";
      ctx.font = "20px 'Noto Sans JP', sans-serif";
      ctx.fillText(input.body.slice(0, 40), 16, canvas.height - 28);
    }
    requestAnimationFrame(draw);
  };
  draw();
  await stopped;
  URL.revokeObjectURL(url);
  return new Blob(chunks, { type: recorder.mimeType || "video/webm" });
}
```

本文オーバーレイに絵文字装飾や紫・金は使わない。`prefers-reduced-motion` の分岐は入れない。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/media/bundleVideo.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/media/bundleVideo.ts tests/media/bundleVideo.test.ts
git commit -m "$(cat <<'EOF'
feat: compose a single keep-video on the device

Build the shareable clip from letter media in the browser so R2 never
stores a concatenated export.
EOF
)"
```

---

### Task 8: 「動画にして送る」で Share または保存する

**Files:**
- Create: `src/media/shareBundle.ts`
- Create: `src/letter/buildKeepVideo.ts`
- Test: `tests/media/shareBundle.test.ts`
- Modify: `src/letter/LetterPage.tsx`
- Modify: `tests/letter/LetterPage.test.tsx`
- Modify: `README.md`（実装計画パスを本ファイルへ）
- Modify: `AGENTS.md`（実装計画の行を本ファイルへ）

**Interfaces:**
- Consumes: `renderPhotoBundle` / `recordTimeline` / `recordClipBundle`、`LetterPublic`。
- Produces:
```ts
export async function shareOrSaveVideo(
  file: File,
  deps: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
    save: (file: File) => void;
  },
): Promise<"shared" | "saved">;
```

`canShare({ files: [file] })` が真なら `share({ files, title: "Magocoro" })`。失敗または非対応なら `save`（object URL + `<a download>`）。LetterPage は「動画にして送る」を出し、成功時 Web Share。保存フォールバック時は「LINEのトークに、この動画を送ってください」。合成失敗時は「動画にできませんでした。リンクを送ってください」でコピーボタンは残す。まとめ動画を `fetch` しない。

- [ ] **Step 1: Write the failing tests**

`tests/media/shareBundle.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { shareOrSaveVideo } from "../../src/media/shareBundle";

const file = new File([new Uint8Array(8)], "magocoro.webm", { type: "video/webm" });

describe("shareOrSaveVideo", () => {
  it("shares a file when the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const save = vi.fn();
    await expect(
      shareOrSaveVideo(file, {
        canShare: () => true,
        share,
        save,
      }),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves when share is missing or throws", async () => {
    const save = vi.fn();
    await expect(shareOrSaveVideo(file, { canShare: () => false, save })).resolves.toBe("saved");
    await expect(
      shareOrSaveVideo(file, {
        canShare: () => true,
        share: async () => {
          throw new Error("denied");
        },
        save,
      }),
    ).resolves.toBe("saved");
    expect(save).toHaveBeenCalledTimes(2);
  });
});
```

`tests/letter/LetterPage.test.tsx` に追加する mock とテスト。`buildKeepVideo` だけを mock し、`bundleVideo` は mock しない。

```tsx
vi.mock("../../src/letter/buildKeepVideo", () => ({
  buildKeepVideo: vi.fn(
    async () =>
      new File([new Uint8Array(8)], "magocoro.webm", { type: "video/webm" }),
  ),
}));
vi.mock("../../src/media/shareBundle", () => ({
  shareOrSaveVideo: vi.fn().mockResolvedValue("shared"),
  downloadFile: vi.fn(),
}));

it("offers a keep-video share without removing URL copy", async () => {
  const user = userEvent.setup();
  renderLetter(apiWithLetter());
  await screen.findByText("じいじ、ばあばへ");
  await user.click(screen.getByRole("button", { name: "動画にして送る" }));
  expect(await screen.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
});

it("keeps URL copy when bundling fails", async () => {
  const user = userEvent.setup();
  const { buildKeepVideo } = await import("../../src/letter/buildKeepVideo");
  vi.mocked(buildKeepVideo).mockRejectedValueOnce(new Error("fail"));
  renderLetter(apiWithLetter());
  await screen.findByText("じいじ、ばあばへ");
  await user.click(screen.getByRole("button", { name: "動画にして送る" }));
  expect(
    await screen.findByText("動画にできませんでした。リンクを送ってください"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
});

it("explains LINE upload when the file is saved locally", async () => {
  const user = userEvent.setup();
  const { shareOrSaveVideo } = await import("../../src/media/shareBundle");
  vi.mocked(shareOrSaveVideo).mockResolvedValueOnce("saved");
  renderLetter(apiWithLetter());
  await screen.findByText("じいじ、ばあばへ");
  await user.click(screen.getByRole("button", { name: "動画にして送る" }));
  expect(
    await screen.findByText("LINEのトークに、この動画を送ってください"),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/media/shareBundle.test.ts tests/letter/LetterPage.test.tsx`

Expected: FAIL（share 関数と「動画にして送る」が無い）

- [ ] **Step 3: Write minimal implementation**

`src/media/shareBundle.ts`:

```ts
export async function shareOrSaveVideo(
  file: File,
  deps: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
    save: (file: File) => void;
  },
): Promise<"shared" | "saved"> {
  const data: ShareData = { files: [file], title: "Magocoro" };
  if (deps.canShare?.(data) && deps.share) {
    try {
      await deps.share(data);
      return "shared";
    } catch {
      deps.save(file);
      return "saved";
    }
  }
  deps.save(file);
  return "saved";
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

`src/letter/buildKeepVideo.ts`:

```ts
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
```

LetterPage の共有セクション:

```tsx
<button type="button" className="secondary-button" onClick={() => void onCopy()}>
  リンクをコピー
</button>
<button
  type="button"
  className="primary-button"
  onClick={() => void onBundle()}
  disabled={bundling}
>
  {bundling ? "動画をつくっています…" : "動画にして送る"}
</button>
{bundleSaved ? <p className="feedback-copy">LINEのトークに、この動画を送ってください</p> : null}
{bundleFailed ? <p className="form-error">動画にできませんでした。リンクを送ってください</p> : null}
```

`onBundle`:

```ts
async function onBundle() {
  if (!letter || bundling) return;
  setBundling(true);
  setBundleFailed(false);
  setBundleSaved(false);
  try {
    const file = await buildKeepVideo(letter);
    const result = await shareOrSaveVideo(file, {
      canShare: (data) =>
        typeof navigator.canShare === "function" && navigator.canShare(data),
      share: (data) => navigator.share(data),
      save: downloadFile,
    });
    if (result === "saved") setBundleSaved(true);
  } catch {
    setBundleFailed(true);
  } finally {
    setBundling(false);
  }
}
```

ボタンは min-height 44px（既存 `.primary-button` / `.secondary-button`）。

`README.md` の「実装計画：正本Spec承認後に作成」を `docs/superpowers/plans/2026-09-10-magocoro-letter-bundle.md` に差し、状態欄の「実装計画は未作成」を消す。

`AGENTS.md` の設計書（読む順）2行目を次にする。

```text
2. `docs/superpowers/plans/2026-09-10-magocoro-letter-bundle.md`（本仕様の実装計画。写真のみの旧計画は使わない）
```

- [ ] **Step 4: Run tests and the production build**

Run:

```bash
npx vitest run tests/media/shareBundle.test.ts tests/letter/LetterPage.test.tsx
npm test
npm run build
npm run lint
```

Expected: すべて PASS。`package.json` の dependencies / devDependencies に `ffmpeg` も `@cloudflare/stream` も LINE SDK も無い。

- [ ] **Step 5: Commit**

```bash
git add src/media/shareBundle.ts tests/media/shareBundle.test.ts src/letter/buildKeepVideo.ts src/letter/LetterPage.tsx tests/letter/LetterPage.test.tsx README.md AGENTS.md
git commit -m "$(cat <<'EOF'
feat: share a device-made keep-video or fall back to the URL

Give parents a LINE-ready file from the letter page without uploading
the concatenated video, and keep link copy working when recording fails.
EOF
)"
```

---

## 受け入れ（人が確認。実装計画の自動テスト外）

Spec §10 の人手確認。デプロイはしない。

- 写真3枚＋短い文＋声で便箋が作れる
- 30秒以内の動画＋短い文でも作れる。写真と同時には作れない
- 別ブラウザで同じURLが開き、中身が一致する
- まとめ動画を再生すると声が聞こえる
- リンクをLINEに手動で貼って開ける
- `expiresAt` を過去にしたデータは閉じた表示になる
- 必須欠けでは作れない
- `npm test` と `npm run build` が通る
