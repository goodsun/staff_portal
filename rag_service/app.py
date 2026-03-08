"""
bon-soleil RAG Service
ChromaDB + FastAPI — 完全黒箱RAGコンテナ

API:
  POST /ingest          { text, metadata?, collection?, doc_id? }
  POST /ingest/batch    [{ text, metadata?, collection?, doc_id? }]
  POST /search          { query, n?, collection?, where? }
  GET  /collections
  GET  /documents       ?collection=xxx&limit=50&offset=0
  GET  /document/{id}   ?collection=xxx
  PUT  /document/{id}   { text?, metadata?, collection? }
  DELETE /document/{id} ?collection=xxx
  DELETE /collection    { collection }
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
import chromadb
import hashlib
import os

app = FastAPI(title="bon-soleil RAG Service", version="1.0.0")

# ChromaDB — データはvolumeにマウントされた/data に永続化
CHROMA_PATH = os.environ.get("CHROMA_PATH", "/data/chroma")
client = chromadb.PersistentClient(path=CHROMA_PATH)

DEFAULT_COLLECTION = os.environ.get("DEFAULT_COLLECTION", "default")

# --- スキーマ ---

class IngestRequest(BaseModel):
    text: str
    metadata: Optional[dict[str, Any]] = None
    collection: Optional[str] = None
    doc_id: Optional[str] = None  # 省略時はtext hashから自動生成

class SearchRequest(BaseModel):
    query: str
    n: Optional[int] = 5
    collection: Optional[str] = None
    where: Optional[dict] = None  # metadata filter

class DeleteCollectionRequest(BaseModel):
    collection: str

class UpdateDocumentRequest(BaseModel):
    text: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    collection: Optional[str] = None

# --- ヘルパー ---

def get_collection(name: Optional[str] = None):
    col_name = name or DEFAULT_COLLECTION
    return client.get_or_create_collection(
        name=col_name,
        metadata={"hnsw:space": "cosine"}
    )

def make_id(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]

# --- エンドポイント ---

@app.get("/health")
def health():
    return {"status": "ok", "chroma_path": CHROMA_PATH}

@app.get("/collections")
def list_collections():
    cols = client.list_collections()
    return {
        "collections": [
            {"name": c.name, "count": c.count()}
            for c in cols
        ]
    }

@app.post("/ingest")
def ingest(req: IngestRequest):
    col = get_collection(req.collection)
    doc_id = req.doc_id or make_id(req.text)
    meta = req.metadata or {}

    col.upsert(
        ids=[doc_id],
        documents=[req.text],
        metadatas=[meta]
    )
    return {"id": doc_id, "collection": col.name, "status": "ok"}

@app.post("/ingest/batch")
def ingest_batch(items: list[IngestRequest]):
    """複数ドキュメントを一括ingest"""
    results = []
    for item in items:
        col = get_collection(item.collection)
        doc_id = item.doc_id or make_id(item.text)
        meta = item.metadata or {}
        col.upsert(ids=[doc_id], documents=[item.text], metadatas=[meta])
        results.append({"id": doc_id, "collection": col.name})
    return {"ingested": len(results), "items": results}

@app.post("/search")
def search(req: SearchRequest):
    col = get_collection(req.collection)
    if col.count() == 0:
        return {"results": [], "collection": col.name, "total": 0}

    kwargs = {
        "query_texts": [req.query],
        "n_results": min(req.n or 5, col.count()),
        "include": ["documents", "metadatas", "distances"]
    }
    if req.where:
        kwargs["where"] = req.where

    res = col.query(**kwargs)

    results = []
    for i, doc in enumerate(res["documents"][0]):
        results.append({
            "text": doc,
            "metadata": res["metadatas"][0][i],
            "score": round(1 - res["distances"][0][i], 4),  # cosine: distance→similarity
            "id": res["ids"][0][i]
        })

    return {
        "results": results,
        "collection": col.name,
        "total": len(results)
    }

@app.delete("/collection")
def delete_collection(req: DeleteCollectionRequest):
    try:
        client.delete_collection(req.collection)
        return {"deleted": req.collection, "status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/documents")
def list_documents(collection: Optional[str] = None, limit: int = 50, offset: int = 0):
    col = get_collection(collection)
    if col.count() == 0:
        return {"documents": [], "total": 0, "collection": col.name}
    result = col.get(
        limit=limit, offset=offset,
        include=["documents", "metadatas"]
    )
    docs = []
    for i, doc_id in enumerate(result["ids"]):
        docs.append({
            "id": doc_id,
            "text": result["documents"][i],
            "metadata": result["metadatas"][i] or {},
        })
    return {"documents": docs, "total": col.count(), "collection": col.name}

@app.get("/document/{doc_id}")
def get_document(doc_id: str, collection: Optional[str] = None):
    col = get_collection(collection)
    result = col.get(ids=[doc_id], include=["documents", "metadatas"])
    if not result["ids"]:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc_id,
        "text": result["documents"][0],
        "metadata": result["metadatas"][0] or {},
        "collection": col.name,
    }

@app.put("/document/{doc_id}")
def update_document(doc_id: str, req: UpdateDocumentRequest):
    col = get_collection(req.collection)
    # 既存データ取得
    existing = col.get(ids=[doc_id], include=["documents", "metadatas"])
    if not existing["ids"]:
        raise HTTPException(status_code=404, detail="Document not found")
    current_text = existing["documents"][0]
    current_meta = existing["metadatas"][0] or {}
    # マージ
    new_text = req.text if req.text is not None else current_text
    new_meta = {**current_meta, **(req.metadata or {})}
    new_meta["updated_at"] = __import__("datetime").datetime.utcnow().isoformat()
    # upsertで再embed
    col.upsert(ids=[doc_id], documents=[new_text], metadatas=[new_meta])
    return {"id": doc_id, "collection": col.name, "status": "updated"}

@app.delete("/document/{doc_id}")
def delete_document(doc_id: str, collection: Optional[str] = None):
    col = get_collection(collection)
    col.delete(ids=[doc_id])
    return {"deleted": doc_id, "collection": col.name, "status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
