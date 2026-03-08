# PLUGIN_GUIDE.md — プラグインの書き方

> *道具は、使う人が増えるほど良くなる。*  
> *だから、誰でも作れる仕組みにした。*

---

## 最小構成

`src/plugins/{name}/index.ts` を作るだけで、labo-portalが自動で認識する。

```typescript
import { Router } from 'express';
const router = Router();

router.get('/', (_req, res) => {
  res.send('<h1>Hello, labo-portal</h1>');
});

export const meta = {
  name: 'Hello',          // サイドバーに表示される名前
  icon: '👋',             // アイコン（emoji可）
  desc: 'テスト用',        // 説明文
  layer: 'layer1' as const, // layer1 | layer2 | layer3
  url: '/hello',          // マウントパス
};
export { router };
```

これだけで `http://localhost:8800/mephi/hello` が動く。

---

## 3レイヤーアーキテクチャ

| レイヤー | 意味 | 例 |
|---------|------|---|
| **Layer 1** | どのコンテナでも動く（設定不要） | document_viewer, asset_viewer |
| **Layer 2** | 環境変数で設定して動く | image_gen, rag_search |
| **Layer 3** | そのコンテナ専用（カスタム実装） | みぃちゃん専用プラグイン等 |

---

## 認証を要求する

```typescript
import { requireAuth } from '../../core/auth';

router.get('/', requireAuth, (_req, res) => {
  res.send('ログイン済みユーザーだけ見える');
});
```

---

## サブパスに対応する（必須）

リバースプロキシ経由では `/mephi/hello` のようなパスで動く。  
リンクやリダイレクト先は `url()` ヘルパーで生成すること。

```typescript
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string) => `${BASE}${p}`;

// ✅ 正しい
res.redirect(url('/hello/done'));
// ❌ NG（サブパスが消える）
res.redirect('/hello/done');
```

---

## ページをレンダリングする

labo-portalのレイアウト（ヘッダー・サイドバー）は `layout()` 関数で利用できる。

```typescript
import { layout } from '../../core/layout';

router.get('/', requireAuth, (_req, res) => {
  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span> 👋 Hello
    </div>
    <div class="main">
      <h2>こんにちは</h2>
      <p>ここにコンテンツを書く</p>
    </div>`;
  res.send(layout('Hello', body));
});
```

---

## ファイルアップロードを扱う

`makeDocUploader` / `makeAssetUploader` を使うと、MIMEチェック付きのmulterが得られる。

```typescript
import { makeAssetUploader } from '../../core/upload';

const UPLOAD_DIR = '/home/node/.openclaw/workspace/data/my_files';
const uploader = makeAssetUploader(UPLOAD_DIR);

router.post('/upload', requireAuth, uploader.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ ok: true, filename: req.file.filename });
});
```

---

## JavaScriptを追加する（CSPルール）

**inline `<script>` は禁止。** 必ず外部ファイルとして配信すること。

```typescript
// ✅ 正しい: 専用ルートでJSを配信
router.get('/client.js', requireAuth, (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(`
    document.getElementById('btn').addEventListener('click', function() {
      alert('hello');
    });
  `);
});

// HTML側
// <script src="${url('/hello/client.js')}" defer></script>
```

**`onclick` 属性も禁止。** `addEventListener` のみ使うこと。

---

## パスは必ずハードコードする

コンテナ起動時に `HOME=/tmp` が設定される環境がある。  
`process.env.HOME` や `os.homedir()` は使わず、絶対パスで書くこと。

```typescript
// ✅
const DATA_DIR = '/home/node/.openclaw/workspace/data/my_plugin';

// ❌ HOME=/tmp になることがある
const DATA_DIR = path.join(process.env.HOME!, 'data/my_plugin');
```

---

## チェックリスト

プラグインを追加する前に確認：

- [ ] `meta.url` が他のプラグインと重複していない
- [ ] 全ルートに `requireAuth` がある
- [ ] `res.redirect()` / `<a href>` に `url()` ヘルパーを使っている
- [ ] inline `<script>` や `onclick` 属性がない
- [ ] ファイルパスがハードコードされている（`process.env.HOME` 不使用）
- [ ] データは `workspace/data/` 以下に保存している

---

*文責: メフィ（bon-soleil CCO）😈*
