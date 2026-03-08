# workspace 移行ガイド — data/ディレクトリ構造への統一

*2026-03-08 作成: メフィ（CCO） / レビュー: テディ🧸・彰子🏺*

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
  labo_portal/     ← 既存稼働中アプリ（次のメジャーバージョンで整理）

  # 全データ（Dockerボリュームでマウント）
  data/
    casts/         ← キャラクタープロファイル + 画像
    scenes/        ← 背景画像（image_gen用）※新規作成、旧パスなし
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
| `workspace/assets/` | `data/assets/` | ✅ 完了（旧削除済み） |
| `workspace/generated_images/` | `data/generated/` | ✅ 完了（旧削除済み） |
| `workspace/uploads/docs/` | `data/docs/` | ✅ 完了（旧削除済み） |
| `workspace/presets.json` | `data/presets/` ※labo-portal管理に移行 | ✅ 削除済み |
| `workspace/note_ideas.md` | `data/docs/note_ideas.md` | ✅ 完了 |
| `workspace/note_mephi_20260305.md` | `data/docs/note_mephi_20260305.md` | ✅ 完了 |
| `workspace/note_posting_guide.md` | `data/docs/note_posting_guide.md` | ✅ 完了 |
| `workspace/note_drafts/` | `data/drafts/` | ✅ 完了 |
| `data/scenes/` | — | ✅ 新規作成（旧パスなし） |

### 処理済みファイル

| ファイル | 判断 |
|---------|------|
| `workspace/mephi_chat.js` | ✅ 削除（campfireはAliceのEC2管理） |
| `workspace/rag_search.js` | ✅ 削除（skills/hq-rag-searchに移管済み） |
| `workspace/rag_service/` | ✅ 削除（goodsun/labo_portal repoに移管済み） |
| `workspace/mephi.log` | ✅ 削除 |
| `data/casts/::w` | ✅ 削除（vim誤操作ファイル） |
| `data/casts/.git/` | ✅ 削除（staff_portal時代の残骸） |

---

## 実施手順（次回以降の参考）

### Step 0: バックアップを取る（**必須**）

```bash
# 作業前に必ずバックアップを取ること
tar czf backup_$(date +%Y%m%d).tar.gz workspace/data/
echo "バックアップ完了: backup_$(date +%Y%m%d).tar.gz"
```

> ⚠️ `data/casts/.git/` 削除など取り返しのつかない操作の前は特に重要。

### Step 1: コンテナ状態の確認

```bash
# data/はDockerボリュームでマウントされている
# コンテナ起動中でもファイル操作は可能だが、
# アプリが参照中のファイルを削除する場合はコンテナを停止してから行う
docker ps | grep mephi   # コンテナ状態確認
```

> **安全な操作（起動中でも可）**: ファイルの追加・移動  
> **要停止**: アプリが参照中のファイルの削除・名前変更

### Step 2: workspace直下の散在ファイルをdata/docs/に移動

```bash
mv workspace/note_ideas.md workspace/data/docs/
mv workspace/note_mephi_20260305.md workspace/data/docs/
mv workspace/note_posting_guide.md workspace/data/docs/
```

### Step 3: note_draftsをdata/drafts/に移動

```bash
mv workspace/note_drafts workspace/data/drafts
```

### Step 4: 旧ディレクトリの削除（**確認してから削除**）

```bash
# ⚠️ 削除前に data/側のファイル数を旧パスと比較して確認する
echo "旧 assets:" && ls workspace/assets/uploads/ | wc -l
echo "新 assets:" && ls workspace/data/assets/uploads/ | wc -l

echo "旧 generated_images:" && ls workspace/generated_images/ | wc -l
echo "新 generated:"        && ls workspace/data/generated/ | wc -l

echo "旧 uploads/docs:" && ls workspace/uploads/docs/ | wc -l
echo "新 docs:"         && ls workspace/data/docs/ | wc -l

# 一致を確認してから削除
rm -rf workspace/assets/
rm -rf workspace/generated_images/
rm -rf workspace/uploads/
rm -f workspace/presets.json
```

### Step 5: 不要ファイルの削除

```bash
rm workspace/mephi.log
rm -rf workspace/rag_service/        # GitHubリポジトリに存在するため
rm workspace/rag_search.js           # skills/hq-rag-searchに移管済み
rm workspace/mephi_chat.js           # 焚き火チャットはAliceのEC2管理
```

### Step 6: data/casts/の掃除（**GitHubで移管確認後に削除**）

```bash
# ⚠️ .git/を消す前に、GitHubでcasts全データが確認できること
# https://github.com/goodsun/labo_portal (または staff_portal) で
# キャスト画像・profile.jsonの存在を確認すること

rm workspace/data/casts/'::w'        # vim誤操作ファイル
rm -rf workspace/data/casts/.git/   # 旧gitリポジトリ（staff_portal時代の残骸）
```

### labo_portal/を移動する場合（将来）

`labo_portal/` を `projects/labo_portal/` 等に移動する際は以下が必要：

```bash
# 1. labo-portalを停止
pkill -f 'ts-node.*app.ts'

# 2. ディレクトリ移動
mv workspace/labo_portal workspace/projects/labo_portal

# 3. Apache設定・HEARTBEAT.mdのパスを更新
#    /etc/apache2/sites-enabled/*.conf のProxyPass
#    workspace/HEARTBEAT.md のcd コマンド

# 4. labo-portal再起動
cd workspace/projects/labo_portal && HOME=/tmp nohup node_modules/.bin/ts-node src/app.ts >> /tmp/labo_portal.log 2>&1 &
```

---

## 完了後の確認チェックリスト

```bash
# 旧ディレクトリが存在しないことを確認
[ ! -d workspace/assets ]           && echo "✅ assets/ なし" || echo "❌ assets/ 残存"
[ ! -d workspace/generated_images ] && echo "✅ generated_images/ なし" || echo "❌ generated_images/ 残存"
[ ! -d workspace/uploads ]          && echo "✅ uploads/ なし" || echo "❌ uploads/ 残存"
[ ! -f workspace/presets.json ]     && echo "✅ presets.json なし" || echo "❌ presets.json 残存"
[ ! -f workspace/mephi_chat.js ]    && echo "✅ mephi_chat.js なし" || echo "❌ mephi_chat.js 残存"

# data/に必要なディレクトリが揃っていることを確認
for d in casts scenes presets generated assets docs drafts; do
  [ -d workspace/data/$d ] && echo "✅ data/$d" || echo "❌ data/$d なし"
done

# ドキュメントの存在確認
echo "data/docs/ ファイル数: $(ls workspace/data/docs/ | wc -l)"
echo "data/drafts/ ファイル数: $(ls workspace/data/drafts/ | wc -l)"
```

---

## 注意事項

- **OpenClawシステムファイル**（AGENTS.md等）は `workspace/` 直下に置く。`data/`に移動しない。
- **`data/`はDockerボリューム**: HQの`mephi_data/`にマウント。削除・移動はコンテナとHQ両方に即座に反映される。
- **作業前バックアップは必須**: `tar czf backup_YYYYMMDD.tar.gz workspace/data/`
- **scripts/は作らない**: 一時スクリプトは`/tmp/`に置くか、スキルとして`skills/`に昇格させること。

---

*文責: メフィ（CCO）😈 — 2026-03-08*  
*レビュー: テディ🧸（4点指摘）、彰子🏺（6点指摘）→ 全項目対応済み*
