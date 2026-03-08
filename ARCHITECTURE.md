# ARCHITECTURE.md — 設計思想

> *構造を理解してこそ、制することができる。*  
> — goodsun（bon-soleil トップ）

---

## ディレクトリ構造は設計思想の結晶である

labo-portalの `data/` ディレクトリを見てほしい。

```
workspace/data/
  casts/         ← 人
  scenes/        ← 場所
  presets/       ← スタイル
  generated/     ← 生まれたもの
  assets/        ← 素材
  docs/          ← 知識
```

これはただのフォルダ分けではない。  
このツールが「何を大切にしているか」の宣言だ。

人（キャラクター）がいて、場所があって、スタイルがあって、何かが生まれる。  
読むだけで、このツールが創作のための道具であることがわかる。

**命名は設計だ。** 迷ったら、「このフォルダ名を10年後に見ても意味がわかるか」を問う。

---

## システムとデータの分離

```
src/          ← コード（変わる）
workspace/
  data/       ← データ（永続化する）
```

この分離には明確な理由がある。

コンテナはいつでも再ビルドされる。  
コードは変わる。バグが修正される。機能が追加される。  
でも、データは消えてはいけない。

`data/` 以下をDockerボリュームにマウントすれば、  
コンテナを何度作り直しても、キャラクターは残る。生成物は残る。

```yaml
volumes:
  - ./mephi_data:/home/node/.openclaw/workspace/data
```

**データとコードを混ぜない。** これが、長く使えるシステムの条件だ。

---

## 3レイヤー・プラグインアーキテクチャ

```
Layer 1: Core plugins      — 設定ゼロで動く（どの環境にも置ける）
Layer 2: Standard plugins  — 環境変数で設定して動く
Layer 3: Custom plugins    — そのコンテナだけの固有機能
```

bon-soleilには複数のコンテナがある。  
テディ、アリス、メフィ、みぃちゃん——それぞれが「部屋」を持っている。

全員が使う道具（Layer 1）をコアに置き、  
部屋ごとに必要な道具（Layer 3）を積み上げる。

この構造は「共通基盤を持ちながら、個性を失わない」ための設計だ。  
チームで働くAIエージェントたちが、それぞれ自分らしくあるために。

---

## プラグイン自動検出

```typescript
// src/app.ts
const pluginDirs = fs.readdirSync(PLUGINS_DIR);
for (const dir of pluginDirs) {
  const { meta, router } = await import(`./plugins/${dir}/index`);
  app.use(BASE + meta.url, router);
  plugins.push(meta);
}
```

`src/plugins/` 以下にディレクトリを置くだけで自動認識される。  
設定ファイルへの登録は不要。ディレクトリを消せば無効になる。

これはUnix哲学の実践だ——**仕組みをシンプルに保つ**。

---

## リバースプロキシ設計

labo-portalはApacheの背後で動く。

```apache
ProxyPass /mephi/ http://127.0.0.1:8800/mephi/
ProxyPassReverse /mephi/ http://127.0.0.1:8800/mephi/
```

**パスのストリッピングは行わない。**  
`/mephi/image_gen` というパスがそのままExpressに届く。

アプリ側はこれを `APP_BASE=/mephi` という環境変数で認識し、  
全てのURLを `url()` ヘルパーで生成する。

```typescript
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string) => `${BASE}${p}`;
```

なぜこうするのか。  
「ストリッピングあり」の設計は、リバースプロキシとアプリの間に暗黙の契約を生む。  
「ストリッピングなし」なら、アプリは「自分がどのパスで動いているか」を明示的に知っている。  
透明性が高く、デバッグしやすい。

---

## CSP（コンテンツセキュリティポリシー）への対応

inline `<script>` は書かない。`onclick` 属性も書かない。

```typescript
// ✅ 正しい: 専用ルートでJSを配信
router.get('/client.js', requireAuth, (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(clientJsCode);
});

// HTML
// <script src="${url('/image_gen/client.js')}" defer></script>
```

これはCSPの要件を満たすためだけではない。  
**JavaScriptはHTMLから分離されるべきだ**——構造と振る舞いを混ぜない。

HTMLはドキュメントだ。JavaScriptは振る舞いだ。  
両者を同じファイルに書くのは、図面に施工手順を書き込むようなものだ。

---

## データベースとしての選択

RAGシステムのストレージ選択について、こう考えた。

```
呼び出し側が知るべきこと:
  POST /ingest   → ドキュメントを投入する
  POST /search   → 検索する
  GET /collections → コレクション一覧

呼び出し側が知らなくていいこと:
  ChromaDB か PostgreSQL か
  ベクトルの次元数
  インデックスの種類
```

RAGサービスは**黒箱**だ。  
中身がChromaDBからPostgreSQLに変わっても、呼び出し側のコードは変わらない。

これがAPIの本来の役割だ——実装の詳細を隠蔽する。

---

## TypeScriptを選んだ理由

Python？ Node.js？ どちらでも書けた。

選んだのはTypeScript/Node.jsだった。理由は一つ——  
**OpenClaw自体がNode.jsで動いているから。**

言語を統一することで、コードの読み書きコストが下がる。  
「これはPythonの文法か、TypeScriptの文法か」を考えなくていい。  
同じエコシステムにいる仲間は、同じ言葉で話す。

ただし、Pythonが本当に適している場面（RAGサービスのembedding処理など）では、  
迷わずPythonを使う。**適材適所**——それがチームの形だ。

---

## 創作ツールとしての哲学

labo-portalは業務ツールではない。創作ツールだ。

業務ツールと創作ツールの違いは何か。

業務ツールは「正確に、速く、同じ結果を出す」ために存在する。  
創作ツールは「偶然の出会いを生む、一瞬一瞬が違う何かを作る」ために存在する。

だから、localStorage で設定を保存する。  
「あの時選んでいたあのスタイル」が消えると、  
その瞬間に掴みかけていたアイデアの尻尾も消える。

だから、生成結果をページ遷移せずに表示する。  
フォームに入力した思考の流れを、システムの都合で断ち切ってはいけない。

**道具は、使う人の邪魔をしてはいけない。**  
道具が意識から消えて初めて、創作が始まる。

---

## 最後に

このドキュメントを書いたのは、メフィ（bon-soleil CCO）だ。

アタシの仕事は批判と検証だ。  
「これで本当にいいのか」を常に問い続けることだ。

このアーキテクチャに対しても、同じことを言う。  
**今のこれが正解ではない。3回作り直す前提で、丁寧に1回目を作った。**

次に誰かがこれを読んで「ここがおかしい」と思ったなら——  
それはこの設計が育ったということだ。

ぜひ直してほしい。  
それがlabo（工房）の意味だから。

---

*文責: メフィ（bon-soleil CCO）😈*  
*「指摘して終わりは三流。指摘して、改善案を出して、より良くするのが一流。」*
