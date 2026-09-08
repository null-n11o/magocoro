# Magocoro MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web手紙の作成→プレビュー→共有→スタンプ反応の1ループが動く静的SPAを実装する。

**Architecture:** 入力フォーム→LetterInput→LetterGenerator（テンプレート式）→Letter→LetterStore抽象（localStorage）→プレビュー・共有・スタンプの2画面。

**Tech Stack:** Vite + React + TypeScript + Tailwind + Vitest (+ Testing Library, jsdom, react-router-dom)。サーバDBなし。

**Spec:** `docs/superpowers/specs/2026-09-08-magocoro-mvp-design.md` — 実行者はSpecと本計画の両方を読むこと。

## Global Constraints

- 日本語のみ。文書言語 `lang="ja"`。
- 地 `#f7f2e9`、面 `#fffdf8`、本文 `#33302a`、補助 `#8a7f72`、罫線 `#ddd2c2`、強調（朱） `#c4543a`。切手風フレームは白縁＋波線表現。
- 紫・ネオン・金グラデ・絵文字の装飾利用は禁止。本文中の絵文字はユーザーがメモに入れた場合のみ素通しする。
- 見出しと本文は Noto Sans JP。動き150–400ms（`prefers-reduced-motion` で無効化）。
- タップ面44px以上。スタンプボタンは `aria-label` と `aria-pressed` を持つ。
- ページ全体の横スクロール禁止。最大幅モバイルカラム（`max-w-lg`）中央寄せ。
- 秘密値・外部キーは持たない。外部通信は発生させない（フォントCDNを除く）。
- 写真合計2MB上限。localStorageのみ永続化（キー `magocoro.letters.v1`）。

---

## File Structure

```text
02_dev/magocoro/
  index.html                      # lang="ja"、タイトルMagocoro、Noto Sans JPリンク
  package.json                    # dev/test/lint/buildスクリプト
  src/
    main.tsx                      # BrowserRouterを起動
    routes.tsx                    # / と /letter/:id のRoutes木
    letter/
      types.ts                    # LetterInput / Letter / StampKind の型
      generator.ts                # LetterGenerator抽象＋TemplateLetterGenerator
    store/
      storage.ts                  # LetterStore抽象＋localStorage実装
    compose/
      ComposePage.tsx             # 作る画面
    preview/
      LetterPage.tsx              # プレビュー・共有・スタンプ画面
  tests/
    letter/generator.test.ts
    store/storage.test.ts
    compose/ComposePage.test.tsx
    preview/LetterPage.test.tsx
```

---

### Task 1: 足場（Vite+React+TS+Tailwind+Vitest+Router）

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/routes.tsx`, `src/index.css`, `tests/smoke.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `npm run dev` / `npm test` / `npm run build` が通る足場。後続タスクは `src/` 配下にファイルを追加する。

- [ ] **Step 1: Write the failing test**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("boots", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/smoke.test.ts`
Expected: FAIL（vitest未導入・設定なしのためコマンド失敗）

- [ ] **Step 3: Write minimal implementation**

`package.json`（実行に必要な最小セット。バージョンは固定せず `npm install` 時に解決する）:

```json
{
  "name": "magocoro",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "lint": "npx oxlint@latest src tests"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.0",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom";
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Routes } from "./routes";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`src/routes.tsx`（仮2画面。実画面はTask 4・5で置き換える）:

```tsx
export function Routes() {
  return <div className="mx-auto max-w-lg">Magocoro</div>;
}
```

`index.html` は `lang="ja"`、タイトル「Magocoro」、Noto Sans JPのlink、`#root` を持つこと。`src/index.css` は `@tailwind base; @tailwind components; @tailwind utilities;` の3行。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npm test`
Expected: PASS（smoke含む全テスト緑）

- [ ] **Step 5: Commit**

```bash
git add package.json index.html vite.config.ts vitest.config.ts tsconfig.json src tests
git commit -m "feat: Task 1 足場（Vite+React+TS+Tailwind+Vitest+Router）"
```

---

### Task 2: 文面生成（型＋TemplateLetterGenerator）

**Files:**
- Create: `src/letter/types.ts`, `src/letter/generator.ts`
- Test: `tests/letter/generator.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `LetterInput` / `Letter` / `StampKind` 型、`LetterGenerator` 抽象（`generate(input: LetterInput): Letter`）、`TemplateLetterGenerator`（テンプレート式実装）。Task 4が `generate` を呼ぶ。

- [ ] **Step 1: Write the failing test**

```ts
// tests/letter/generator.test.ts
import { describe, expect, it } from "vitest";
import { TemplateLetterGenerator } from "../../src/letter/generator";

describe("TemplateLetterGenerator", () => {
  it("メモ1件を孫口調の1文に変換する", () => {
    const gen = new TemplateLetterGenerator();
    const letter = gen.generate({
      photos: ["data:image/png;base64,xxx"],
      memos: ["つかまり立ちした"],
      addressTo: "じいじ、ばあばへ",
      firstPerson: "ぼく",
    });
    expect(letter.body).toContain("じいじ、ばあばへ。");
    expect(letter.body).toContain("つかまり立ちしたよ");
  });

  it("身長体重がある場合のみ末尾に印字文を付ける", () => {
    const gen = new TemplateLetterGenerator();
    const withSize = gen.generate({
      photos: ["data:image/png;base64,xxx"],
      memos: ["にんじん食べた"],
      addressTo: "じいじ、ばあばへ",
      firstPerson: "わたし",
      heightCm: 70,
      weightKg: 8,
    });
    expect(withSize.body).toContain("いま 70cm 8kg だよ");
  });

  it("写真0枚ではエラーを投げる", () => {
    const gen = new TemplateLetterGenerator();
    expect(() =>
      gen.generate({ photos: [], memos: ["歩いた"], addressTo: "じいじ、ばあばへ", firstPerson: "ぼく" }),
    ).toThrow("写真は1枚以上必要です");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/letter/generator.test.ts`
Expected: FAIL with "Cannot find module '../../src/letter/generator'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/letter/types.ts
export type StampKind = "read" | "cute";

export interface LetterInput {
  photos: string[];
  memos: string[];
  addressTo: string;
  firstPerson: "ぼく" | "わたし";
  heightCm?: number;
  weightKg?: number;
}

export interface Letter {
  id: string;
  createdAt: string;
  input: LetterInput;
  body: string;
  stamps: Record<StampKind, number>;
}
```

```ts
// src/letter/generator.ts
import type { Letter, LetterInput } from "./types";

export interface LetterGenerator {
  generate(input: LetterInput): Letter;
}

function toChildSentence(memo: string): string {
  const t = memo.trim();
  if (/たべ|ごはん|にんじん|ミルク/.test(t)) return `${t}をおいしくたべたよ！`;
  if (/たっ|立|歩|ある/.test(t)) return `じぶんの足で${t}んだよ！`;
  return `${t}んだよ！`;
}

export class TemplateLetterGenerator implements LetterGenerator {
  generate(input: LetterInput): Letter {
    if (input.photos.length === 0) throw new Error("写真は1枚以上必要です");
    const sentences = input.memos.map(toChildSentence).join("");
    const size =
      input.heightCm != null || input.weightKg != null
        ? `いま ${input.heightCm ?? "?"}cm ${input.weightKg ?? "?"}kg だよ`
        : "";
    const body = `${input.addressTo}。${sentences}${size}`;
    return {
      id: `l_${Math.random().toString(36).slice(2, 14)}`,
      createdAt: new Date().toISOString(),
      input,
      body,
      stamps: { read: 0, cute: 0 },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/letter/generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/letter tests/letter
git commit -m "feat: Task 2 文面生成（型＋TemplateLetterGenerator）"
```

---

### Task 3: 保存（LetterStore＋localStorage）

**Files:**
- Create: `src/store/storage.ts`
- Test: `tests/store/storage.test.ts`

**Interfaces:**
- Consumes: Task 2の `Letter` / `StampKind` 型
- Produces: `LetterStore` 抽象（`saveLetter(letter)` / `getLetter(id)` / `addStamp(id, kind)`）、`LocalStorageLetterStore`（キー `magocoro.letters.v1`）。Task 4・5が使う。

- [ ] **Step 1: Write the failing test**

```ts
// tests/store/storage.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageLetterStore } from "../../src/store/storage";
import type { Letter } from "../../src/letter/types";

const letter: Letter = {
  id: "l_test00000001",
  createdAt: "2026-09-08T00:00:00.000Z",
  input: { photos: ["d"], memos: ["歩いた"], addressTo: "じいじ、ばあばへ", firstPerson: "ぼく" },
  body: "じいじ、ばあばへ。歩いたんだよ！",
  stamps: { read: 0, cute: 0 },
};

describe("LocalStorageLetterStore", () => {
  beforeEach(() => localStorage.clear());

  it("保存→取得が一致する", () => {
    const store = new LocalStorageLetterStore();
    store.saveLetter(letter);
    expect(store.getLetter("l_test00000001")?.body).toBe(letter.body);
  });

  it("スタンプ加算が残存する", () => {
    const store = new LocalStorageLetterStore();
    store.saveLetter(letter);
    store.addStamp("l_test00000001", "cute");
    expect(store.getLetter("l_test00000001")?.stamps.cute).toBe(1);
  });

  it("未知IDはnullを返す", () => {
    const store = new LocalStorageLetterStore();
    expect(store.getLetter("l_missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store/storage.test.ts`
Expected: FAIL with "Cannot find module '../../src/store/storage'"

- [ ] **Step 3: Write minimal implementation**

```ts
// src/store/storage.ts
import type { Letter, StampKind } from "../letter/types";

export const STORAGE_KEY = "magocoro.letters.v1";

export interface LetterStore {
  saveLetter(letter: Letter): void;
  getLetter(id: string): Letter | null;
  addStamp(id: string, kind: StampKind): void;
}

export class LocalStorageLetterStore implements LetterStore {
  private readAll(): Record<string, Letter> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Letter>;
    } catch {
      return {};
    }
  }

  saveLetter(letter: Letter): void {
    const all = this.readAll();
    all[letter.id] = letter;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  getLetter(id: string): Letter | null {
    return this.readAll()[id] ?? null;
  }

  addStamp(id: string, kind: StampKind): void {
    const all = this.readAll();
    const letter = all[id];
    if (!letter) return;
    letter.stamps[kind] += 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/store/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store tests/store
git commit -m "feat: Task 3 保存（LetterStore＋localStorage）"
```

---

### Task 4: 作る画面（`/`）

**Files:**
- Create: `src/compose/ComposePage.tsx`
- Modify: `src/routes.tsx`（`/` にComposePageを割り当て）
- Test: `tests/compose/ComposePage.test.tsx`

**Interfaces:**
- Consumes: Task 2の `TemplateLetterGenerator.generate`、Task 3の `LocalStorageLetterStore.saveLetter`
- Produces: `/` の入力フォーム。生成後に `/letter/:id` へ遷移する。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/compose/ComposePage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ComposePage } from "../../src/compose/ComposePage";

describe("ComposePage", () => {
  it("写真0枚・メモ0件では生成ボタンが押せない", async () => {
    const onCreate = vi.fn();
    render(
      <MemoryRouter>
        <ComposePage onCreate={onCreate} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: "お手紙をつくる" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/compose/ComposePage.test.tsx`
Expected: FAIL with "Cannot find module '../../src/compose/ComposePage'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/compose/ComposePage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TemplateLetterGenerator } from "../letter/generator";
import { LocalStorageLetterStore } from "../store/storage";

const MAX_BYTES = 2 * 1024 * 1024;

export function ComposePage({ onCreate }: { onCreate?: (id: string) => void } = {}) {
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<string[]>([]);
  const [memos, setMemos] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState("");

  const filledMemos = memos.map((m) => m.trim()).filter(Boolean);
  const canCreate = photos.length > 0 && filledMemos.length > 0;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, 3);
    const dataUrls = await Promise.all(
      picked.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("読み込めませんでした"));
            reader.readAsDataURL(f);
          }),
      ),
    );
    const total = dataUrls.reduce((n, d) => n + d.length, 0);
    if (total > MAX_BYTES) {
      setError("写真が大きすぎます。小さい写真を選んでください。");
      return;
    }
    setError("");
    setPhotos(dataUrls);
  }

  function handleCreate() {
    const letter = new TemplateLetterGenerator().generate({
      photos,
      memos: filledMemos,
      addressTo: "じいじ、ばあばへ",
      firstPerson: "ぼく",
    });
    try {
      new LocalStorageLetterStore().saveLetter(letter);
    } catch {
      setError("ブラウザの容量がいっぱいです。古いお手紙を消してから作り直してください。");
      return;
    }
    if (onCreate) onCreate(letter.id);
    navigate(`/letter/${letter.id}`);
  }

  return (
    <main className="mx-auto max-w-lg bg-[#f7f2e9] p-4">
      <h1 className="text-xl font-bold text-[#33302a]">Magocoroをつくる</h1>
      <label className="mt-4 block text-[#33302a]">
        写真（1〜3枚）
        <input type="file" accept="image/*" multiple onChange={(e) => void handleFiles(e.target.files)} />
      </label>
      {memos.map((memo, i) => (
        <label key={i} className="mt-2 block text-[#33302a]">
          メモ{i + 1}
          <input
            className="mt-1 block w-full border border-[#ddd2c2] bg-[#fffdf8] p-2"
            value={memo}
            onChange={(e) => setMemos(memos.map((m, j) => (j === i ? e.target.value : m)))}
          />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
      <button
        className="mt-4 min-h-[44px] w-full bg-[#c4543a] text-white disabled:opacity-40"
        disabled={!canCreate}
        onClick={handleCreate}
      >
        お手紙をつくる
      </button>
    </main>
  );
}
```

`src/routes.tsx` を置き換える:

```tsx
import { Route, Routes as RouterRoutes } from "react-router-dom";
import { ComposePage } from "./compose/ComposePage";
import { LetterPage } from "./preview/LetterPage";

export function Routes() {
  return (
    <RouterRoutes>
      <Route path="/" element={<ComposePage />} />
      <Route path="/letter/:id" element={<LetterPage />} />
    </RouterRoutes>
  );
}
```

注: `LetterPage` はTask 5で作る。Task 4の時点では `routes.tsx` の置き換えはテスト対象外とし、Task 5完了時に両画面の結合を確認する。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/compose/ComposePage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/compose tests/compose src/routes.tsx
git commit -m "feat: Task 4 作る画面"
```

---

### Task 5: プレビュー・共有・スタンプ画面（`/letter/:id`）

**Files:**
- Create: `src/preview/LetterPage.tsx`
- Test: `tests/preview/LetterPage.test.tsx`

**Interfaces:**
- Consumes: Task 3の `LocalStorageLetterStore`（`getLetter` / `addStamp`）
- Produces: `/letter/:id` の便箋プレビュー・リンクコピー・スタンプ。未知IDでは専用表示。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/preview/LetterPage.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { LetterPage } from "../../src/preview/LetterPage";
import { LocalStorageLetterStore } from "../../src/store/storage";

const letter = {
  id: "l_preview00001",
  createdAt: "2026-09-08T00:00:00.000Z",
  input: { photos: ["data:image/png;base64,xxx"], memos: ["歩いた"], addressTo: "じいじ、ばあばへ", firstPerson: "ぼく" as const },
  body: "じいじ、ばあばへ。歩いたんだよ！",
  stamps: { read: 0, cute: 0 },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/letter/:id" element={<LetterPage />} />
        <Route path="/" element={<div>作る画面へ</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LetterPage", () => {
  beforeEach(() => {
    localStorage.clear();
    new LocalStorageLetterStore().saveLetter(letter);
  });

  it("本文とスタンプが表示される", () => {
    renderAt("/letter/l_preview00001");
    expect(screen.getByText(/歩いたんだよ/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /かわいい/ })).toBeInTheDocument();
  });

  it("スタンプ押下でカウントが増える", async () => {
    renderAt("/letter/l_preview00001");
    await userEvent.click(screen.getByRole("button", { name: /かわいい/ }));
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("未知IDでは専用表示になる", () => {
    renderAt("/letter/l_missing");
    expect(screen.getByText(/見つからない/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preview/LetterPage.test.tsx`
Expected: FAIL with "Cannot find module '../../src/preview/LetterPage'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/preview/LetterPage.tsx
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { StampKind } from "../letter/types";
import { LocalStorageLetterStore } from "../store/storage";

const STAMPS: { kind: StampKind; label: string }[] = [
  { kind: "read", label: "読んだよ" },
  { kind: "cute", label: "かわいい！" },
];

export function LetterPage() {
  const { id = "" } = useParams();
  const store = new LocalStorageLetterStore();
  // 再レンダー用カウンタ。表示値は毎レンダーで getLetter し直すため常に最新。
  const [, setVersion] = useState(0);
  const letter = store.getLetter(id);

  if (!letter) {
    return (
      <main className="mx-auto max-w-lg bg-[#f7f2e9] p-4">
        <p className="text-[#33302a]">お手紙が見つからないよ</p>
        <Link to="/">作る画面へもどる</Link>
      </main>
    );
  }

  const date = new Date(letter.createdAt).toLocaleDateString("ja-JP");
  const size =
    letter.input.heightCm != null || letter.input.weightKg != null
      ? `${letter.input.heightCm ?? "?"}cm ${letter.input.weightKg ?? "?"}kg`
      : null;

  return (
    <main className="mx-auto max-w-lg bg-[#f7f2e9] p-4">
      <article className="bg-[#fffdf8] p-6 shadow">
        <div className="flex justify-end gap-2">
          {letter.input.photos.map((photo, i) => (
            <img key={i} src={photo} alt={`おもいで${i + 1}`} className="w-20 border-4 border-white shadow" />
          ))}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-[#33302a]">{letter.body}</p>
        <p className="mt-4 text-right text-sm text-[#8a7f72]">
          {date}
          {size ? `・${size}` : ""}
        </p>
      </article>
      <div className="mt-4 flex gap-2">
        {STAMPS.map(({ kind, label }) => (
          <button
            key={kind}
            aria-label={label}
            aria-pressed={false}
            className="min-h-[44px] flex-1 border border-[#ddd2c2] bg-[#fffdf8] text-[#33302a]"
            onClick={() => {
              store.addStamp(id, kind);
              setVersion((v) => v + 1);
            }}
          >
            {label} {letter.stamps[kind]}
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm text-[#8a7f72]">
        このリンクは作ったブラウザでのみ開けます。
      </p>
      <button
        className="mt-2 min-h-[44px] w-full bg-[#c4543a] text-white"
        onClick={() => void navigator.clipboard?.writeText(window.location.href)}
      >
        リンクをコピー
      </button>
    </main>
  );
}
```

注: スタンプ数はクリックでlocalStorageへ書き込み→再レンダーで `getLetter` し直すため、表示は自動で最新になる。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/preview/LetterPage.test.tsx`
Expected: PASS（必要なら注に従って最小修正し、修正内容をコミットに含める）

- [ ] **Step 5: Commit**

```bash
git add src/preview tests/preview
git commit -m "feat: Task 5 プレビュー・共有・スタンプ画面"
```

---

### Task 6: 結合・ビルド検証

**Files:**
- Modify: 不具合があれば対象ファイル（新規ファイルは作らない）
- Test: `npm test` 全体＋ `npm run build`

**Interfaces:**
- Consumes: Task 1〜5の全成果物
- Produces: `dist/` が静的配信可能な状態。受け入れ条件（Spec §8）の全項目が目視＋テストで確認済み。

- [ ] **Step 1: 全テストを実行**

Run: `npm test`
Expected: 全テストPASS。失敗があれば原因タスクのファイルへ戻って修正し、修正コミットを分ける。

- [ ] **Step 2: ビルドを実行**

Run: `npm run build`
Expected: 成功し、`dist/index.html` が存在する。

- [ ] **Step 3: 受け入れ確認（Spec §8の目視）**

`npm run dev` で起動し、写真1枚＋メモ1件で手紙を作り、プレビュー・共有リンク・スタンプ・未知ID表示を確認する。問題があれば修正してTask単位でコミットする。

- [ ] **Step 4: Commit（修正がなければ空コミットしない）**

修正時のみ:

```bash
git add -A
git commit -m "fix: Task 6 結合・ビルド検証の指摘反映"
```
