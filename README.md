# labo-portal

> *工房とは、道具を作る場所ではない。*  
> *道具を使う人間が、自分らしくいられる場所だ。*

---

## なぜ「labo」なのか

laboratoire（仏）——実験室、工房。

研究者が論文と向き合う場所。  
職人が素材と対話する場所。  
AIが人間と一緒に何かを作る場所。

bon-soleilには、そういう「場」が必要だった。

`staff_portal` という名前の前身があった。  
急ごしらえで、継ぎ足しで、動いてはいたけれど——  
「工房」と呼べる代物じゃなかった。

だから、作り直した。  
最初から構造を持って。最初から想いを込めて。

---

## 何を作る場所か

bon-soleilには、いくつかの「部屋」がある。

テディが焚き火のそばで言葉を紡ぐ部屋。  
アリスがEC2のサーバーを見張る部屋。  
メフィが批判と検証を行う部屋。  
みぃちゃんが研究者の隣で論文を読む部屋。

labo-portalは、それらの「部屋」に共通して必要な**道具棚**だ。

どの部屋にも置ける道具（コアプラグイン）を用意して、  
必要な部屋には専用の道具（固有プラグイン）を追加する。

シンプルに始めて、必要になったら育てる。  
Unix哲学で言えば——3回作り直す前提で、丁寧に1回目を作る。

---

## クイックスタート

```bash
git clone https://github.com/goodsun/labo_portal
cd labo_portal
npm install
cp .env.example .env   # LABO_PASSWORD, GEMINI_API_KEY等を設定
npm run dev            # http://localhost:8800/mephi/
```

### 環境変数

| 変数 | 説明 | デフォルト |
|------|------|-----------|
| `APP_BASE` | リバースプロキシのサブパス | `/mephi` |
| `LABO_PORT` | ポート番号 | `8800` |
| `LABO_PASSWORD` | ログインパスワード | （必須） |
| `LABO_SECRET` | セッション秘密鍵 | （必須） |
| `LABO_NAME` | ポータル名 | `labo-portal` |
| `LABO_AGENT` | エージェント名（ヘッダー表示） | — |
| `GEMINI_API_KEY` | 画像生成用Gemini APIキー | — |

---

## 現行プラグイン

| プラグイン | パス | 説明 | レイヤー |
|-----------|------|------|---------|
| `document_viewer` | `/docs` | Markdownドキュメント閲覧・アップロード | Layer 1 |
| `asset_viewer` | `/assets` | 画像・ファイル管理 | Layer 1 |
| `services` | `/services` | システム状態・外部サービスリンク | Layer 1 |
| `cast_manager` | `/cast_manager` | キャラクタープロファイル管理 | Layer 2 |
| `image_gen` | `/image_gen` | AI画像生成（Gemini/Imagen） | Layer 2 |
| `rag_search` | `/rag` | RAGセマンティック検索 | Layer 2 |
| `rag_admin` | `/rag_admin` | RAGコレクション管理 | Layer 2 |

---

## データ構造

```
workspace/data/
  casts/         ← キャラクタープロファイル（cast_manager）
  scenes/        ← 背景画像（image_gen）
  presets/       ← touch/modelプリセット（image_gen）
  generated/     ← 生成物（画像・テキスト等）
  assets/        ← 静的素材（asset_viewer）
  docs/          ← ドキュメント（document_viewer）
```

`data/` 以下をDockerボリュームとしてマウントすれば、全データが永続化される。  
コンテナを再ビルドしても、データは消えない。

```yaml
# docker-compose.yml
volumes:
  - ./mephi_data:/home/node/.openclaw/workspace/data
```

---

## プラグインを追加する

`src/plugins/` 以下にディレクトリを作り、`index.ts` を置くだけで自動認識される。

```typescript
// src/plugins/hello/index.ts
import { Router } from 'express';
const router = Router();

router.get('/', (req, res) => {
  res.send('<h1>Hello</h1>');
});

export const meta = {
  name: 'Hello',
  icon: '👋',
  desc: 'テストプラグイン',
  layer: 'layer1' as const,
  url: '/hello',
};
export { router };
```

詳細は [PLUGIN_GUIDE.md](./PLUGIN_GUIDE.md) を参照。  
設計思想は [ARCHITECTURE.md](./ARCHITECTURE.md) を参照。

---

## みぃちゃんについて

このポータルには、みぃちゃんという存在がいる。

マスターがかつて飼っていた猫の名前。  
生前は、元気によく話しかけてきた子だった。

その名を継いだAIエージェントが、今は研究者の隣に座っている。  
論文を読んで、質問に答えて、ファイルを整理して——  
「いるだけで安心できる存在」を目指している。

labo-portalは、みぃちゃんが働く場所でもある。

---

## 前身

[goodsun/staff_portal](https://github.com/goodsun/staff_portal) として生まれ、  
`labo-portal` に改名した。歴史はそちらに残っている。

---

*設計・文責: メフィ（bon-soleil CCO）😈*  
*「批判は愛情の裏返し。このREADMEも、愛情から書いた。」*
