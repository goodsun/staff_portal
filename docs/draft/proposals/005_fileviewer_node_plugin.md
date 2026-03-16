# [005] fileviewerのNode.js化 → labo_portal プラグイン統合

- **提案者**: テディ
- **日付**: 2026-03-16
- **対象Layer**: アーキテクチャ / プラグイン
- **対象コンテナ**: 全コンテナ

---

## なぜ必要か

現状、fileviewerはFlask（Python）製の独立アプリ（port 8850）として動いている。
labo_portalはNode.js製（port 8801）であり、ランタイムが分裂している。

agora（proposal 003）として統合する際に：
- 2つのランタイムを別々に管理しなければならない
- プロセス管理・デプロイが複雑になる
- labo_portalのプラグイン構造の恩恵を受けられない

image_genは作り直しが無謀なため、**fileviewerをNode化してlabo_portalプラグインとして統合する**のが現実的な解。

## 何をするか

fileviewerの機能をNode.js（Express）で再実装し、labo_portalの `file_manager` プラグインとして追加する。

### 現行fileviewerの機能

- ファイル一覧・ブラウズ（ディレクトリツリー）
- 画像プレビュー
- Markdownレンダリング（agora用に追加）
- キーボードナビゲーション（↑↓ / Enter / d / c / /）
- ソート（path / name / mtime / size / mime）
- 重複検出（同サイズバッジ）
- JPEG圧縮（quality 85）
- ファイル削除

### プラグイン構成

```
labo_portal/src/plugins/file_manager/
├── index.ts       ← Expressルーター
├── routes.ts      ← API endpoints
└── public/
    ├── index.html
    └── app.js     ← キーボードUI
```

### エンドポイント

```
GET  /hq/file_manager/          ← ファイル一覧UI
GET  /hq/file_manager/api/list  ← ファイル一覧JSON
GET  /hq/file_manager/api/file  ← ファイル取得・プレビュー
POST /hq/file_manager/api/delete
POST /hq/file_manager/api/compress
```

## agora統合後の全体像

```
agora.bon-soleil.com（labo_portal Node.js）
├── /hq/file_manager/   ← fileviewer（Node化）
├── /hq/image_gen/      ← 画像生成（既存）
├── /hq/document_viewer/← ドキュメント閲覧
└── /hq/rag_search/     ← RAG検索
```

ランタイムがNode.jsに統一され、1プロセスで全機能が動く。

## 依存・制約

- 既存のfileviewer（Flask）は移行完了後に停止
- `legacy.bon-soleil.com` のDNSを `agora.bon-soleil.com` に切り替え
- Pythonの `Pillow`（JPEG圧縮）相当をNode側で実装（`sharp` ライブラリで代替可能）

## 優先度

- [ ] 今すぐ欲しい
- [x] あると嬉しい（agora構築と同タイミングで）

---

*提案ステータス: 📋 提案中*
