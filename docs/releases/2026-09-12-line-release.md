# LINE release evidence — 2026-09-12

## Account setup
- Account: Magocoro / @039ijxbe; authenticated owner manager access verified.
- Prior rich menu: none. Draft created: 20190972.
- Menu: small, one region, 1200 × 405 PNG, お手紙をつくる; URL https://magocoro.nakano-kentaro7.workers.dev/compose; default shown.
- Display period prepared: 2026/09/12 00:00–2036/09/12 23:59 (manager accepted in draft).
- Menu activation: pending production verification.
- Welcome: replacement text prepared but not yet saved. Prior default was friend display name + はじめまして！ + account name + です。友だち追加ありがとうございます / このアカウントでは、最新情報を定期的に配信していきます / どうぞお楽しみに (LINE template emoji). Existing first-add-only setting unchecked; retain it.
- Restore: unpublish new menu; restore built-in friend-add welcome template. No letters are deleted.

## Web checks
- Task 1 RED captured in implementer report; helper import and new links initially failed.
- GREEN: 113 frontend tests + 26 worker tests; lint/build passed. Separate hash-location fixture refined; 23 focused receiver tests passed.
- Desktop Chrome: LP optional friend link exists; existing create CTA navigates /compose.
- 390px viewport: LP and sender letter width exactly 390px; friend target 44px and LINE share target 48px.
- Local API: a nonpersonal menu-image letter was created, then viewed through sender and receiver pages. Sender link contains canonical letter URL without sender=1; receiver sharing absent.
- Local browser: よんだよ changed from 0 to 1 and stayed 1 on reload.
- Browser file automation restricted by extension; manager image upload completed using native file picker. End-to-end composer upload through desktop browser not yet verified in this run; compose tests passed.
- iOS/Android LINE: requested user verification, pending. No native compatibility claim. Recording/video export in LINE not verified.

## Release
- Existing public endpoint: https://magocoro.nakano-kentaro7.workers.dev
- Friend entry: https://line.me/R/ti/p/%40039ijxbe
- New revision deployment and account activation pending.
