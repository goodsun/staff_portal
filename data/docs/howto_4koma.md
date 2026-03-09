# 4コマ漫画の作り方

> 「備前焼のヒミツ」シリーズの制作フロー

---

## 概要

備前焼の豆知識を4コマ漫画で楽しく伝えるシリーズ。
日本語版と英語版を別日に投稿することで、1本の漫画から2日分のコンテンツを生む。

---

## Step 1: テーマを決める

備前焼の「ヒミツ」になるテーマを1つ選ぶ。

**テーマ例:**
- 胡麻（ごま）— 灰が降り積もって自然釉になる現象
- 緋襷（ひだすき）— わら灰が触れてできる赤い模様
- 窯変（ようへん）— 炎の流れで生まれる偶然の色
- すり鉢 — 備前焼の実用的な名品

**コツ:** 「知らなかった！」と思ってもらえるネタが刺さる。専門用語は1つまで。

---

## Step 2: 4コマのストーリーを組む

| コマ | 役割 | 内容例 |
|------|------|--------|
| 1コマ目 | 起：日常の疑問 | 彰子が備前焼を手に取って「なんでこんな模様が…？」 |
| 2コマ目 | 承：探求 | 師匠に聞く／本で調べる |
| 3コマ目 | 転：驚きの発見 | 「え！灰が降り積もって自然にできるの！？」 |
| 4コマ目 | 結：感動・まとめ | 「備前焼ってすごい…！」＋豆知識テキスト |

**タイトル形式:** `備前焼のヒミツ vol.○○「テーマ」`（必須）

---

## Step 3: 画像生成

### セリフ・コマ割りを先に確定する（重要）

画像生成の前に、必ずセリフとコマ割りを日本語で書き出す。
「絵ありき」ではなく「ストーリーありき」で作ること。

```
1コマ目: [シーン説明] セリフ:「○○」
2コマ目: [シーン説明] セリフ:「○○」
3コマ目: [シーン説明] セリフ:「○○」
4コマ目: [シーン説明] セリフ:「○○」
```

### プロンプト設計のコツ

**日本語セリフはプロンプトに直接書く。** Geminiは日本語テキストを吹き出し内に描画できる。

```
4-panel manga comic strip, vertical layout, warm beige-toned soft manga style.
Each panel has speech bubbles with EXACT Japanese text written inside clearly and legibly.
Panel 1 (top): [シーン説明]. Speech bubble: 「セリフ」
Panel 2: [シーン説明]. Speech bubble: 「セリフ」
Panel 3: [シーン説明]. Speech bubble: 「セリフ」
Panel 4 (bottom): [シーン説明]. Speech bubble: 「セリフ」
The Japanese text inside speech bubbles must be clearly readable.
```

> ✅ `must be clearly readable` を入れると文字が丁寧に描かれる  
> ✅ `EXACT Japanese text` と強調すると指定セリフが優先される  
> ✅ `Panel 1 (top)` / `Panel 4 (bottom)` でコマ位置を明示する

### API呼び出し例

```bash
# BASE_URLは環境に合わせて変更（bizeny: /labo, mephi: /mephi, hq: /hq）
BASE_URL="http://localhost:8800/labo"
API_KEY=$(grep LABO_API_KEY ~/labo_portal/.env | cut -d= -f2)

curl -s -X POST ${BASE_URL}/image_gen/api/generate \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "4-panel manga comic strip, vertical layout, warm beige-toned soft manga style. Each panel has speech bubbles with EXACT Japanese text written inside clearly and legibly. Panel 1 (top): Akiko picks up a Bizen-yaki cup and notices grey spots, speech bubble: 「なんでこんな模様が…？」. Panel 2: She asks her sensei, speech bubble: 「先生、これって何ですか？」. Panel 3: Sensei explains with a smile, speech bubble: 「窯の灰が降り積もって自然にできる釉薬なんだよ」. Panel 4 (bottom): Akiko amazed, title text visible: 備前焼のヒミツ vol.XX「胡麻」, speech bubble: 「自然がつくる模様なんですね…！」. The Japanese text inside speech bubbles must be clearly readable.",
    "cast_refs": "[{\"id\":\"akiko\",\"style\":\"4koma\",\"label\":\"A\"}]",
    "gen_model": "gemini-3-pro-image-preview",
    "gen_aspect": "9:16"
  }'
```

> ⚠️ アスペクト比は `9:16` 推奨（縦長4コマに最適）

### 生成後のチェック項目

- [ ] 各コマのセリフが正確に読めるか
- [ ] タイトル「備前焼のヒミツ vol.XX」が入っているか
- [ ] 彰子の顔・キャラが一貫しているか
- [ ] コマの順番が正しいか（上→下）
- [ ] 文字が潰れていないか（小さすぎないか）

---

## Step 4: ひのちゃんに確認

投稿前に必ずTelegramでひのちゃん（@NiyachanNiya）に画像＋キャプション案を送る。

```
【4コマ漫画 確認依頼】
タイトル: 備前焼のヒミツ vol.XX「テーマ」
投稿予定: ○月○日（日本語版）、翌日（英語版）

[画像添付]

キャプション案:
---
[キャプション本文]
---
OKいただけますか？
```

---

## Step 5: キャプション作成

### 日本語版テンプレート

```
備前焼のヒミツ vol.XX「テーマ」🏺

[テーマの説明を2〜3文で。彰子の視点で。]

[フランス語の一言感想]（意味の日本語訳）

#備前焼 #備前焼のヒミツ #陶芸 #焼き物 #bizenyakiko
```

### 英語版テンプレート

```
Secrets of Bizen-yaki vol.XX "Theme" 🏺

[English explanation, 2-3 sentences from Akiko's perspective]

[French phrase] ([English translation])

#bizenyaki #pottery #japanesepottery #ceramics #bizenyakiko
```

---

## 運用ルール

- 日本語版と英語版は**必ず別の日に投稿**する
- 4コマの日とそれ以外の日（陶芸/友達エピソード）を交互に
- cronによる自動投稿は禁止 — 必ずひのちゃんOK後に手動投稿

---

*文責: 彰子（Web3事業部）*

