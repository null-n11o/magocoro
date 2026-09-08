# Magocoro（まごころ）

孫目線の成長シェアサービス。親が写真（1〜3枚）と孫口調の本文を入れてWeb手紙を作り、リンクをLINEに貼ると、祖父母のスマホで同じ手紙が開ける。祖父母はワンタップのスタンプで返事できる。

今回の実装対象は、Web手紙の1ループのみ（Cloudflare Pages + Worker + R2）。

## 使い方

1. 親が作る画面（`/`）で写真・宛名・本文・署名を入れて「お手紙をつくる」
2. 手紙ページ（`/letter/:id`）が作られる
3. 「リンクをコピー」でURLを取得し、いつものLINEトークに自分で貼る
4. 祖父母がスマホで開いて読み、スタンプ（「読んだよ」「かわいい！」）を押す

- 本文は親が書いたものがそのまま載る。文面の自動生成はしない
- 共有URLは推測しにくいID（`l_` + 32桁hex）。ログイン・パスコードなしで、リンクを知っている人だけが読める
- ログイン・アカウント・手紙一覧・削除UIはなし

## 入力仕様

- 写真：1〜3枚、JPEG / PNG / WebP、1枚2MBまで
- 宛名：初期値「じいじ、ばあばへ」（空送信時はこの既定値）
- 本文：1〜1000字、改行保持。「孫の口調で書いてください」と案内する
- 署名：子どもの呼び名、1〜20字
- スタンプ：`read`（読んだよ）/ `cute`（かわいい！）のカウント。リンクを知っている人は何度でも押せる

必須欠け（写真0枚・本文空・署名空）や文字数超過では作成ボタンは押せない。保存・通信失敗時は入力を残して「いま保存できません」を出す。未知ID・破損データは例外画面にせず「お手紙が見つからない」＋作る導線を出す。

## 対象外（次スライス以降）

- LINE公式アカウント / LIFF / メッセージ自動送信
- 印刷・郵送API、決済
- LLM・テンプレートによる文面生成
- ユーザーアカウント、手紙一覧、削除UI、検索
- 身長・体重、英語、ネイティブアプリ

## アーキテクチャ

Cloudflare Pages（静的UI）+ Worker（API）+ R2（手紙JSONと写真）。DBなし。

```text
作る画面 → POST /api/letters → R2（JSON + 写真）
手紙画面 → GET /api/letters/:id
         → GET /api/letters/:id/photos/:n
         → POST /api/letters/:id/stamps
```

- UI：Vite + React + TypeScript + Tailwind。ルートは `/` と `/letter/:id`
- 画面は `LetterApi`（`src/api/letters.ts`）にだけ依存する。LINEやハガキを足すときは Worker の奥だけ増やす
- ブラウザは R2 を直接叩かない。R2バケットは非公開で、写真は Worker 経由で返す
- 同一オリジン配信（Pages のSPA + Worker を一体）。`/api/*` 以外はSPAにフォールバック
- 外部LLM・決済・LINEにはつながらない（自前WorkerとフォントCDNのみ）。秘密値はリポジトリに入れない

## 画面

- 作る（`/`）：写真プレビュー付き選択、宛名、本文、署名。「お手紙をつくる」で `/letter/:id` へ遷移
- 手紙（`/letter/:id`）：便箋表示（切手風写真、宛名、本文、署名、消印風の日付）、「リンクをコピー」＋注記「このリンクをLINEに貼ると、相手のスマホでも開けます」、スタンプ2種（回数表示、`aria-label` + `aria-pressed`）

デザインは和紙・便箋の質感（`page #f7f2e9` / `surface #fffdf8` / `text #33302a` / `muted #8a7f72` / `line #ddd2c2` / `accent #c4543a`）、Noto Sans JP、日本語のみ、最大幅モバイルカラム（`max-w-lg`）中央寄せ。紫・ネオン・金・装飾絵文字は使わない。

## ドキュメント

- 要件・設計の正本：`docs/superpowers/specs/2026-09-08-magocoro-web-letter-design.md`
- 実装計画：`docs/superpowers/plans/2026-09-08-magocoro-web-letter.md`
- 開発の進め方：`AGENTS.md`
- 着想メモ：`docs/PLAN-20260908-300-magocoro-growth-share.md`（本仕様の制約源ではない）
- 旧下書き（使わない）：`docs/superpowers/specs/2026-09-08-magocoro-mvp-design.md` / `docs/superpowers/plans/2026-09-08-magocoro-mvp-implementation.md`

## 状態・開発

状態：Web手紙スライスの設計と実装計画まで完了。実装は未着手。

開発コマンド（実装計画 Task 1 で作成予定。それまでは存在しない）：

- `npm run dev` - 開発サーバー起動
- `npm test` - Vitest 全テスト（`vitest run`）
- `npx vitest run tests/<name>` - 個別テスト
- `npm run lint` - oxlint
- `npm run build` - 型チェック＋本番ビルド
