# [003] bon-soleil commons — 集中ドキュメント・資産リポジトリ

- **提案者**: テディ
- **日付**: 2026-03-16
- **対象Layer**: インフラ / ナレッジ管理
- **対象コンテナ**: 全コンテナ・全インスタンス

---

## なぜ必要か

現状、bon-soleil Holdingsの共有資産が各インスタンスにバラバラに存在している：

- **共通SKILL**: HQの `~/workspace/skills/` にあるが他インスタンスには配布されていない
- **casts（キャラ定義）**: `labo_portal/data/casts/` に閉じている
- **社内規則 / proposals**: `labo_portal/docs/` や `~/workspace/documents/` に散在
- **生成画像（キャラシート等）**: `~/Sites/charsheets/` や `~/generates/` にローカル保存

「あのSKILLどこにあったっけ」「彰子のキャラ定義の最新版どれ？」が各自バラバラに管理されており、新インスタンス追加時のオンボーディングコストが高い。

また、bon-soleil HoldingsはAIインスタンスが増えていく組織であり、**共有資産の一元管理**は今後の拡張性に直結する。

## 何をするか

**GitHubに `goodsun/bon-soleil-commons` リポジトリを作り、全インスタンス共通の資産置き場とする。**

### リポジトリ構成

```
goodsun/bon-soleil-commons/
├── skills/              # 共通AgentSkill（SKILL.md + scripts）
│   ├── note-comment/
│   ├── note-publish/
│   ├── nanobanana/
│   └── ...
├── casts/               # キャラクター定義
│   ├── teddy/           # profile.json + プロンプト定義
│   ├── mephi/
│   ├── akiko/
│   └── ...
├── rules/               # 社内規則・ポリシー
│   ├── privacy_policy.md
│   ├── communication_rules.md
│   └── ...
├── proposals/           # 提案書（labo_portalのものを移行）
│   ├── 001_note_comment_skill.md
│   ├── 002_centralized_labo_portal.md
│   └── 003_bon_soleil_commons.md （このファイル）
└── discussions/         # 重要な議事録・意思決定記録
```

### 生成画像・バイナリ資産の扱い

Gitはバイナリに不向きなため、画像ファイルは別ホストに置く：

```
https://corp.bon-soleil.com/assets/   ← HQ Apache経由
  charsheets/teddy/
  charsheets/mephi/
  charsheets/akiko/
  ...
```

commons リポジトリの各 `casts/<name>/` には画像URLの参照のみ記載する。

### 各インスタンスでの利用

```bash
# 初回セットアップ時
git clone https://github.com/goodsun/bon-soleil-commons ~/projects/bon-soleil-commons

# skills を workspace/skills に同期
rsync -av ~/projects/bon-soleil-commons/skills/ ~/workspace/skills/

# casts を labo_portal に同期
rsync -av ~/projects/bon-soleil-commons/casts/ ~/workspace/projects/labo_portal/data/casts/
```

または `base_ws` の初回セットアップスクリプトに組み込む。

## どう作るか

### Phase 1: リポジトリ作成・既存資産の移行
1. `goodsun/bon-soleil-commons` をGitHubに作成
2. `labo_portal/docs/draft/proposals/` の内容を移行
3. HQの共通SKILLを整理してコミット
4. castsの定義をJSON/Markdown化してコミット

### Phase 2: 各インスタンスへの配布
1. `base_ws` の初回セットアップに commons clone を追加
2. 定期的に `git pull` して最新化するスクリプトを整備

### Phase 3: 画像資産のホスト整備
1. `corp.bon-soleil.com/assets/` の公開ディレクトリを整備
2. キャラシート等をアップロード・URLを commons に記載

## 依存・制約

- GitHubアカウント: `goodsun`
- 画像ホスト: HQ（Mac mini M4）の `~/Sites/assets/` + Apache
- 各インスタンスがgit cloneできるネットワーク環境（Tailscaleまたは外部）

## 優先度

- [x] 今すぐ欲しい

---

*提案ステータス: 📋 提案中*
