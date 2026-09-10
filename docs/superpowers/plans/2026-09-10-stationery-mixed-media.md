# Stationery and mixed media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute continuously; the user's implementation request authorizes all reversible changes. No deployment.

**Goal:** Restyle the real letter loop to the selected LP and allow 1–3 media including at most one video.
**Architecture:** Keep React/Vite, Worker/R2, LetterApi and existing routes. Extend the discriminated union with mixed to retain old records. Shared LetterPaper guarantees composer preview and received/export paper agree.
**Tech Stack:** React, TypeScript, CSS, Vitest, Cloudflare Worker/R2.
**Spec:** docs/superpowers/specs/2026-09-10-stationery-mixed-media-design.md

## Global Constraints
- Media total 1–3, at most one clip <=30sec; mixed = 1–2 photos and one clip.
- Existing byte/TTL/persistence/share constraints unchanged. Old photos/clip records remain valid.
- User body remains unchanged; hiragana is for UI/sample guidance, not rewriting.
- Approved paper/linen/brick red/sage aesthetic, accessible44px controls, responsive without horizontal scroll, reduced motion.
- Local validation, PR; no merge or deployment.

### Task 1: Mixed media API, storage and export contract
**Files:** src/api/types.ts, src/api/letters.ts, worker/store.ts, src/media/bundleVideo.ts, tests/api/letters.test.ts, tests/worker/letters.test.ts, tests/media/bundleVideo.test.ts, tests/letter/buildKeepVideo.test.ts.
**Interfaces:** add {kind:"mixed",photos:File[],clip:File} to CreateLetterInput.media, {kind:"mixed",photoUrls:string[],clipUrl:string} to LetterMediaPublic, equivalent record photos/contentType and clip/contentType. Existing variants retained. keepShareKind accepts mixed and returns video.
- [x] Write failing tests for mixed serialization, create/get/photos/clip/expiry, >3 total, duplicate clip, malformed entries, and mixed export choosing video with static photos.
- [x] Run focused tests to establish RED: node_modules/.bin/vitest run tests/api/letters.test.ts tests/media/bundleVideo.test.ts tests/letter/buildKeepVideo.test.ts; worker via --config vitest.worker.config.ts.
- [x] Implement mixed variants and independent photo/clip persistence/read branches, preserve cleanup and old records; no silent dropping malformed multipart files.
- [x] Run focused tests GREEN; fix any narrowing errors in untouched rendering conservatively if needed, but do not implement UI.
- [x] Commit scoped files and write work/task-1-report.md with test evidence.

### Task 2: Stationery composer, shared paper and receiving/export UI
**Files:** src/compose/ComposePage.tsx, src/letter/LetterPage.tsx, new src/letter/LetterPaper.tsx, src/index.css, src/media/snapshotPaper.ts, src/letter/buildKeepVideo.ts, corresponding tests, README.md, AGENTS.md.
**Interfaces:** consumes mixed union from Task1. Shared LetterPaper receives media URLs, addressTo, body, signature, optionally createdAt, renders one exportable element and video.letter-clip. Composer creates media photos/clip/mixed based on actual selected files. API stays injectable.
- [x] Add meaningful failing compose tests: photos plus clip retained; total cap in both orders; video replacement/failure; creation disabled while preparing; exact mixed request; removal restores capacity. Recipient test renders both video and photos and retains original typed body; export includes mixed.
- [x] Run relevant Vitest tests RED.
- [x] Implement functional upload, limits, processing state and live preview; retain working audio/drag-keyboard photo reorder/errors. Add shared stamped-paper composition with responsive 1/2/3 media slots and CSS matching approved source. Restyle receiver/share/reactions and error screens. Update snapshot loading to await images before export.
- [x] Run tests GREEN and npm run build. Update README and agent pointers to new spec.
- [x] Commit and write work/task-2-report.md. Capture through supported in-app browser in parent session; fix visual issues after feedback.

### Task 3: Integrated verification and PR
**Files:** design-qa.md; only defect fixes with covering tests if found.
- [x] Review full diff against spec and test evidence.
- [x] Run npm test, npm run build, npm run lint.
- [x] Browser verify real local creation with3 photos and mixed2photos/clip; letter rendering, reactions, reload, copy and export at desktop and mobile; compare selected image art direction with implemented screens. Use synthetic test media only on local server.
- [x] Record exact verification and platform limits in design-qa.md.
- [x] Commit any verified fixes, push feature branch and create PR; do not merge/deploy. Keep local preview available.

Completed: PR https://github.com/null-n11o/magocoro/pull/6 (stacked on PR5). No merge/deploy.
