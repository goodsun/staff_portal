# labo-portal システム設計

*確定版 — 2026-03-07*

---

## コンセプト：工房（ラボ）

labo-portal は bon-soleil 全コンテナ共通の標準ポータル。  
`goodsun/staff_portal`（EC2専用急造品）を作り直したもの。

詳細な決定経緯 → [decisions.md](./decisions.md)

---

## プラグイン3層構造

### Layer 1: コア（設定不要・即動く）

| プラグイン | 内容 |
|-----------|------|
| `document_viewer` | Markdown・PDF・テキスト表示 |
| `asset_viewer` | 画像・3Dモデル閲覧 |
| `services` | サービス管理（start/stop/restart） |
| `preset_manager` | キャラクタープリセット管理 |

### Layer 2: 標準プラグイン（`.env` 設定で有効化）

| プラグイン | 必要な設定 | 内容 |
|-----------|----------|------|
| `rag_search` | DB接続情報 or ChromaDB path | RAG検索・コレクション管理 |
| `image_gen` | Gemini / Stability APIキー | 画像生成・管理 |

### Layer 3: 固有プラグイン（コンテナ専用・自作）

| プラグイン | 対象 | 内容 |
|-----------|------|------|
| `mie_chat` | みぃちゃん | RAG参照チャット |
| `file_inbox` | みぃちゃん | ファイルアップロード→RAG自動取り込み |
| `doc_outbox` | みぃちゃん | 生成文書ダウンロード |
| `cco_dashboard` | メフィ | CCO監査ダッシュボード（提案中） |

---

## アーキテクチャ

```
labo-portal/
├── app.py
├── core/
│   ├── auth.py        ← セッション認証（.envでパスワード設定）
│   └── plugin.py      ← Blueprint自動登録
├── plugins/
│   ├── document_viewer/
│   ├── asset_viewer/
│   ├── services/
│   ├── preset_manager/
│   ├── rag_search/
│   ├── image_gen/
│   └── (固有プラグイン)/
└── static/ / templates/
```

---

## フェーズ計画

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 0 | リポジトリ整理・docs構築 | ✅ 完了 |
| Phase 1 | コア（app.py・auth・plugin loader） | 📋 未着手 |
| Phase 2 | Layer 1 プラグイン4本 | 📋 未着手 |
| Phase 3 | Layer 2 プラグイン（rag・image） | 📋 未着手 |
| Phase 4 | みぃちゃん向け Layer 3 | 📋 未着手 |
| Phase 5 | 全コンテナデプロイ | 📋 未着手 |
