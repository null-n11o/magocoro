# LINE Release Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development task-by-task, with TDD and review.

**Goal:** Publish official-account entry and user-confirmed LINE letter sharing today.
**Architecture:** Existing Workers assets + API + R2; LINE URI navigation only.
**Tech Stack:** React, TypeScript, Vitest, LINE Official Account Manager.
**Spec:** docs/superpowers/specs/2026-09-12-line-release-design.md

## Global Constraints
- UI日本語、既存便箋UI維持、タップ面44px以上、reduced motion、横スクロールなし。
- LetterApiと手紙JSON不変。90日、端末変換、混在メディア制約維持。
- 秘密値をコミットしない。LINE SDK・Bot・LLM・課金・一斉配信は追加しない。
- LINE共有は利用者が送信先を選び確定する。移動を送信成功と表示しない。
- 共有URLに sender=1 や他のquery/hashを含めない。受取人に共有欄を出さない。

### Task 1: Web LINE entry and sharing

Files: create src/share/line.ts and tests/share/line.test.ts; modify src/landing/LandingPage.tsx, src/landing/landing.css, src/letter/LetterPage.tsx and corresponding existing tests; adjust src/index.css only if existing button classes need anchor compatibility; README usage update.
Interfaces: export LINE_FRIEND_URL constant; export lineShareUrl(letterUrl: string): string. This returns https://line.me/R/msg/text/? + encodeURIComponent(letterUrl). Caller supplies canonical origin + /letter/:id, not location.href.
- [ ] Add failing tests for encoded URL including reserved characters, exact friend URL; sender-only LINE link with canonical URL stripping sender/query/hash; receiver has no LINE link; LP optional friend link alongside retained /compose CTAs.
- [ ] Run focused Vitest using --config vitest.config.ts and record RED evidence.
- [ ] Implement helper, sender-only anchor 「LINEで送る」 alongside existing share controls; no success toast. Add LP optional 「LINEで友だち追加」 with copy explaining next-time access. Update FAQ and README to reflect LINE sharing and optional friend add. Maintain existing style hierarchy and accessibility. User must still be able to create without friend add.
- [ ] Run focused tests and build; record GREEN; self-review; commit feat: add LINE entry and letter sharing.
- [ ] Controller dispatches task reviewer for spec + quality; fix findings before completion.

### Task 2: LINE assets and setup
- [ ] Inspect current account menu/welcome configuration; preserve originals for recovery.
- [ ] Prepare one-area rich-menu image using existing brand/paper palette; inspect rendered image.
- [ ] Set menu URL to public /compose, menu title and bar お手紙をつくる. Default shown. Save as draft until production verification.
- [ ] Prepare welcome text exactly from spec with public composer URL. Publish only after production check; do not broadcast.
- [ ] Record menu dimensions/settings and publish state in release evidence.

### Task 3: QA, PR and deploy
- [ ] Run npm test, npm run lint, npm run build, review whole branch.
- [ ] Browser QA LP friend link, composer and receiver controls; test safe synthetic fixtures without real personal data. Request iOS/Android native LINE check if no controllable device.
- [ ] Create PR, review and merge; watch existing deployment workflow. No additional permission needed for authorized release.
- [ ] Verify deployed LP, composer, unknown ID, sharing URL. Enable prepared menu/welcome only after verification.
- [ ] Report PR, public and friend-add URLs; distinguish desktop verification from pending real-device checks. Preserve R2 records on rollback.
