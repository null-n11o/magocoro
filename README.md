# Magocoro（まごころ）

親が写真または短い動画と、ことばと声を1通にまとめて送り、祖父母がLINEのリンクまたは動画で受け取る。実装対象は無料枠に収まるまとめ手紙の1ループ（Cloudflare Pages + Worker + R2。変換は端末側）。

## 使い方（予定・Specどおり）

1. 親が作る画面（`/`）で「写真」または「動画」を選び、本文・署名、任意で声を入れて「お手紙をつくる」
2. 手紙ページ（`/letter/:id`）が作られる
3. 「リンクをコピー」か「動画にして送る」で、いつものLINEトークへ渡す
4. 祖父母が開いて読み、スタンプ（「読んだよ」「かわいい！」）を押す。トークに届いた動画は長押し保存できる

- 本文は親が書いたものがそのまま載る。文面の自動生成はしない
- 共有URLは推測しにくいID（`l_` + 32桁hex）。ログインなし。90日でWeb手紙は閉じる
- ログイン・アカウント・手紙一覧・削除UIはなし

## 入力仕様

- 媒体：画像1〜3枚 **または** 動画1本（30秒以内）。両方は不可
- 画像：選んだあと長辺1280 JPEG へ圧縮。サーバ上限は1枚1MB
- 動画：720p・30秒以内。サーバ上限10MB
- 音声：任意、30秒以内
- 宛名：初期値「じいじ、ばあばへ」
- 本文：1〜1000字。孫口調への案内は出さない
- 署名：1〜20字
- スタンプ：`read` / `cute`

## 対象外

- LINE公式アカウント / LIFF / メッセージ自動送信
- Stream、サーバ側エンコード
- 印刷・郵送API、決済
- LLM・テンプレートによる文面生成
- ユーザーアカウント、手紙一覧、削除UI、検索

## ドキュメント

- 要件・設計の正本：`docs/superpowers/specs/2026-09-10-magocoro-letter-bundle-design.md`
- 実装計画：`docs/superpowers/plans/2026-09-10-magocoro-letter-bundle.md`
- 開発の進め方：`AGENTS.md`
- 着想メモ：`docs/PLAN-20260908-300-magocoro-growth-share.md`（本仕様の制約源ではない）
- 旧正本（使わない）：`docs/superpowers/specs/2026-09-08-magocoro-web-letter-design.md` / `docs/superpowers/plans/2026-09-08-magocoro-web-letter.md`
- 旧下書き（使わない）：`docs/superpowers/specs/2026-09-08-magocoro-mvp-design.md` / `docs/superpowers/plans/2026-09-08-magocoro-mvp-implementation.md`

## 状態・開発

状態：まとめ手紙Specと実装計画あり。写真のみのWeb手紙実装はリポジトリに存在する。本計画の実装は Task 1 から。

- `npm run dev` - 開発サーバー起動
- `npm test` - Vitest 全テスト
- `npx vitest run tests/<name>` - 個別テスト
- `npm run lint` - oxlint
- `npm run build` - 型チェック＋本番ビルド
