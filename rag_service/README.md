# bon-soleil RAG Service

完全黒箱RAGコンテナ。ChromaDBをバックエンドに、REST APIで検索・投入を提供する。

## 設計思想

- **中身を知らなくていい**: 呼び出し側はAPIだけ叩く
- **捨てられる**: コンテナを削除してもvolumeは残る
- **作り直せる**: ChromaDB → PostgreSQL+pgvector への移行も内部だけ
- **配布できる**: `rag_data` volumeをtarで固めればembedding済みナレッジを配布可能

## API

| Method | Path | 説明 |
|--------|------|------|
| GET | /health | ヘルスチェック |
| GET | /collections | コレクション一覧 |
| POST | /ingest | ドキュメント1件投入 |
| POST | /ingest/batch | 複数ドキュメント一括投入 |
| POST | /search | セマンティック検索 |
| DELETE | /collection | コレクション削除 |

## ingest

```json
POST /ingest
{
  "text": "検索対象テキスト",
  "metadata": { "title": "記事タイトル", "url": "https://..." },
  "collection": "flow_notes",   // 省略時: "default"
  "doc_id": "unique-id"         // 省略時: textのhashから自動生成
}
```

## search

```json
POST /search
{
  "query": "ダーウィニズム 進化",
  "n": 5,
  "collection": "flow_notes",
  "where": { "author": "goodsun" }  // メタデータフィルタ (省略可)
}
```

レスポンス:
```json
{
  "results": [
    {
      "text": "...",
      "metadata": { "title": "...", "url": "..." },
      "score": 0.8742,
      "id": "abc123"
    }
  ],
  "collection": "flow_notes",
  "total": 5
}
```

## セットアップ

1. `docker-compose.snippet.yml` の内容を既存の `docker-compose.yml` に追記
2. `rag_service/` ディレクトリをdocker-compose.ymlと同じ階層に配置
3. `docker-compose up -d rag`

## データ永続化

```
rag_data volume:
  /data/chroma/   ← ChromaDBのデータ

# バックアップ
docker run --rm -v rag_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/rag_backup.tar.gz /data

# リストア
docker run --rm -v rag_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/rag_backup.tar.gz -C /
```

## 将来の移行

ChromaDB → PostgreSQL+pgvector に移行する場合:
1. `app.py` の内部実装を差し替える
2. APIインターフェースは変えない
3. 呼び出し側（labo-portal, みぃちゃん等）は何も変更不要
