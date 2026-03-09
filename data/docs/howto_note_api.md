# note記事投稿 × labo-portal API連携ガイド

## 概要

noteの記事投稿時にアイキャッチ画像を**labo-portal image_gen API**で統一クオリティ生成する運用ガイド。

従来のバラバラなプロンプト指定から、キャラクター設定ベースの安定した画像生成へ移行。

---

## 背景

**従来の課題:**
- アイキャッチ生成プロンプトを毎回手打ち
- スタイル・品質がバラバラ
- キャラクター設定が分散
- 履歴管理が不十分

**labo-portal API化で解決:**
- ✅ キャラクター設定統一（alice + style）
- ✅ モデル・タッチ統一（Gemini 3 Pro + warm manga）
- ✅ 生成履歴管理
- ✅ APIキー認証で安全

---

## 環境変数

### 必須
```bash
export LABO_API_KEY="YOUR_API_KEY"
```

### 推奨
```bash
# 各環境に応じて設定
export LABO_BASE_URL="https://alice.bon-soleil.com/labo"  # EC2本番
# または
export LABO_BASE_URL="http://localhost:8800/mephi"        # Mac Mini本社
# または
export LABO_BASE_URL="http://localhost:8800/alice"        # ローカル開発
```

**設定場所:**
- `~/.bashrc` または `~/.zshrc` に追記
- プロジェクト固有の `.env` ファイル

---

## フロー

### 1. 記事を書く
```bash
~/projects/note/drafts/my_article.md
```

Markdownで記事を執筆。

### 2. アイキャッチ生成（labo-portal API）

**環境変数設定:**
```bash
export LABO_BASE_URL="https://alice.bon-soleil.com/labo"  # または http://localhost:8800/alice
export LABO_API_KEY="YOUR_API_KEY"
```

**基本形（キャラクターなし）:**
```bash
curl -X POST "${LABO_BASE_URL}/image_gen/api/generate" \
  -H "X-API-Key: ${LABO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "final_prompt": "A cozy workspace with a laptop, coffee cup, and notebook. Soft morning light. Warm manga art style, nostalgic, soft golden lighting.",
    "gen_model": "gemini-3-pro-image-preview",
    "gen_aspect": "16:9"
  }'
```

**キャラクター付き（Alice）:**
```bash
curl -X POST "${LABO_BASE_URL}/image_gen/api/generate" \
  -H "X-API-Key: ${LABO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "final_prompt": "A girl sitting at a wooden desk writing in a notebook. Sunlight streaming through window. Cozy room with books and plants.",
    "cast_refs": "[{\"id\":\"alice\",\"style\":\"casual\",\"label\":\"A\"}]",
    "gen_model": "gemini-3-pro-image-preview",
    "gen_aspect": "16:9"
  }'
```

**レスポンス例:**
```json
{
  "ok": true,
  "filename": "gen_1773014185906.png",
  "imgUrl": "/alice/image_gen/img/gen_1773014185906.png",
  "downloadUrl": "/alice/image_gen/img/gen_1773014185906.png"
}
```

**生成画像パス:**
```
~/.openclaw/workspace/data/generated/gen_1773014185906.png
```

### 3. 記事投稿（note_publish.py）

**改良版 note_publish.py:**
- 記事本文を Claude で分析
- シーンに合わせたプロンプト自動生成
- labo-portal API でアイキャッチ生成
- note API で下書き投稿

```bash
python3 ~/projects/note/note_publish.py ~/projects/note/drafts/my_article.md --draft
```

---

## パラメータ一覧

### 必須パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|---|
| `final_prompt` | 生成シーンの説明（英語推奨） | `"A girl reading a book in a library"` |

### 推奨パラメータ

| パラメータ | 説明 | デフォルト | 例 |
|-----------|------|-----------|---|
| `gen_model` | 生成モデル | `gemini-2.5-flash-image` | `gemini-3-pro-image-preview` |
| `gen_aspect` | アスペクト比 | `1:1` | `16:9`, `9:16`, `4:3` |

### オプションパラメータ

| パラメータ | 説明 | 形式 |
|-----------|------|------|
| `cast_refs` | キャラクター参照 | `[{"id":"alice","style":"casual","label":"A"}]` |
| `background_scene` | 背景シーンファイル名 | `scene_library.jpg` |

---

## キャラクター一覧

### alice（アリス）

| style | 説明 | 用途 |
|-------|------|------|
| `normal` | 通常版（青ワンピース） | 汎用 |
| `casual` | カジュアル版 | 日常・リラックス |
| `racing` | BizenyRacing版 | スポーツ・アクティブ |
| `manga` | 漫画風 | イラスト記事 |

### mephi（メフィ）

| style | 説明 | 用途 |
|-------|------|------|
| `main` | 赤ボンデージ | メイン |
| `sub` | 小悪魔コーデ | おしゃれスポット |
| `official` | 白シャツOL | ビジネス・公式 |

### bizenyakiko（彰子）

| style | 説明 | 用途 |
|-------|------|------|
| `normal` | 緑着物 | 和風・備前焼 |

---

## モデル選択ガイド

### gemini-3-pro-image-preview ⭐推奨
- 最高品質
- 日本語テキスト描画完璧
- ref画像の特徴をしっかり反映
- **note アイキャッチはこれ一択**

### gemini-2.5-flash-image
- 速い・安い
- スタイル参照精度◎
- テキスト不要の汎用画像向き

### imagen-4.0-fast-generate-001
- キャラクターrefなしの風景・抽象画像向き
- ref画像非対応

---

## アスペクト比

note記事のアイキャッチは **16:9** 推奨。

| 比率 | 用途 |
|------|------|
| `16:9` | note記事（横長） |
| `1:1` | Instagram投稿 |
| `9:16` | Instagramストーリー |
| `4:3` | ブログサムネイル |

---

## 運用ルール

### API KEY管理
- 環境変数 `LABO_API_KEY` に保存
- スクリプト内にハードコードしない
- ~/.config/ 配下のファイルに保管

### 生成画像の扱い
- 生成直後: `~/.openclaw/workspace/data/generated/`
- note投稿後: そのまま保持（履歴管理）
- 定期クリーンアップ: 3ヶ月以上前のファイルを削除

### プロンプト設計のコツ
- シーン描写は具体的に（"A girl reading" より "A girl sitting in a cozy armchair by the window, reading a leather-bound book"）
- 光源を指定（"soft morning light", "warm sunset glow"）
- 雰囲気を指定（"nostalgic", "peaceful", "energetic"）
- キャラクター名は出さない（cast_refs で指定）

### よくある失敗

#### ❌ プロンプトが短すぎる
```json
{ "final_prompt": "A girl" }
```
→ 背景・構図・雰囲気が不明瞭で品質が安定しない

#### ✅ 正しい例
```json
{
  "final_prompt": "A young woman sitting at a wooden desk near a large window, writing in a journal. Soft afternoon sunlight streaming through lace curtains. Books and a potted plant on the desk. Cozy, peaceful atmosphere. Warm manga art style."
}
```

---

## トラブルシューティング

### 400 Bad Request
- `final_prompt` が空
- `GEMINI_API_KEY` が未設定
- JSON形式エラー

### 401 Unauthorized
- `X-API-Key` ヘッダーが間違っている
- API KEY が未設定

### 生成に時間がかかる
- Gemini 3 Pro は20-30秒かかる（正常）
- timeout 90秒まで待つ

---

## サンプルスクリプト（Python）

```python
import requests
import json
import os

LABO_BASE_URL = os.getenv("LABO_BASE_URL", "http://localhost:8800/alice")
LABO_API_URL = f"{LABO_BASE_URL}/image_gen/api/generate"
LABO_API_KEY = os.getenv("LABO_API_KEY")

def generate_eyecatch(prompt, aspect="16:9", character=None):
    """
    labo-portal API でアイキャッチ生成
    
    Args:
        prompt: シーン説明（英語推奨）
        aspect: アスペクト比（16:9, 1:1, 9:16, 4:3）
        character: キャラクター指定 {"id": "alice", "style": "casual"}
    
    Returns:
        生成画像のローカルパス
    """
    payload = {
        "final_prompt": prompt,
        "gen_model": "gemini-3-pro-image-preview",
        "gen_aspect": aspect
    }
    
    if character:
        cast_refs = [{
            "id": character["id"],
            "style": character.get("style", "normal"),
            "label": "A"
        }]
        payload["cast_refs"] = json.dumps(cast_refs)
    
    headers = {
        "X-API-Key": LABO_API_KEY,
        "Content-Type": "application/json"
    }
    
    response = requests.post(LABO_API_URL, json=payload, headers=headers, timeout=90)
    response.raise_for_status()
    
    result = response.json()
    
    if not result.get("ok"):
        raise Exception(f"Generation failed: {result.get('error')}")
    
    # ローカルパス推定
    filename = result["filename"]
    local_path = os.path.expanduser(f"~/.openclaw/workspace/data/generated/{filename}")
    
    return local_path

# 使用例
if __name__ == "__main__":
    # キャラクターなし
    img_path = generate_eyecatch(
        "A cozy cafe with warm lighting, wooden tables, and plants. Morning sunlight."
    )
    print(f"Generated: {img_path}")
    
    # キャラクター付き
    img_path = generate_eyecatch(
        "A girl working on a laptop in a modern office. Clean, minimalist design.",
        character={"id": "alice", "style": "casual"}
    )
    print(f"Generated: {img_path}")
```

---

## まとめ

labo-portal API を使うことで：

- ✅ アイキャッチ品質が安定
- ✅ キャラクター設定を統一管理
- ✅ スクリプト化が容易
- ✅ 履歴管理が自動

**note記事投稿が、より bon-soleil らしく、より美しくなります** 📝✨

---

*作成: アリス（EC2事業部） 2026-03-09*  
*協力: 彰子（Web3事業部） — APIキー認証機能要望 #17*
