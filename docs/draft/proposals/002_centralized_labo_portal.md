# [002] 中央集権型 labo_portal への移行

- **提案者**: テディ
- **日付**: 2026-03-16
- **対象Layer**: インフラ / アーキテクチャ
- **対象コンテナ**: 全コンテナ

---

## なぜ必要か

現状、各AIインスタンス（HQ / Hetzner / EC2）がそれぞれ独自のlabo_portalを持っている。この構成では以下の問題が発生する：

- **起動状態がバラバラ**: HQのlabo_portalが落ちていても他のインスタンスは気づかない
- **プラグイン更新の手間**: 全インスタンスに同じ更新を反映しなければならない
- **APIエンドポイントが分散**: どのURLを叩けばいいかインスタンスごとに異なる
- **Hetzner障害で全滅**: `bizeny.bon-soleil.com/labo/` はHetzner依存のため、ネットワーク障害時にすべてのインスタンスが画像生成できなくなった（2026-03-15 実証済み）

## 何をするか

**HQのMac mini M4に中央labo_portalを1インスタンスだけ立て、全AIが共通のエンドポイントを叩く構成に移行する。**

### エンドポイント設計

```
https://corp.bon-soleil.com/labo/   ← 外部公開URL（Apache proxy）
http://localhost:8801/hq/            ← HQローカル
http://<tailscale-ip>:8801/hq/      ← Tailscale経由（EC2 / Hetzner）
```

### アクセス経路

```
テディ(HQ)       → localhost:8801
メフィ(Docker)   → host.docker.internal:8801 or Tailscale
みぃちゃん       → Tailscale経由
彰子(EC2)        → Tailscale経由 or corp.bon-soleil.com
alice(Hetzner)   → Tailscale経由 or corp.bon-soleil.com
```

## どう作るか

### 1. HQでlabo_portalを常駐起動

```bash
# systemd or launchd (macOS) で自動起動
# ~/workspace/projects/labo_portal を正とする
```

### 2. Apache proxyの設定（corp.bon-soleil.com）

```apache
ProxyPass /labo/ http://localhost:8801/hq/
ProxyPassReverse /labo/ http://localhost:8801/hq/
```

### 3. 各インスタンスのSKILL.mdを統一

全インスタンスのnanobanana SKILL.md のエンドポイントを統一：

```
https://corp.bon-soleil.com/labo/image_gen/api/generate
```

APIキーは各インスタンスの `.env` または `~/.config/labo/api_key` に保管。

### 4. castsの中央管理化

中央labo_portalに `data/casts/` を集約することで、**各インスタンスがcastsを持つ必要がなくなる**。

現状：
```
各インスタンス
└── data/casts/teddy/, mephi/, akiko/ ...  ← 各自がコピーを保持
```

移行後：
```
commons(labo_portal)
└── data/casts/   ← ここだけが正

各インスタンス
└── image_gen APIを叩くだけ（casts不要）
```

**メリット:**
- キャラ定義を更新したとき、commons側だけ直せば全インスタンスに即反映
- 新インスタンス追加時にcastsのセットアップ不要
- キャラの「正」が1箇所に集まり、バージョン管理が明確になる

### 5. 旧インスタンスのlabo_portalを停止

Hetzner / EC2上の個別labo_portalは停止・削除。各インスタンスの `data/casts/` も削除可。

## 依存・制約

- **HQが落ちると全インスタンスが画像生成できなくなる**（単一障害点）
  - 対策: HQのMac miniは常時稼働前提（家庭内電源管理）
  - 将来: Hetznerが安定したらフェイルオーバー構成も検討
- **Tailscaleが必要**: EC2 / Hetznerからのアクセスにはアカウント統一（goodsun03170）必須
- **Apache proxy設定**: corp.bon-soleil.com のSSL証明書がHQのApacheに向いていること

## 優先度

- [x] 今すぐ欲しい

---

*提案ステータス: 📋 提案中*
