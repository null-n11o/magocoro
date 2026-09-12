# LINE入口と共有の公開設計

Status: approved in chat on 2026-09-12; user explicitly requested implementation and same-day release, then supplied official account @039ijxbe. This amendment authorizes LINE URL navigation, account menu/welcome setup, PR merge and deployment. No broadcast authorization.

## Outcome
親が公式アカウントを友だち追加し、メニューからLINE内で /compose を開き、完成後に家族のトークへ共有する。祖父母は登録不要。既存の便箋UI・90日・混在メディア制約を維持。

## Web
Latest main is 4c2914f (LP /, composer /compose, receiver /letter/:id). Add an optional friend-add link to the LP and a sender-only 「LINEで共有」 link. Use https://line.me/R/ti/p/%40039ijxbe for friend add and https://line.me/R/share?text= plus encodeURIComponent of the canonical letter URL for sharing. Keep copy and file export. Canonical URL must never include sender=1, other query or hash. LINE send is user-confirmed; do not claim sent on navigation or cancellation. No SDK, login, profile access, Bot, webhook, server transformation, automatic push or account linking. LetterApi and JSON unchanged.

## LINE account
Public base https://magocoro.nakano-kentaro7.workers.dev. One-area rich menu labelled お手紙をつくる links directly to /compose; default open, menu bar お手紙をつくる. Use warm paper, brick-red CTA, Japanese text and existing brand asset. Start after production verification, long-lived end date within manager limits. Welcome text: 写真や動画、ことばと声を一通のお手紙に。下の「お手紙をつくる」から作成し、できたリンクをご家族のLINEへ送ってください。 Then composer URL. No mass message. Preserve unrelated account settings.

## Acceptance and release
TDD for code, focused tests then full tests/lint/build. Review PR then merge/deploy (authorized). Browser QA plus iOS/Android LINE verification of menu, photos, recording/video, creation, sharing and receiver stamps. Physical-device evidence must be reported separately; never infer native LINE behavior from desktop simulation. If access unavailable, ask user for this check, continue independent work. Unsupported media must retain input and explain external-browser fallback; do not claim full support without evidence. Verify production before enabling menu. Roll back newly changed app on critical regression without deleting letters.
