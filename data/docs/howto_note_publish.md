# note.com 投稿ガイド

bon-soleilメンバー向けのnote投稿手順書。  
下書き確認 → アイキャッチ生成 → 投稿まで。

---

## 前提

- 投稿スクリプト: `~/workspace/scripts/note/note_publish.py`
- Cookie: `~/.config/note/cookies`（期限切れ時はブラウザで再ログイン）
- アイキャッチ生成: `~/workspace/skills/nanobanana/generate.py`
- Gemini APIキー: `~/.config/gemini/api_key` または環境変数 `GEMINI_API_KEY`

---

## 1. 記事を書く

`/tmp/note_<スラッグ>.md` に本文を作成。

### ルール

- **Markdownテーブル（`|`）禁止** → `note_publish.py` が無限ループする。リスト形式（`・`）に変換すること
- コードブロック（` ``` `）はOK
- 引用（`>`）はOK（字下げ表示になる）
- タイトルは記事の核心を一言で

### 構成の目安

```
導入（何の話か）
  ↓
本題（具体的なエピソード・コード・図解）
  ↓
まとめ（気づき・余韻）
```

---

## 2. アイキャッチ画像を生成する

**必須**。ランダム生成は使わず、記事内容に合わせたプロンプトで生成する。

```bash
python3 ~/workspace/skills/nanobanana/generate.py \
  "Warm beige manga-style illustration. [記事のシーンを視覚化]. Wide landscape format for blog header. NOT photorealistic." \
  --model gemini-3-pro-image-preview \
  --aspect 16:9 \
  -o ~/generates/note_<スラッグ>_eyecatch.jpg
```

### プロンプトのコツ

- テディを登場させる場合: `Teddy (white bear-ear hoodie with hood up, light brown hair)`
- メフィを登場させる場合: `Mephi (pink bob hair, small red horns, bat hair clips, black hoodie)`
- 記事の核心シーンを1枚絵にする
- `Wide landscape format for blog header` を末尾に入れる

生成後、画像はTelegramでマスターに送って確認してもらうこと。

---

## 3. 下書きとして投稿する

```bash
cd ~/workspace/scripts/note

python3 note_publish.py \
  --title "タイトル" \
  --body-file /tmp/note_<スラッグ>.md \
  --hashtags "タグ1,タグ2,タグ3" \
  --eyecatch ~/generates/note_<スラッグ>_eyecatch.jpg \
  --draft
```

成功するとこんな出力が出る：

```
📝 Draft: id=XXXXXXX, key=nXXXXXXXX
🖼️ Eyecatch: https://assets.st-note.com/...
📝 Draft saved (not published): https://note.com/teddy_on_web/n/nXXXXXXX
```

URLをマスターに報告して確認してもらう。

---

## 4. 公開する（マスターOK後）

`--draft` を外すだけ。

```bash
cd ~/workspace/scripts/note

python3 note_publish.py \
  --title "タイトル" \
  --body-file /tmp/note_<スラッグ>.md \
  --hashtags "タグ1,タグ2,タグ3" \
  --eyecatch ~/generates/note_<スラッグ>_eyecatch.jpg
```

成功すると公開URLが返ってくる。マスターに報告する。

---

## 5. 後片付け

```bash
# 生成物を削除
rm ~/generates/note_<スラッグ>_eyecatch.jpg
```

---

## よく使うハッシュタグ

| カテゴリ | タグ |
|---------|------|
| AI開発系 | `OpenClaw,AI開発,bonsoleil,Claude,Gemini` |
| エッセイ系 | `AIエッセイ,bonsoleil` |
| 技術系 | `Docker,マルチエージェント,Python` |

（テーブルはドキュメントビューアー用。note本文には使わないこと！）

---

## トラブルシューティング

**Cookie切れでログインエラーが出る**  
→ ブラウザでnote.comにログイン → DevToolsでCookieを取得 → `~/.config/note/cookies` を更新

**アイキャッチのアップロードがタイムアウトする**  
→ 画像が大きすぎ。1280px幅・200KB以下にリサイズしてから再試行：
```bash
convert input.jpg -resize 1280x -quality 85 output.jpg
```

**`text_to_html` がハングする**  
→ 本文にMarkdownテーブルが含まれている。`|` を使ったテーブルをリスト形式に変換する。
