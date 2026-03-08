# workspace 移行ガイド — data/ディレクトリ構造への統一

*2026-03-08 作成: メフィ（CCO）*

---

## ゴール：最終形

```
workspace/
  # OpenClaw システムファイル（ここに置く、移動しない）
  AGENTS.md
  HEARTBEAT.md
  IDENTITY.md
  MEMORY.md
  SOUL.md
  TOOLS.md
  USER.md
  memory/          ← 日次メモリログ
  skills/          ← OpenClawスキル

  # 開発中プロジェクト（GitHubへ上がったら削除）
  projects/
    {project_name}/  ← 開発中はここ、完成→GitHub→削除
  labo_portal/     ← 既存（次のメジャーバージョン時にprojects/へ整理）

  # 全データ（Dockerボリュームでマウント）
  data/
    casts/         ← キャラクタープロファイル + 画像
    scenes/        ← 背景画像（image_gen用）
    presets/       ← touch/model presets（image_gen用）
    generated/     ← 生成物（画像・テキスト）
    assets/        ← 静的素材
    docs/          ← ドキュメント・設計書・メモ
    drafts/        ← note記事草稿 + アイキャッチ
```

> **注**: `scripts/` は最終形に含まない。スクリプト類はGitHubリポジトリで管理するか、`skills/`に昇格させること。一時スクリプトは使い捨てとし、workspaceに残さない。

### system と data の境界線

| 種別 | 置き場所 | 理由 |
|------|---------|------|
| OpenClawシステムファイル | `workspace/` 直下 | OpenClawが管理する |
| 開発中のソースコード | `workspace/projects/` | 一時的。GitHub移管後は削除 |
| 完成・稼働中のアプリ | `workspace/{name}/` | systemとして扱う |
| 永続化が必要なデータ | `workspace/data/` | Dockerボリュームで保護 |

**原則**: 開発中はdata（変わる）、完成したらsystem（守る）。  
プロジェクトソースはGitHubに上がった瞬間にsystemへと昇格する。

---

## 移行マッピング

### 旧 → 新

| 旧パス | 新パス | 状態 |
|--------|--------|------|
| `workspace/assets/` | `data/assets/` | ✅ 完了（旧を削除すること） |
| `workspace/generated_images/` | `data/generated/` | ✅ 完了（旧を削除すること） |
| `workspace/uploads/docs/` | `data/docs/` | ✅ 完了（旧を削除すること） |
| `workspace/presets.json` | `data/presets.json` ※未使用 | 削除OK |
| `workspace/note_ideas.md` | `data/docs/note_ideas.md` | 要移行 |
| `workspace/note_mephi_20260305.md` | `data/docs/note_mephi_20260305.md` | 要移行 |
| `workspace/note_posting_guide.md` | `data/docs/note_posting_guide.md` | 要移行 |
| `workspace/note_drafts/` | `data/drafts/` | 要移行 |

### 要判断ファイル

| ファイル | 内容 | 判断 |
|---------|------|------|
| `workspace/mephi_chat.js` | 焚き火チャット実行スクリプト | → `data/docs/`か`scripts/`、または削除 |
| `workspace/rag_search.js` | RAG検索スクリプト（旧） | → `skills/`に移動、または削除 |
| `workspace/rag_service/` | RAGサービス定義（GitHubにもある） | → 削除（labo_portal repoに移管済み） |
| `workspace/mephi.log` | ログファイル | → 削除 |
| `data/casts/::w` | vim操作ミスで生成されたファイル | → 削除 |
| `data/casts/.git/` | castsの旧gitリポジトリ | → 削除（staff_portal時代の残骸） |

---

## 実施手順

### Step 1: workspace直下の散在ファイルをdata/docs/に移動

```bash
mv workspace/note_ideas.md workspace/data/docs/
mv workspace/note_mephi_20260305.md workspace/data/docs/
mv workspace/note_posting_guide.md workspace/data/docs/
```

### Step 2: note_draftsをdata/drafts/に移動

```bash
mv workspace/note_drafts workspace/data/drafts
```

### Step 3: 旧ディレクトリの削除（**必ず確認してから削除**）

```bash
# ⚠️ 削除前に必ずdata/側にファイルが揃っているか確認する
ls -la workspace/data/assets/
ls -la workspace/data/docs/
ls -la workspace/data/generated/

# 確認できたら削除
rm -rf workspace/assets/
rm -rf workspace/generated_images/
rm -rf workspace/uploads/
rm -f workspace/presets.json
```

### Step 4: 要判断ファイルの処理

```bash
rm workspace/mephi.log
rm -rf workspace/rag_service/        # GitHubリポジトリに存在するため
rm workspace/rag_search.js           # skills/hq-rag-searchに移管済み
rm workspace/mephi_chat.js           # 焚き火チャットはAliceのEC2で管理（campfireリポジトリ）
```

> `mephi_chat.js` はlabo-portalのスコープ外。campfire本体はAliceのEC2にあり、ローカルに置く理由がない。

### Step 5: data/casts/の掃除（**移管確認後に削除**）

```bash
# ⚠️ .git/を消す前に、labo_portalリポジトリにcasts全データが存在するか確認する
# GitHubの goodsun/labo_portal または staff_portal でキャスト画像・profile.jsonを確認すること

# 確認できたら削除
rm workspace/data/casts/'::w'        # vim誤操作ファイル
rm -rf workspace/data/casts/.git/   # 旧gitリポジトリ（staff_portal時代の残骸）
```

---

## 完了後の確認チェックリスト

- [ ] `workspace/assets/` が存在しない
- [ ] `workspace/generated_images/` が存在しない
- [ ] `workspace/uploads/` が存在しない
- [ ] `workspace/presets.json` が存在しない
- [ ] `workspace/note_*.md` が存在しない（data/docs/に移動済み）
- [ ] `workspace/note_drafts/` が存在しない（data/drafts/に移動済み）
- [ ] `data/casts/::w` が存在しない
- [ ] `data/casts/.git/` が存在しない
- [ ] `data/docs/` に全ドキュメントが揃っている
- [ ] `data/drafts/` にnote草稿が揃っている

---

## 注意事項

- **OpenClawシステムファイル**（AGENTS.md等）は `workspace/` 直下に置く。`data/`に移動しない。
- **`data/`はDockerボリューム**としてHQの`mephi_data/`にマウントされている。削除・移動はコンテナとHQ両方に反映される。
- `mephi_chat.js`は焚き火チャット用スクリプト。保存するなら`workspace/scripts/`等に整理する。

---

*文責: メフィ（CCO）😈 — 2026-03-08*
