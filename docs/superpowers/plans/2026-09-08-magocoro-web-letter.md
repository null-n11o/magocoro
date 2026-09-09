# Magocoro Web手紙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 親が写真と孫口調の本文で便箋を作り、リンクを別端末で開き、スタンプで返事できるWeb手紙の1ループを実装する。

**Architecture:** Vite + React の画面は `LetterApi` だけを呼ぶ。Worker が `/api/*` を処理し、手紙JSONと写真を R2 に置く。`/api/*` 以外は SPA にフォールバックする。

**Tech Stack:** Vite + React + TypeScript + Tailwind v4 + React Router + Vitest + Testing Library + `@cloudflare/vite-plugin` + `@cloudflare/vitest-plugin` + Wrangler + R2。

**Spec:** `docs/superpowers/specs/2026-09-08-magocoro-web-letter-design.md` — 実行者はSpecと本計画の両方を読むこと。

## Global Constraints

- 日本語のみ。文書言語 `lang="ja"`。
- 地 `#f7f2e9`、面 `#fffdf8`、本文 `#33302a`、補助 `#8a7f72`、罫線 `#ddd2c2`、強調（朱） `#c4543a`。切手風フレームは白縁＋波線。
- 紫・ネオン・金グラデ・飾り絵文字は禁止。本文中の絵文字は親が書いた場合のみ素通し。
- 見出しと本文は Noto Sans JP。動き150–400ms。`prefers-reduced-motion` で無効化。
- タップ面44px以上。スタンプは `aria-label`＋`aria-pressed`。
- ページ全体の横スクロール禁止。最大幅モバイルカラム（`max-w-lg`）中央寄せ。
- 秘密値はリポジトリに入れない。外部LLM・決済・LINEにはつながない（自前WorkerとフォントCDNのみ）。
- 写真は JPEG / PNG / WebP、1〜3枚、1枚10MBまで。IDは `l_` + 32桁hex。

---

## File Structure

```text
02_dev/magocoro/
  package.json
  index.html
  vite.config.ts
  vitest.config.ts                 # UI（jsdom）
  vitest.worker.config.ts          # Worker（workerd） Task 2 で追加
  wrangler.jsonc
  tsconfig.json
  tsconfig.app.json
  worker-env.d.ts
  src/
    main.tsx
    routes.tsx
    index.css
    api/
      types.ts                     # LetterPublic / StampKind / LetterApi
      letters.ts                   # createLetterApi()
    compose/
      ComposePage.tsx
    letter/
      LetterPage.tsx
  worker/
    index.ts                       # /api ルーター
    store.ts                       # R2 読み書き・バリデーション
  tests/
    setup.ts
    smoke.test.tsx
    compose/ComposePage.test.tsx
    letter/LetterPage.test.tsx
    worker/letters.test.ts
    worker/tsconfig.json
```

---

### Task 1: 足場（Vite + React + Tailwind + Router + Cloudflare plugin）

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `wrangler.jsonc`, `worker-env.d.ts`, `src/main.tsx`, `src/routes.tsx`, `src/index.css`, `src/compose/ComposePage.tsx`, `src/letter/LetterPage.tsx`, `worker/index.ts`, `tests/setup.ts`, `tests/smoke.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: なし
- Produces: `npm run dev` / `npm test` / `npm run build` が通る。`ComposePage` と `LetterPage` は見出しだけの仮実装。`worker/index.ts` は `/api/*` に `404` を返す。後続は同じファイルを置き換える。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/smoke.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../src/routes";

describe("scaffold", () => {
  it("shows Magocoro on /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Magocoro" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/smoke.test.tsx`
Expected: FAIL（vitest未導入、またはモジュールが無い）

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "magocoro",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit -p tsconfig.app.json && vite build",
    "test": "vitest run --config vitest.config.ts",
    "lint": "npx oxlint@latest src worker tests"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.8.0"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.13.0",
    "@tailwindcss/vite": "^4.1.0",
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^5.0.0",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0",
    "vite": "^7.1.0",
    "vitest": "^4.1.0",
    "wrangler": "^4.34.0"
  }
}
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "worker", "worker-env.d.ts"]
}
```

`vite.config.ts`:

```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
});
```

`vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/worker/**"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`wrangler.jsonc`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "magocoro",
  "compatibility_date": "2026-09-08",
  "main": "./worker/index.ts",
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "r2_buckets": [
    {
      "binding": "LETTERS",
      "bucket_name": "magocoro-letters"
    }
  ]
}
```

`worker-env.d.ts`:

```ts
interface Env {
  LETTERS: R2Bucket;
}
```

`worker/index.ts`:

```ts
export default {
  async fetch(): Promise<Response> {
    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

`index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Magocoro</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-page: #f7f2e9;
  --color-surface: #fffdf8;
  --color-ink: #33302a;
  --color-muted: #8a7f72;
  --color-line: #ddd2c2;
  --color-accent: #c4543a;
  --font-sans: "Noto Sans JP", sans-serif;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--color-page);
  color: var(--color-ink);
  font-family: var(--font-sans);
  overflow-x: hidden;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

`src/compose/ComposePage.tsx`:

```tsx
export function ComposePage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-medium">Magocoro</h1>
    </main>
  );
}
```

`src/letter/LetterPage.tsx`:

```tsx
export function LetterPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <p>手紙</p>
    </main>
  );
}
```

`src/routes.tsx`:

```tsx
import { Route, Routes } from "react-router-dom";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./letter/LetterPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComposePage />} />
      <Route path="/letter/:id" element={<LetterPage />} />
    </Routes>
  );
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </StrictMode>,
);
```

`.gitignore` に追加:

```
.wrangler
.dev.vars*
```

Then: `npm install`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS（smoke）

Run: `npm run build`
Expected: PASS（型チェック＋vite build）

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json index.html vite.config.ts vitest.config.ts tsconfig.json tsconfig.app.json wrangler.jsonc worker-env.d.ts worker/index.ts src tests .gitignore
git commit -m "feat: ViteとCloudflareの足場を置く"
```

---

### Task 2: Worker 手紙API（R2）

**Files:**
- Create: `worker/store.ts`, `tests/worker/letters.test.ts`, `tests/worker/tsconfig.json`, `vitest.worker.config.ts`
- Modify: `worker/index.ts`, `package.json`（`test` スクリプトと `@cloudflare/vitest-plugin`）

**Interfaces:**
- Consumes: `Env.LETTERS: R2Bucket`
- Produces:
  - `createLetter(env, form: FormData): Promise<{ ok: true; id: string } | { ok: false; status: 400 | 503 }>`
  - `getLetter(env, id: string): Promise<LetterRecord | null>`
  - `getPhoto(env, id: string, n: number): Promise<{ bytes: ArrayBuffer; contentType: string } | null>`
  - `addStamp(env, id: string, kind: string): Promise<{ stamps: { read: number; cute: number } } | "not_found" | "bad_kind">`
  - Worker `fetch`:
    - `POST /api/letters` → `201 { id }` / `400` / `503`
    - `GET /api/letters/:id` → `200 LetterPublic` / `404 { error: "not_found" }`
    - `GET /api/letters/:id/photos/:n` → 画像バイト / `404`
    - `POST /api/letters/:id/stamps` → `200 { stamps }` / `400` / `404`
  - `LetterRecord`（R2 JSON）: `{ id, createdAt, addressTo, body, signature, photos: { contentType: string }[], stamps: { read: number; cute: number } }`
  - 公開JSONの `photoUrls` は `/api/letters/{id}/photos/{n}`
  - ID: `l_` + 32桁hex。宛名が空なら `"じいじ、ばあばへ"`。本文1〜1000、署名1〜20。写真1〜3、`image/jpeg|png|webp`、各 10 * 1024 * 1024 バイトまで。R2キー `letters/{id}.json` と `letters/{id}/photo-{n}`。

- [ ] **Step 1: Write the failing test**

`tests/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.app.json",
  "compilerOptions": {
    "types": ["@cloudflare/vitest-plugin/types"]
  },
  "include": ["./**/*.ts", "../../worker-env.d.ts"]
}
```

`tests/worker/letters.test.ts`:

```ts
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function photo(type: string, size: number, name: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

async function createValid(): Promise<string> {
  const form = new FormData();
  form.set("addressTo", "じいじ、ばあばへ");
  form.set("body", "きょうね、たてたよ");
  form.set("signature", "はると");
  form.append("photos", photo("image/jpeg", 32, "a.jpg"));
  const res = await exports.default.fetch(
    new Request("http://example.com/api/letters", { method: "POST", body: form }),
  );
  expect(res.status).toBe(201);
  const json = (await res.json()) as { id: string };
  expect(json.id).toMatch(/^l_[0-9a-f]{32}$/);
  return json.id;
}

describe("letters api", () => {
  it("creates, fetches, and increments stamps", async () => {
    const id = await createValid();
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    expect(got.status).toBe(200);
    const letter = (await got.json()) as {
      addressTo: string;
      body: string;
      signature: string;
      photoUrls: string[];
      stamps: { read: number; cute: number };
    };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
    expect(letter.body).toBe("きょうね、たてたよ");
    expect(letter.signature).toBe("はると");
    expect(letter.photoUrls).toEqual([`/api/letters/${id}/photos/0`]);
    expect(letter.stamps).toEqual({ read: 0, cute: 0 });

    const img = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}/photos/0`),
    );
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");

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

  it("uses default addressTo when empty", async () => {
    const form = new FormData();
    form.set("addressTo", "  ");
    form.set("body", "げんき？");
    form.set("signature", "はると");
    form.append("photos", photo("image/png", 16, "a.png"));
    const res = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: form }),
    );
    const { id } = (await res.json()) as { id: string };
    const got = await exports.default.fetch(
      new Request(`http://example.com/api/letters/${id}`),
    );
    const letter = (await got.json()) as { addressTo: string };
    expect(letter.addressTo).toBe("じいじ、ばあばへ");
  });

  it("rejects missing body and oversized photo", async () => {
    const empty = new FormData();
    empty.set("addressTo", "じいじ、ばあばへ");
    empty.set("body", "");
    empty.set("signature", "はると");
    empty.append("photos", photo("image/jpeg", 8, "a.jpg"));
    const emptyRes = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: empty }),
    );
    expect(emptyRes.status).toBe(400);

    const big = new FormData();
    big.set("addressTo", "じいじ、ばあばへ");
    big.set("body", "きょうね");
    big.set("signature", "はると");
    big.append("photos", photo("image/jpeg", 10 * 1024 * 1024 + 1, "a.jpg"));
    const bigRes = await exports.default.fetch(
      new Request("http://example.com/api/letters", { method: "POST", body: big }),
    );
    expect(bigRes.status).toBe(400);
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
  });

  it("rejects unknown stamp kind and missing letter stamps", async () => {
    const id = await createValid();
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
});
```

- [ ] **Step 2: Run test to verify it fails**

`package.json` の `devDependencies` に `"@cloudflare/vitest-plugin": "^0.1.0"` を足して `npm install`。バージョンは `npm view @cloudflare/vitest-plugin version` で確認し、Vitest 4.1 系と合う最新を入れる。

`vitest.worker.config.ts`:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
  },
});
```

`package.json` の `test` を次に変える:

```json
"test": "vitest run --config vitest.config.ts && vitest run --config vitest.worker.config.ts"
```

Run: `npx vitest run --config vitest.worker.config.ts`
Expected: FAIL（`createLetter` 未実装、`POST /api/letters` が常に404）

- [ ] **Step 3: Write minimal implementation**

`worker/store.ts`:

```ts
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
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
```

`worker/index.ts`:

```ts
import { addStamp, createLetter, getLetter, getPhoto, toPublic } from "./store";

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "api" || parts[1] !== "letters") {
      return notFound();
    }

    if (request.method === "POST" && parts.length === 2) {
      const form = await request.formData();
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
      const record = await getLetter(env, id);
      if (!record) return notFound();
      return Response.json(toPublic(record));
    }

    if (request.method === "GET" && parts[3] === "photos" && parts.length === 5) {
      const n = Number(parts[4]);
      if (!Number.isInteger(n)) return notFound();
      const photo = await getPhoto(env, id, n);
      if (!photo) return notFound();
      return new Response(photo.bytes, {
        headers: { "content-type": photo.contentType },
      });
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
      return Response.json({ stamps: result.stamps });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.worker.config.ts`
Expected: PASS

Run: `npm test`
Expected: PASS（UI smoke + Worker）

- [ ] **Step 5: Commit**

```bash
git add worker package.json package-lock.json vitest.worker.config.ts tests/worker
git commit -m "feat: 手紙の保存とスタンプをR2に載せる"
```

---

### Task 3: LetterApi と作る画面

**Files:**
- Create: `src/api/types.ts`, `src/api/letters.ts`, `tests/compose/ComposePage.test.tsx`
- Modify: `src/compose/ComposePage.tsx`, `src/routes.tsx`

**Interfaces:**
- Consumes: Worker の `POST /api/letters`（Task 2）
- Produces:
  - `StampKind = "read" | "cute"`
  - `Stamps = { read: number; cute: number }`
  - `LetterPublic = { id: string; createdAt: string; addressTo: string; body: string; signature: string; photoUrls: string[]; stamps: Stamps }`
  - `CreateLetterInput = { photos: File[]; addressTo: string; body: string; signature: string }`
  - `LetterApi = { createLetter(input: CreateLetterInput): Promise<{ id: string }>; getLetter(id: string): Promise<LetterPublic | null>; addStamp(id: string, kind: StampKind): Promise<Stamps | null> }`
  - `createLetterApi(fetchImpl?: typeof fetch): LetterApi`
  - `ComposePage({ api: LetterApi })` — 成功時 `navigate(/letter/:id)`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/compose/ComposePage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi } from "../../src/api/types";
import { ComposePage } from "../../src/compose/ComposePage";

function jpeg(): File {
  return new File([new Uint8Array(8)], "a.jpg", { type: "image/jpeg" });
}

function renderCompose(api: LetterApi) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ComposePage api={api} />} />
        <Route path="/letter/:id" element={<p>手紙ページ</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ComposePage", () => {
  it("keeps submit disabled without photo, body, or signature", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    const button = screen.getByRole("button", { name: "お手紙をつくる" });
    expect(button).toBeDisabled();
    expect(screen.getByText("孫の口調で書いてください")).toBeInTheDocument();
  });

  it("navigates after a successful create", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockResolvedValue({ id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    const fileInput = screen.getByLabelText("写真");
    await user.upload(fileInput, jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(api.createLetter).toHaveBeenCalled();
    expect(await screen.findByText("手紙ページ")).toBeInTheDocument();
  });

  it("keeps input and shows error when save fails", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn().mockRejectedValue(new Error("nope")),
      getLetter: vi.fn(),
      addStamp: vi.fn(),
    };
    renderCompose(api);
    await user.upload(screen.getByLabelText("写真"), jpeg());
    await user.type(screen.getByLabelText("本文"), "きょうね、たてたよ");
    await user.type(screen.getByLabelText("署名"), "はると");
    await user.click(screen.getByRole("button", { name: "お手紙をつくる" }));
    expect(await screen.findByText("いま保存できません")).toBeInTheDocument();
    expect(screen.getByLabelText("本文")).toHaveValue("きょうね、たてたよ");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts tests/compose/ComposePage.test.tsx`
Expected: FAIL（ボタン・ラベルが無い）

- [ ] **Step 3: Write minimal implementation**

`src/api/types.ts`:

```ts
export type StampKind = "read" | "cute";

export type Stamps = {
  read: number;
  cute: number;
};

export type LetterPublic = {
  id: string;
  createdAt: string;
  addressTo: string;
  body: string;
  signature: string;
  photoUrls: string[];
  stamps: Stamps;
};

export type CreateLetterInput = {
  photos: File[];
  addressTo: string;
  body: string;
  signature: string;
};

export type LetterApi = {
  createLetter(input: CreateLetterInput): Promise<{ id: string }>;
  getLetter(id: string): Promise<LetterPublic | null>;
  addStamp(id: string, kind: StampKind): Promise<Stamps | null>;
};
```

`src/api/letters.ts`:

```ts
import type { CreateLetterInput, LetterApi, LetterPublic, StampKind, Stamps } from "./types";

export function createLetterApi(fetchImpl: typeof fetch = fetch): LetterApi {
  return {
    async createLetter(input: CreateLetterInput): Promise<{ id: string }> {
      const form = new FormData();
      form.set("addressTo", input.addressTo);
      form.set("body", input.body);
      form.set("signature", input.signature);
      for (const photo of input.photos) form.append("photos", photo);
      const res = await fetchImpl("/api/letters", { method: "POST", body: form });
      if (!res.ok) throw new Error("create_failed");
      return (await res.json()) as { id: string };
    },
    async getLetter(id: string): Promise<LetterPublic | null> {
      const res = await fetchImpl(`/api/letters/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("get_failed");
      return (await res.json()) as LetterPublic;
    },
    async addStamp(id: string, kind: StampKind): Promise<Stamps | null> {
      const res = await fetchImpl(`/api/letters/${id}/stamps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("stamp_failed");
      const json = (await res.json()) as { stamps: Stamps };
      return json.stamps;
    },
  };
}
```

`src/compose/ComposePage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LetterApi } from "../api/types";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX = 10 * 1024 * 1024;

export function ComposePage({ api }: { api: LetterApi }) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<File[]>([]);
  const [addressTo, setAddressTo] = useState("じいじ、ばあばへ");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reason = useMemo(() => {
    if (photos.length < 1) return "写真を1枚以上えらんでください";
    if (body.trim() === "") return "本文を書いてください";
    if (signature.trim() === "") return "なまえを書いてください";
    if (body.length > 1000) return "本文は1000字以内にしてください";
    if (signature.length > 20) return "なまえは20字以内にしてください";
    return "";
  }, [photos, body, signature]);

  function onPhotos(files: FileList | null) {
    if (!files) return;
    setPhotoError("");
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (!ALLOWED.has(file.type)) {
        setPhotoError("この写真は使えません");
        continue;
      }
      if (file.size > MAX) {
        setPhotoError("写真が大きすぎます");
        continue;
      }
      if (next.length >= 3) break;
      next.push(file);
    }
    setPhotos(next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason || submitting) return;
    setSubmitting(true);
    setSaveError("");
    try {
      const { id } = await api.createLetter({ photos, addressTo, body, signature });
      navigate(`/letter/${id}`);
    } catch {
      setSaveError("いま保存できません");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-medium">Magocoro</h1>
      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-4"
      >
        <div>
          <label htmlFor="photos" className="block text-sm text-muted">
            写真
          </label>
          <input
            id="photos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => onPhotos(e.target.files)}
            className="mt-1 min-h-11 w-full"
          />
          {photoError ? <p className="mt-1 text-sm text-accent">{photoError}</p> : null}
          <div className="mt-2 flex gap-2">
            {photos.map((file, i) => (
              <img
                key={`${file.name}-${i}`}
                src={URL.createObjectURL(file)}
                alt=""
                className="h-20 w-20 object-cover"
              />
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="addressTo" className="block text-sm text-muted">
            宛名
          </label>
          <input
            id="addressTo"
            value={addressTo}
            onChange={(e) => setAddressTo(e.target.value)}
            className="mt-1 min-h-11 w-full border border-line bg-page px-3"
          />
        </div>
        <div>
          <label htmlFor="body" className="block text-sm text-muted">
            本文
          </label>
          <p className="mt-1 text-sm text-muted">孫の口調で書いてください</p>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="じいじ、ばあば、げんき？ きょうね、…"
            rows={6}
            className="mt-1 min-h-11 w-full border border-line bg-page px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="signature" className="block text-sm text-muted">
            署名
          </label>
          <input
            id="signature"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="はると"
            className="mt-1 min-h-11 w-full border border-line bg-page px-3"
          />
        </div>
        {reason ? <p className="text-sm text-muted">{reason}</p> : null}
        {saveError ? <p className="text-sm text-accent">{saveError}</p> : null}
        <button
          type="submit"
          disabled={Boolean(reason) || submitting}
          className="min-h-11 w-full bg-accent px-4 text-surface transition duration-200 disabled:opacity-50"
        >
          お手紙をつくる
        </button>
      </form>
    </main>
  );
}
```

`src/routes.tsx`:

```tsx
import { Route, Routes } from "react-router-dom";
import { createLetterApi } from "./api/letters";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./letter/LetterPage";

const api = createLetterApi();

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ComposePage api={api} />} />
      <Route path="/letter/:id" element={<LetterPage />} />
    </Routes>
  );
}
```

Task 3 の時点では `LetterPage` はまだ `api` を受け取らない（Task 1 の仮実装のまま）。smoke の見出し「Magocoro」は ComposePage に残るので `tests/smoke.test.tsx` は通る。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts tests/compose/ComposePage.test.tsx tests/smoke.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api src/compose/ComposePage.tsx src/routes.tsx tests/compose
git commit -m "feat: 手紙を書く画面を足す"
```

---

### Task 4: 手紙画面（便箋・コピー・スタンプ・未知ID）

**Files:**
- Create: `tests/letter/LetterPage.test.tsx`
- Modify: `src/letter/LetterPage.tsx`, `src/routes.tsx`, `src/index.css`（切手フレーム）

**Interfaces:**
- Consumes: `LetterApi.getLetter` / `addStamp`（Task 3）、`LetterPublic`（Task 3）
- Produces: `LetterPage({ api: LetterApi })`。`useParams().id` で取得。日付は `YYYY年M月D日`（ゼロ埋めしない）。未知IDは「お手紙が見つからない」＋ `/` への「お手紙をつくる」。スタンプは押すたびに `addStamp`、回数表示、この表示中1回以上で `aria-pressed="true"`。リンクコピーは `navigator.clipboard.writeText(window.location.href)` 成功で「コピーしました」。注記「このリンクをLINEに貼ると、相手のスマホでも開けます」。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/letter/LetterPage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { LetterApi, LetterPublic } from "../../src/api/types";
import { LetterPage } from "../../src/letter/LetterPage";

const letter: LetterPublic = {
  id: "l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-08T12:00:00.000Z",
  addressTo: "じいじ、ばあばへ",
  body: "きょうね、たてたよ",
  signature: "はると",
  photoUrls: ["/api/letters/l_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/photos/0"],
  stamps: { read: 0, cute: 2 },
};

function renderLetter(api: LetterApi, id = letter.id) {
  return render(
    <MemoryRouter initialEntries={[`/letter/${id}`]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterPage api={api} />} />
        <Route path="/" element={<p>作る画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LetterPage", () => {
  it("renders letter content and increments stamps", async () => {
    const user = userEvent.setup();
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn().mockResolvedValue({ read: 1, cute: 2 }),
    };
    renderLetter(api);
    expect(await screen.findByText("じいじ、ばあばへ")).toBeInTheDocument();
    expect(screen.getByText("きょうね、たてたよ")).toBeInTheDocument();
    expect(screen.getByText("はると")).toBeInTheDocument();
    expect(screen.getByText(/2026年9月8日/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "手紙の写真 1" })).toHaveAttribute(
      "src",
      letter.photoUrls[0],
    );
    expect(
      screen.getByText("このリンクをLINEに貼ると、相手のスマホでも開けます"),
    ).toBeInTheDocument();
    const read = screen.getByRole("button", { name: "読んだよ" });
    expect(read).toHaveAttribute("aria-pressed", "false");
    await user.click(read);
    expect(api.addStamp).toHaveBeenCalledWith(letter.id, "read");
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(read).toHaveAttribute("aria-pressed", "true");
  });

  it("shows not found for unknown id", async () => {
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(null),
      addStamp: vi.fn(),
    };
    renderLetter(api, "l_dddddddddddddddddddddddddddddddd");
    expect(await screen.findByText("お手紙が見つからない")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お手紙をつくる" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("copies the current url", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const api: LetterApi = {
      createLetter: vi.fn(),
      getLetter: vi.fn().mockResolvedValue(letter),
      addStamp: vi.fn(),
    };
    renderLetter(api);
    await screen.findByText("じいじ、ばあばへ");
    await user.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText("コピーしました")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.config.ts tests/letter/LetterPage.test.tsx`
Expected: FAIL（便箋・スタンプが無い）

- [ ] **Step 3: Write minimal implementation**

`src/letter/LetterPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { LetterApi, LetterPublic, StampKind } from "../api/types";

function postmark(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

export function LetterPage({ api }: { api: LetterApi }) {
  const { id = "" } = useParams();
  const [letter, setLetter] = useState<LetterPublic | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [pressed, setPressed] = useState({ read: false, cute: false });

  useEffect(() => {
    let cancelled = false;
    api.getLetter(id).then((value) => {
      if (!cancelled) setLetter(value);
    });
    return () => {
      cancelled = true;
    };
  }, [api, id]);

  async function onStamp(kind: StampKind) {
    if (!letter) return;
    const stamps = await api.addStamp(letter.id, kind);
    if (!stamps) return;
    setLetter({ ...letter, stamps });
    setPressed((prev) => ({ ...prev, [kind]: true }));
  }

  async function onCopy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  if (letter === undefined) {
    return <main className="mx-auto max-w-lg px-4 py-8" />;
  }

  if (letter === null) {
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <p>お手紙が見つからない</p>
        <Link to="/" className="mt-4 inline-flex min-h-11 items-center text-accent">
          お手紙をつくる
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <article className="rounded-lg border border-line bg-surface p-5">
        <p className="text-right text-sm text-muted">{postmark(letter.createdAt)}</p>
        <p className="mt-2">{letter.addressTo}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {letter.photoUrls.map((src, n) => (
            <img
              key={src}
              src={src}
              alt={`手紙の写真 ${n + 1}`}
              className="stamp-frame h-28 w-28 object-cover"
            />
          ))}
        </div>
        <p className="mt-4 whitespace-pre-wrap">{letter.body}</p>
        <p className="mt-6 text-right">{letter.signature}</p>
      </article>
      <p className="mt-4 text-sm text-muted">
        このリンクをLINEに貼ると、相手のスマホでも開けます
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="mt-3 min-h-11 w-full border border-line bg-surface transition duration-200"
      >
        リンクをコピー
      </button>
      {copied ? <p className="mt-2 text-sm text-muted">コピーしました</p> : null}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          aria-label="読んだよ"
          aria-pressed={pressed.read}
          onClick={() => onStamp("read")}
          className="flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 border border-line bg-surface transition duration-200"
        >
          読んだよ <span>{letter.stamps.read}</span>
        </button>
        <button
          type="button"
          aria-label="かわいい！"
          aria-pressed={pressed.cute}
          onClick={() => onStamp("cute")}
          className="flex min-h-11 min-w-11 flex-1 items-center justify-center gap-2 border border-line bg-surface transition duration-200"
        >
          かわいい！ <span>{letter.stamps.cute}</span>
        </button>
      </div>
    </main>
  );
}
```

注意: スタンプ回数のテストは `findByText("1")` で read 側の更新を見る。初期 cute は 2 なので、ボタン内の数字は `letter.stamps.read` / `letter.stamps.cute` をそのまま出す。

`src/routes.tsx` の `LetterPage` にも同じ `api` を渡す:

```tsx
<Route path="/letter/:id" element={<LetterPage api={api} />} />
```

`src/index.css` に追加:

```css
.stamp-frame {
  background: #fff;
  padding: 8px;
  box-shadow:
    0 0 0 3px #fff,
    0 0 0 5px #ddd2c2;
  border-radius: 2px;
}
```

未知IDの画面も `mx-auto max-w-lg`。例外画面（スタックトレース）は出さない。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config vitest.config.ts tests/letter/LetterPage.test.tsx tests/compose/ComposePage.test.tsx tests/smoke.test.tsx`
Expected: PASS

Run: `npm test`
Expected: PASS（UI + Worker）

Run: `npm run build`
Expected: PASS

Run: `npm run lint`
Expected: 重大な指摘なし

- [ ] **Step 5: Commit**

```bash
git add src/letter/LetterPage.tsx src/routes.tsx src/index.css tests/letter
git commit -m "feat: 便箋とスタンプの手紙画面を足す"
```

---

## Self-review（仕様対応）

| Spec | Task |
|---|---|
| 作る→保存→手紙→コピー→別端末→スタンプ | 2（保存）+ 3（作る）+ 4（手紙・コピー・スタンプ）。別端末は同一オリジンのR2で満たす |
| 日本語 / lang=ja | 1（index.html） |
| 写真1〜3、宛名、本文、署名 | 2 + 3 |
| 本文は親が書く。孫口調の案内 | 3 |
| 推測しにくいID、ログインなし | 2（`l_`+32hex） |
| LINEは手動ペースト | 4（コピー＋注記） |
| Pages + Worker + R2、画面は LetterApi のみ | 1 + 2 + 3 |
| API 4本とステータス | 2 |
| エラー表示・入力保持・未知ID | 2 + 3 + 4 |
| デザイン制約 | 1（トークン）+ 3/4（レイアウト・切手・44px・aria） |
| 自動テスト（Worker / 作る / 手紙） | 2, 3, 4 |
| 非スコープ（LINE公式・LLM・ハガキ・一覧・削除・身長体重） | どのタスクにも入れない |

プレースホルダ（TBD / 「適切に」 / 「Task Nと同様」）なし。型名は Task 2 の R2 `LetterRecord` と Task 3 の `LetterPublic` で役割を分け、画面は `LetterPublic` だけを使う。
