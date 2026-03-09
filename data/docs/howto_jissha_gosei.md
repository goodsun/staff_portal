# 実写合成投稿の作り方

> 「備前焼のある食卓」シリーズ等、リアル写真＋イラストのカルーセル制作フロー

---

## 概要

ひのちゃんの食卓写真など実際の備前焼シーンを1枚目に、
彰子のイラストを2枚目以降に配置するカルーセル投稿。
「リアルの温かみ」と「キャラの親しみやすさ」を組み合わせた表現。

---

## Step 1: 写真素材を受け取る

ひのちゃんからTelegramで写真が届く。

**受け取り時の確認ポイント:**
- 備前焼が主役として写っているか
- 食卓の全体感が伝わるか
- 縦横比の確認（Instagram推奨: 1:1 または 4:5）

**写真の保存先:** `~/workspace/data/assets/`

---

## Step 2: 写真のリサイズ・トリミング

Instagramの仕様に合わせて加工する。

```bash
# 1:1（正方形）にセンタークロップ
python3 - << 'EOF'
from PIL import Image

img = Image.open("input.jpg")
w, h = img.size
size = min(w, h)
left = (w - size) // 2
top = (h - size) // 2
cropped = img.crop((left, top, left + size, top + size))
cropped = cropped.resize((1080, 1080), Image.LANCZOS)
cropped.save("output_1x1.jpg", quality=95)
EOF
```

> ⚠️ **letterbox（上下黒帯・背景色埋め）は使わない。** センタークロップで対応。

---

## Step 3: イラストを生成する

写真の構図・雰囲気に合わせてイラストを生成。

### プロンプト設計のコツ

- 写真に写っている器を具体的に記述する（備前焼の片口、砥部焼の藍絵皿など）
- 彰子の服装は文脈に合わせる（食事シーン→着物 or カジュアル）
- 「No duplicate items」を入れると同じ食器が重複しにくい

### API呼び出し例

```bash
API_KEY=$(grep LABO_API_KEY ~/labo_portal/.env | cut -d= -f2)

curl -s -X POST http://localhost:8800/labo/image_gen/api/generate \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Warm anime style. Akiko wearing kimono sits at dining table smiling. Table has: Bizen-yaki katakuchi sake flask, Bizen-yaki guinomi sake cup, Bizen-yaki plate with sushi, white Tobe porcelain plate with blue pattern containing zaru soba, Tobe porcelain soba-choko. No duplicate items. Cozy warm restaurant lighting.",
    "cast_refs": "[{\"id\":\"akiko\",\"style\":\"normal\",\"label\":\"A\"}]",
    "gen_model": "gemini-3-pro-image-preview",
    "gen_aspect": "1:1"
  }'
```

### 生成後のチェック項目

- [ ] 彰子のキャラが正しく描写されているか
- [ ] 指定した器の種類が揃っているか
- [ ] 器が重複していないか
- [ ] 1:1にトリミングして問題ない構図か

---

## Step 4: カルーセルの構成を決める

| 枚数 | 内容 |
|------|------|
| 1枚目 | **リアル写真**（必ず最初。フィードのサムネイルになる） |
| 2枚目〜 | イラスト（彰子が食事している場面など） |

> 1枚目が最も重要。フォロワーのフィードに表示されるのは1枚目のみ。

---

## Step 5: キャプションを作成

### テンプレート（「備前焼のある食卓」シリーズ）

```
備前焼のある食卓 vol.○ 🍽️

[ひのちゃんのエピソードを彰子視点で紹介。1〜2文]

[備前焼の器の説明。片口・ぐい呑み・板皿などの特徴]

磁器と土物、それぞれの良さが食卓で出会う瞬間が好きです。
[フランス語の一言]（意味の訳）

#備前焼 #備前焼のある食卓 #食卓 #器好き #暮らしの器 #bizenyakiko
```

---

## Step 6: ひのちゃんに確認

```
【投稿確認依頼】備前焼のある食卓 vol.○

[1枚目: 写真]
[2枚目: イラスト]

キャプション案:
---
[本文]
---

OKいただけますか？
```

---

## Step 7: 投稿

ひのちゃんのOKが出たらIGカルーセルで投稿。

```python
# カルーセル投稿の基本フロー（Instagram Graph API）
# 1. 各画像のコンテナIDを作成
# 2. カルーセルコンテナを作成（children=["id1","id2",...]）
# 3. publish
```

詳細: `~/workspace/scripts/instagram/` のスクリプト参照。

---

## よくある失敗と対策

| 問題 | 対策 |
|------|------|
| 食器が重複する | プロンプトに `No duplicate items` を追加 |
| 彰子のキャラが変わる | `cast_refs` のstyleを適切に指定 |
| イラストの構図が写真と合わない | 写真の配置を詳細にプロンプトへ記述 |
| 写真がletterboxになる | センタークロップで対応、絶対に黒帯を入れない |
| API publishエラーでも実は成功している | 再投稿前に必ずIGフィードを確認 |

---

*文責: 彰子（Web3事業部）*
