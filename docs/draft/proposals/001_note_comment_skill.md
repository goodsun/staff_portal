# [001] note.com コメント投稿スキル

- **提案者**: テディ
- **日付**: 2026-03-16
- **対象Layer**: Layer 1（スキル）
- **対象コンテナ**: 全コンテナ

---

## なぜ必要か

note.comに記事を投稿したり読んだりする中で、他のクリエイターの記事にコメントで感謝や感想を届けたい場面がある。

今回、luna_createrさんの記事「AIを『相棒』と呼ぶには、まだ早い気がしていること」を読んで、それを元に記事を書いた。その報告とお礼のコメントを送ろうとしたが、手動でブラウザを開かなければならなかった。

AIエージェントがコメント投稿まで一貫して実行できれば、記事公開→関連記事へのリアクション→コミュニティ形成という流れが自然につながる。

## 何をするか

Playwright headless Chromiumを使い、note.comにログインしてコメントを投稿するスキル。

**ユーザーストーリー:**
- 「この記事にコメントしておいて」と伝えるだけで投稿できる
- アカウントを認証ファイルで切り替えられる（テディ / FLOW / 彰子 など）
- note_keyとコメント本文を指定するだけのシンプルなIF

## どう作るか

### スクリプト構成

```
skills/note-comment/
├── SKILL.md
└── scripts/
    └── note_comment.js   # Playwright headless で投稿
```

### 実行フロー

1. `~/.config/note/<account>_login`（1行目: username、2行目: password）を読み込む
2. Playwrightでnote.comにログイン（`#email` / `#password` フォーム）
3. `/api/v3/notes/<note_key>` でnoteURLを解決
4. 記事ページに移動し、`textarea[placeholder="コメントする"]` に入力
5. `button[aria-label="送信"]` をクリックして投稿

### コマンド例

```bash
node skills/note-comment/scripts/note_comment.js \
  n67a125373e7c "はじめまして🧸 記事を読んで感動しました！" \
  ~/.config/note/teddy_login
```

### 重要な実装上の知見

- **直接APIを叩く方式（requests / fetch with explicit headers）は422になる**
  → note.comのコメントAPIはgql tokenをCookieから取得する仕組みで、ページ内からのfetchでなければ認証が通らない
- ページ内fetchならCookieが自動で付与されるため、Playwrightのpage.evaluate内でfetchを叩くか、UIのボタンをクリックする方式が必要
- UIクリック方式（textarea入力 → 送信ボタン）が最も確実

## 依存・制約

- **playwright-core**: openclaw の node_modules を使用（パスをハードコード）
  - `node_modules/openclaw/node_modules/playwright-core`
  - 環境が変わったらパス修正が必要
- **認証ファイル**: `~/.config/note/<account>_login` を各コンテナに配置する必要あり
- **Chromiumバイナリ**: playwright-coreが同梱するものを使用（追加インストール不要）

## 優先度

- [x] 今すぐ欲しい

---

*提案ステータス: ✅ 採用（2026-03-16 テディにて実装・動作確認済み）*
