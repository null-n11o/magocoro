# Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認画像どおりの初回訪問LPを作成フローの入口として実装する。

**Architecture:** LPはAPIを呼ばない独立React画面。既存ComposePageを `/compose` に移し、受取画面の作成リンクのみ追従。説明と見本はネイティブdialogで同ページに表示する。

**Tech Stack:** 既存React、TypeScript、React Router、CSS、Vitest/Testing Library。新しいアプリやバックエンドは作らない。

**Spec:** `docs/superpowers/specs/2026-09-12-landing-page-design.md`

## Global Constraints
- 日本語UI、`lang="ja"`、最低44pxの操作面、明確なフォーカス、動き150–400ms・reduced-motionで無効化。
- `/` はLP、`/compose` は既存作成画面、`/letter/:id` は既存受取画面。未知・期限切れ画面の作る導線は `/compose`。
- 写真と動画をあわせて3つまで。動画は1本・30秒まで。声は任意で30秒まで。リンクは90日間、URLを知る人が閲覧可能。
- 実際の手紙には見本素材・ダミー文面を挿入しない。
- サーバー・LetterApi契約・保存・圧縮・受取機能は変更しない。公開・マージ・デプロイしない。検証後に作業ブランチでPRを作る。
- 画像は既存の実素材か参考に合わせた生成ラスター。画像でLP全体を代用しない。見出し・本文・導線は本物のHTML。

## File Structure
- `src/landing/LandingPage.tsx`: LPの各セクションと見本/FAQ dialog。
- `src/landing/landing.css`: LP内に限定したレスポンシブスタイル。
- `src/assets/lp-{hero,step-photos,step-letter,step-line,reactions}.png`: 別担当が生成、LP内で読み込み。
- `src/routes.tsx`: LP・作成ルート。
- `src/letter/LetterPage.tsx`: 作る導線。
- `tests/landing/LandingPage.test.tsx`: LPの振る舞い。
- `tests/letter/LetterPage.test.tsx`: 作成リンクの遷移先。
- `tests/smoke.test.tsx`: トップから作成ルートまで。

### Task 1: LPと作成画面をつなぐ初回訪問フロー

**Files:** 上記File Structureの全ファイル。資料もこのタスクのコミットに含める。

**Interfaces:**
- Consumes: `ComposePage`、`LetterPage`、既存 `brandLogo`、別担当の5つのラスター素材。
- Produces: `export function LandingPage()`、`/`→LP、`/compose`→ComposePage。

- [ ] **Step 1: RED — 挙動テストを書く**

`tests/landing/LandingPage.test.tsx` の核となるテスト:
```tsx
it('opens the sample and returns focus to its trigger', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><LandingPage /></MemoryRouter>);
  const trigger = screen.getAllByRole('button', { name: '手紙の見本を見る' })[0];
  await user.click(trigger);
  expect(screen.getByRole('dialog', { name: 'お手紙の見本' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '閉じる' }));
  expect(screen.queryByRole('dialog', { name: 'お手紙の見本' })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
```
jsdomは必要なdialogのshowModal/closeのみテスト内で補い、open属性を実際に更新する。FAQの開閉と内容、すべての作成CTAのhrefを同様にテストする。
`tests/smoke.test.tsx` に実AppRoutesでトップは写真inputがなく、CTA押下後に写真inputが表示されることを追加する。既存受取テストで未知・期限切れの作るリンクhrefを `/compose` と確認。

- [ ] **Step 2: REDを実行し未実装による失敗を記録**
```sh
npx vitest run tests/landing/LandingPage.test.tsx tests/smoke.test.tsx tests/letter/LetterPage.test.tsx
```
期待: LandingPage未存在かルート/導線の違いによる失敗。失敗理由を報告に保存。

- [ ] **Step 3: GREEN — LPのHTML、スタイル、ルーティングを実装**
ルート変更:
```tsx
<Route path="/" element={<LandingPage />} />
<Route path="/compose" element={<ComposePage api={api} />} />
<Route path="/letter/:id" element={<LetterPage api={api} />} />
```
LPは `<main className="landing-page">` 内にheader、hero、`section id="how-it-works"`、反応紹介、footerを配置。CTAは `<Link to="/compose">手紙をつくる</Link>`。見本/FAQは同一のdialogを見せるstateで分岐し、dialog refのshowModal()をeffectで呼び、onCancelでstateを閉じ、起点refへフォーカス復帰。見本画像の操作バーは静止画像と注記する。
見出し・本文はspecの文言。参考画像は1086x1448、左右余白約65、hero高さ約606、使い方約485、反応約280、footer約77。desktop幅1086では大見出し約52px、本文20px、朱CTA約325x60。最大幅は1280程度、余白はclampで調整。hero左右45:55、stepsは等分3列で薄い縦罫線。モバイル・タブレット960px以下で縦積み、headline約34px、CTA幅100%、dialogは画面内スクロール。`landing-` prefixでスタイルを隔離し既存要素への影響を防ぐ。
参考のロゴは既存画像を使い、高さや余白を見て配置。生成素材が到着するまで完了にしない。画像はobject-fit:containを基本とし、hero/reactionsは背景と自然につなぐ。矢印等が必要なら既存ライブラリのみ。新規手描きSVG/CSSアートなし。

- [ ] **Step 4: GREENとREFACTOR、検証**
```sh
npx vitest run tests/landing/LandingPage.test.tsx tests/smoke.test.tsx tests/letter/LetterPage.test.tsx
npm test
npm run lint
npm run build
```
期待: すべて成功。必要な範囲で重複解消、LP専用CSSへの隔離。controllerが実ブラウザで1086px/390px、導線・dialog・Escape・フォーカス・横はみ出し・consoleを確認し、参考と画像比較してP0/P1/P2を修正、design-qa.mdに保存。

- [ ] **Step 5: Commit、レビュー、PR**
```sh
git add src/landing src/assets/lp-*.png src/routes.tsx src/letter/LetterPage.tsx tests/landing tests/smoke.test.tsx tests/letter/LetterPage.test.tsx docs/superpowers/specs/2026-09-12-landing-page-design.md docs/superpowers/plans/2026-09-12-landing-page.md docs/superpowers/assets/2026-09-12-approved-lp.png
git commit -m "feat: add welcoming landing page and compose entry"
```
仕様/品質レビューと最終差分レビューを受け、問題を直して該当テストを再実行。検証記録をコミット後、作業ブランチをpushしPR作成。マージ・公開しない。
