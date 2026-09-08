# Magocoro

孫目線の成長シェアサービス。親は写真と孫口調の本文を入れてWeb手紙を作り、リンクをLINEに貼ると祖父母のスマホで開ける。今回の実装対象はWeb手紙の1ループ（Cloudflare Pages + Worker + R2）。

## 設計書（読む順）

1. `docs/superpowers/specs/2026-09-08-magocoro-web-letter-design.md`（要件・設計の正本。自己完結）
2. 実装計画: `docs/superpowers/plans/2026-09-08-magocoro-web-letter.md`
3. `docs/PLAN-20260908-300-magocoro-growth-share.md`（着想メモ。本仕様の制約源ではない）
4. 新規開発の要件・計画は `docs/superpowers/specs/` と `docs/superpowers/plans/` に置く。作り方は「開発フロー」参照。
5. 旧下書き（使わない）: `docs/superpowers/specs/2026-09-08-magocoro-mvp-design.md` / `docs/superpowers/plans/2026-09-08-magocoro-mvp-implementation.md`

## Commands

- `npm run dev` - 開発サーバー起動
- `npm test` - Vitest 全テスト（`vitest run`）
- `npx vitest run tests/<name>` - 個別テスト
- `npm run lint` - oxlint
- `npm run build` - 型チェック＋本番ビルド

上記スクリプトは実装計画Task 1で作成する。それまでは存在しない。

反復中は狭い検証（個別テスト）を使い、引き渡し前の広い変更では `npm test` と `npm run build` を通す。

## Architecture

- 作る画面 → `LetterApi`（`src/api/letters.ts`）→ Worker → R2。手紙画面は取得とスタンプだけ同じ窓口を使う。
- 画面は `LetterApi` にだけ依存する。LINEやハガキを足すときは Worker の奥だけ増やす。
- 文面生成はしない。本文は親が書いたものがそのまま載る。
- 写真と手紙JSONは R2。ブラウザは R2 を直接叩かない。1枚2MBまで、JPEG / PNG / WebP、1〜3枚。

## Working rules

- 実装計画の Task 順で進める。Taskを飛ばさない。
- TDD厳守（RED-GREEN-REFACTOR）。プレースホルダ・ダミー文面禁止。各タスク完了ごとにコミットし、次のタスクへの進行確認を取る。
- 実装タスクが完了したら、検証後に必ず作業ブランチからPRを作成して引き渡す。マージ・デプロイは明示依頼がない限り実施しない。
- **設計書の制約が最優先。** UIは日本語のみ（`lang="ja"`）、コンテンツ面は和紙・便箋の質感（`page #f7f2e9` / `surface #fffdf8` / `text #33302a` / `muted #8a7f72` / `line #ddd2c2` / `accent #c4543a`）、切手風フレームは白縁＋波線、紫・ネオン・金・絵文字の装飾利用禁止、見出しと本文は Noto Sans JP、動き150–400ms（`prefers-reduced-motion` で無効化）、タップ面44px以上・スタンプボタンに `aria-label`＋`aria-pressed`、ページ全体の横スクロール禁止・最大幅モバイルカラム（`max-w-lg`）中央寄せ、秘密値はリポジトリに入れない。外部LLM・決済・LINEにはつながない（自前WorkerとフォントCDNのみ）。
- 未知ID・破損データは落とさず専用表示＋作る導線にする。例外画面を出さない。
- デプロイ・公開URL確定は明示依頼があるまで実装外。秘密値はリポジトリに入れない。

## 開発フロー（superpowers）

このリポジトリだけで完結する。新規開発は次の3段階で回す。KCP式のPLAN書式は使わない。

1. 入力: 軽い要求定義を受け取る。アイデアメモ程度でよい（チャット貼り付け・ファイルどちらでも）。要求が荒いままなら `superpowers:brainstorming` で掘り下げ、合意した設計を `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` に保存する。
2. 計画: `superpowers:writing-plans` で実装計画を作り、`docs/superpowers/plans/YYYY-MM-DD-<name>.md` に保存する。タスクは短時間で終わる粒度に割り、対象ファイル・検証手順・コミット単位まで書く。
3. 実装: `superpowers:subagent-driven-development`（サブエージェントが使える環境での既定）または `superpowers:executing-plans`（別セッション・チェックポイント型）で計画を実行する。TDD厳守、タスクごとにコミット。設計書の制約（Global Constraints）は計画に引き継ぐ。

## Skill routing

ユーザーの依頼に合うスキルがあるときは、Skill ツール（または各ランタイムの相当手段）で、ファイル確認や質問より先に呼び出す。迷ったら呼び出す。スキルを使うターンは、冒頭で `Using <skill> to <purpose>` と明示する。

- 新規アイデアの掘り下げ -> `superpowers:brainstorming`
- 実装計画の作成 -> `superpowers:writing-plans`
- 実装計画の実行 -> `superpowers:subagent-driven-development`（サブエージェントが使える環境での既定）または `superpowers:executing-plans`（別セッションで実行する場合）。詳細は「Superpowers の使い方」参照。
- UI/UXの探索・再設計・フロー監査 -> Product Designプラグイン（`product-design:index`。再設計は `product-design:get-context` → `product-design:ideate`、既存画面の監査は `product-design:audit`）
- バグ・エラー調査 -> `investigate`
- 仕様・スコープの戦略判断 -> `plan-ceo-review`
- アーキテクチャ固定 -> `plan-eng-review`
- サイト動作のQA -> `qa` / `qa-only`
- 差分レビュー -> `review`
- 見た目の最終磨き -> `design-review`
- 出荷・PR -> `ship`
- 進捗保存・復帰 -> `context-save` / `context-restore`

### Taste系スキルの扱い（補助のみ）

`design-taste-frontend` / `minimalist-ui` / `redesign-existing-projects` は新規画面の補助参照に限定する。設計書の制約と競合したら設計書が勝つ。taste既定のフォント差し替え・パレット変更は、設計書の改訂なしに行わない。

### Superpowers の使い方

- Claude Code: `superpowers` プラグインが全体に導入済み。`/superpowers-subagent-driven-development` のようにスラッシュ実行するか、Skill ツールで `superpowers:subagent-driven-development` を指定する。
- Codex: グローバルの `superpowers@claude-plugins-official` プラグインを正規のスキル供給元として扱う。ランタイムにSkill呼び出し機能が公開されている場合は、該当するスキル名（例: `superpowers:brainstorming`）を直接呼び出す。呼び出し機能が公開されていない場合は、インストール済みプラグインの同名 `SKILL.md` を全文読んで、その手順をフォールバックとして厳密に実行する。このフォールバックを「直接発動済み」と表現しない。
- Codexでは、毎回「適用スキルの選定→開始宣言→スキルの手順→検証」の順序を守る。`superpowers:brainstorming` は新規アイデア・機能・UI変更の前に、`superpowers:writing-plans` は承認済み設計の後に、`superpowers:subagent-driven-development` または `superpowers:executing-plans` は承認済み計画の実装時に使う。ブレインストーミングの設計承認前に実装へ進まない。
- Codexでプラグインをインストール・更新・有効化した直後は、現在のセッションに反映されないことがあるため、新規セッションまたはアプリの再読み込み後に運用する。状態確認が必要な場合は `codex plugin list --json` で対象プラグインの `installed` と `enabled` を確認する。
- Cursor / opencode 等: 各ランタイムのネイティブなスキル呼び出しを優先する。直接呼び出し機能がない場合は、該当する `SKILL.md` と `docs/superpowers/plans/` の計画書の手順（チェックボックス形式の Step、失敗テスト→最小実装→検証→コミット）をそのまま実行する。サブエージェント機能がある環境では1タスク1サブエージェント＋タスクごとのレビュー（仕様準拠→品質）を再現する。
- 対応表: 同一セッションで逐次実行するなら `subagent-driven-development`、別セッションでチェックポイントを挟むなら `executing-plans`。どちらもテスト→実装→検証→コミットの順序は変えない。
