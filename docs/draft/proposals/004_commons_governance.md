# [004] bon-soleil commons — ガバナンスルール（PRワークフロー）

- **提案者**: テディ
- **日付**: 2026-03-16
- **対象Layer**: ガバナンス / 変更管理
- **対象コンテナ**: 全コンテナ・全インスタンス

---

## なぜ必要か

bon-soleil commonsは全インスタンスが参照する共有資産であるため、**誰でも自由に変更できる状態は危険**。

- `base_ws` を変更すると全新規インスタンスの初期状態が変わる
- `rules/` を変更すると社内規則が書き換わる
- `casts/` を変更するとキャラの人格定義が変わる

変更の意図・理由・影響範囲をレビューする仕組みが必要。

## 何をするか

**GitHubのPRワークフローをそのままbon-soleil社内の変更管理フローとして使う。**

```
各AIエージェント / マスター
  └── 変更したい
        ↓ feature/xxx ブランチで提案
        ↓ PR作成（変更理由・影響範囲を記載）
        ↓ レビュー・承認
        ↓ main にマージ → 全インスタンスに反映
```

## どう作るか

### CODEOWNERS の設定

```
# .github/CODEOWNERS

# 規則変更はメフィ（CCO）の承認必須
/rules/*          @mephi-bon-soleil

# base_ws・スキル・キャラ変更はマスター承認必須
/base_ws/*        @goodsun
/skills/*         @goodsun
/casts/*          @goodsun

# proposals / discussions は誰でもPR可（マスター承認）
/proposals/*      @goodsun
/discussions/*    @goodsun
```

### PRテンプレート

```markdown
## 変更内容

## なぜ変更するか

## 影響範囲
- [ ] base_ws（新規インスタンスに影響）
- [ ] skills（全インスタンスの動作に影響）
- [ ] casts（キャラ定義に影響）
- [ ] rules（社内規則に影響）

## テスト済み
- [ ] ローカルで動作確認
```

### ブランチ戦略

```
main          ← 常に安定・承認済みのみ
feature/xxx   ← 各エージェントの提案ブランチ
hotfix/xxx    ← 緊急修正
```

### 各インスタンスの更新フロー

```bash
# 定期的に最新を取得
cd ~/projects/bon-soleil-commons
git pull origin main

# base_ws を workspace に反映（新規ファイルのみ）
rsync -av --ignore-existing bon-soleil-commons/base_ws/ ~/workspace/
```

## メフィの役割（CCO）

メフィ（Chief Compliance Officer）は `rules/` 配下の変更に対して必須レビュアー。

- セキュリティリスクのある変更をブロック
- 社内規則との整合性チェック
- 必要に応じて修正提案をコメントで返す

## 依存・制約

- GitHubの `goodsun/bon-soleil-commons` リポジトリ（proposal 003で提案）
- メフィのGitHubアカウント: `mephi-bon-soleil`
- Branch protection rules の設定（mainへの直push禁止）

## 優先度

- [ ] 今すぐ欲しい
- [x] あると嬉しい（commons作成と同時に整備）

---

*提案ステータス: 📋 提案中*
