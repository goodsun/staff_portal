import { Router } from 'express';
import http from 'http';
import https from 'https';
import { requireAuth } from '../../core/auth';

const BASE: string = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string): string => BASE + p;
const router = Router();

const RAG_URL = process.env.LOCAL_RAG_URL ?? 'http://rag:3001';

// ── HTTP ヘルパー ─────────────────────────────────
function ragGet(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const full = RAG_URL + path;
    const lib = full.startsWith('https') ? https : http;
    const req = lib.get(full, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error')); } });
    });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function ragPost(path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(RAG_URL + path);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname, port: parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80')),
      path: parsed.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error: ' + d.slice(0,100))); } });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function ragDelete(path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(RAG_URL + path);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname, port: parseInt(parsed.port || '80'),
      path: parsed.pathname, method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error')); } });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// URLからテキストを取得
async function fetchUrl(targetUrl: string): Promise<{ title: string; text: string }> {
  return new Promise((resolve, reject) => {
    const lib = targetUrl.startsWith('https') ? https : http;
    const req = lib.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bon-soleil-rag/1.0)' } }, res => {
      // リダイレクト対応
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        // タイトル抽出
        const titleMatch = d.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim().replace(/\s+/g,' ') ?? '';
        // HTML→プレーンテキスト（簡易）
        const text = d
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s{3,}/g, '\n\n').trim()
          .slice(0, 8000);
        resolve({ title, text });
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout fetching URL')); });
    req.on('error', reject);
  });
}

// ── layout ───────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — labo-portal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:12px 24px;display:flex;align-items:center;gap:12px}
  .header a{color:#e94560;text-decoration:none;font-size:.9em}
  .sep{color:#555}
  .main{max-width:900px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  h3{color:#aaa;font-size:.85em;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px}
  .card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:20px;margin-bottom:16px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  label{display:block;color:#aaa;font-size:.82em;margin-bottom:5px}
  input[type=text],input[type=url],textarea,select{
    width:100%;padding:9px 12px;background:#0d1117;border:1px solid #0f3460;
    border-radius:6px;color:#e0e0e0;font-size:.9em;font-family:inherit}
  input:focus,textarea:focus,select:focus{outline:none;border-color:#e94560}
  textarea{resize:vertical;min-height:100px}
  .btn{padding:9px 20px;border:none;border-radius:6px;font-size:.9em;font-weight:600;cursor:pointer}
  .btn-primary{background:#e94560;color:#fff}
  .btn-primary:hover{background:#c73652}
  .btn-danger{background:#550010;color:#e94560;border:1px solid #e94560}
  .btn-danger:hover{background:#e94560;color:#fff}
  .btn-sm{padding:5px 12px;font-size:.8em}
  .col-item{background:#0d1117;border:1px solid #0f3460;border-radius:6px;padding:14px;display:flex;align-items:center;gap:12px}
  .col-name{font-weight:600;flex:1;color:#8be9fd;font-family:monospace}
  .col-count{color:#888;font-size:.85em}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75em;font-weight:600}
  .badge-ok{background:#1a3a1a;color:#50fa7b}
  .badge-err{background:#3a1a1a;color:#e94560}
  .alert{padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:.9em}
  .alert-ok{background:#0a2a0a;border:1px solid #50fa7b;color:#50fa7b}
  .alert-err{background:#2a0a0a;border:1px solid #e94560;color:#e94560}
  .tabs{display:flex;gap:0;border-bottom:1px solid #0f3460;margin-bottom:20px}
  .tab{padding:8px 20px;cursor:pointer;color:#888;font-size:.9em;border-bottom:2px solid transparent;text-decoration:none}
  .tab.active{color:#e94560;border-bottom-color:#e94560}
  .hint{color:#555;font-size:.78em;margin-top:4px}
</style></head><body>${body}</body></html>`;
}

function headerHtml(sub?: string): string {
  return `<div class="header">
    <a href="${url('/')}">🏭 labo-portal</a>
    <span class="sep">›</span>
    <a href="${url('/rag_admin')}">🧬 RAG管理</a>
    ${sub ? `<span class="sep">›</span><span>${sub}</span>` : ''}
  </div>`;
}

// ── HTTP DELETE ───────────────────────────────────
function ragDeleteDoc(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(RAG_URL + path);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname, port: parseInt(parsed.port || '80'),
      path: parsed.pathname + parsed.search, method: 'DELETE',
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error')); } });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function ragPut(path: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(RAG_URL + path);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname, port: parseInt(parsed.port || '80'),
      path: parsed.pathname, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { reject(new Error('parse error')); } });
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// ── GET: トップ ───────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  let collections: Array<{name: string, count: number}> = [];
  let ragOk = false;

  try {
    const health = await ragGet('/health');
    ragOk = health.status === 'ok';
    if (ragOk) {
      const data = await ragGet('/collections');
      collections = data.collections ?? [];
    }
  } catch {}

  const statusBadge = ragOk
    ? '<span class="badge badge-ok">✅ 稼働中</span>'
    : '<span class="badge badge-err">❌ 未接続</span>';

  const deleted = (_req as any).query?.deleted;
  const colItems = collections.map(c => `
    <div class="col-item">
      <a href="${url('/rag_admin/documents?collection=' + encodeURIComponent(c.name))}" class="col-name" style="text-decoration:none">${c.name}</a>
      <span class="col-count">${c.count} 件</span>
      <a href="${url('/rag_admin/documents?collection=' + encodeURIComponent(c.name))}" class="btn btn-sm" style="background:#0f3460;color:#8be9fd;text-decoration:none">一覧</a>
      <form method="post" action="${url('/rag_admin/delete-collection')}"
        onsubmit="return confirm('「${c.name}」コレクションを削除しますか？\\nすべてのデータが消えます。')">
        <input type="hidden" name="collection" value="${c.name}">
        <button type="submit" class="btn btn-danger btn-sm">削除</button>
      </form>
    </div>`).join('') || '<p style="color:#555;font-size:.9em">コレクションがありません</p>';

  const body = `
    ${headerHtml()}
    <div class="main">
      <h2>🧬 RAG管理コンソール</h2>

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <span style="color:#888;font-size:.85em">${RAG_URL}</span>
        ${statusBadge}
      </div>

      <div class="tabs">
        <a href="${url('/rag_admin')}" class="tab active">📚 コレクション</a>
        <a href="${url('/rag_admin/ingest')}" class="tab">📥 投入</a>
      </div>

      <div class="card">
        <h3>コレクション一覧</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${colItems}
        </div>
      </div>
    </div>`;

  res.send(layout('RAG管理', body));
});

// ── GET: ドキュメント一覧 ─────────────────────────
router.get('/documents', requireAuth, async (req, res) => {
  const collection = (req.query.collection as string) ?? 'default';
  const offset = parseInt((req.query.offset as string) ?? '0');
  const limit = 20;

  try {
    const data = await ragGet(`/documents?collection=${encodeURIComponent(collection)}&limit=${limit}&offset=${offset}`);
    const docs: Array<{id: string, text: string, metadata: Record<string,any>}> = data.documents ?? [];
    const total: number = data.total ?? 0;

    const rows = docs.map(d => {
      const title = d.metadata?.title ?? d.metadata?.url ?? '';
      const preview = d.text.slice(0, 80).replace(/\n/g, ' ');
      return `
        <div class="col-item" style="flex-direction:column;align-items:stretch;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-family:monospace;font-size:.75em;color:#555;min-width:140px">${d.id}</span>
            <span style="flex:1;color:#ccc;font-size:.88em">${title ? `<strong>${title.replace(/</g,'&lt;')}</strong>` : preview.replace(/</g,'&lt;')}</span>
            <a href="${url('/rag_admin/edit?id=' + encodeURIComponent(d.id) + '&collection=' + encodeURIComponent(collection))}"
              class="btn btn-sm" style="background:#0f3460;color:#8be9fd;text-decoration:none;white-space:nowrap">編集</a>
            <form method="post" action="${url('/rag_admin/delete-document')}"
              onsubmit="return confirm('このドキュメントを削除しますか？')" style="margin:0">
              <input type="hidden" name="doc_id" value="${d.id}">
              <input type="hidden" name="collection" value="${collection}">
              <button type="submit" class="btn btn-danger btn-sm">削除</button>
            </form>
          </div>
          ${!title ? '' : `<div style="color:#555;font-size:.78em;padding-left:150px">${preview.replace(/</g,'&lt;')}</div>`}
        </div>`;
    }).join('');

    const prevLink = offset > 0
      ? `<a href="${url('/rag_admin/documents?collection=' + encodeURIComponent(collection) + '&offset=' + (offset - limit))}" class="btn btn-sm" style="background:#0f3460;color:#8be9fd;text-decoration:none">← 前</a>` : '';
    const nextLink = offset + limit < total
      ? `<a href="${url('/rag_admin/documents?collection=' + encodeURIComponent(collection) + '&offset=' + (offset + limit))}" class="btn btn-sm" style="background:#0f3460;color:#8be9fd;text-decoration:none">次 →</a>` : '';

    const body = `
      ${headerHtml('ドキュメント一覧')}
      <div class="main">
        <h2>📄 ${collection} <span style="color:#888;font-size:.75em">(${total}件)</span></h2>
        <div class="tabs">
          <a href="${url('/rag_admin')}" class="tab">📚 コレクション</a>
          <a href="${url('/rag_admin/ingest?collection=' + encodeURIComponent(collection))}" class="tab">📥 投入</a>
          <span class="tab active">📄 ドキュメント</span>
        </div>
        <div class="card">
          <div style="display:flex;flex-direction:column;gap:8px">
            ${rows || '<p style="color:#555">ドキュメントがありません</p>'}
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          ${prevLink}
          <span style="color:#555;font-size:.85em;padding:6px 0">${offset+1}–${Math.min(offset+limit,total)} / ${total}</span>
          ${nextLink}
        </div>
      </div>`;
    res.send(layout('ドキュメント一覧', body));
  } catch (err: any) {
    res.send(layout('エラー', `${headerHtml()}<div class="main"><div class="alert alert-err">❌ ${err.message}</div></div>`));
  }
});

// ── GET: ドキュメント編集フォーム ─────────────────
router.get('/edit', requireAuth, async (req, res) => {
  const docId = (req.query.id as string) ?? '';
  const collection = (req.query.collection as string) ?? 'default';
  if (!docId) return res.redirect(url('/rag_admin'));

  try {
    const doc = await ragGet(`/document/${encodeURIComponent(docId)}?collection=${encodeURIComponent(collection)}`);
    const metaJson = JSON.stringify(doc.metadata ?? {}, null, 2);

    const body = `
      ${headerHtml('編集')}
      <div class="main">
        <h2>✏️ ドキュメント編集</h2>
        <p style="color:#555;font-family:monospace;font-size:.8em;margin-bottom:16px">${docId}</p>
        <form method="post" action="${url('/rag_admin/update')}">
          <input type="hidden" name="doc_id" value="${docId}">
          <input type="hidden" name="collection" value="${collection}">
          <div class="card" style="display:flex;flex-direction:column;gap:14px">
            <div>
              <label>テキスト <span style="color:#e94560;font-size:.78em">（保存時に再embedding）</span></label>
              <textarea name="text" style="min-height:200px;font-size:.85em">${doc.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            </div>
            <div>
              <label>メタデータ <span style="color:#888;font-size:.78em">（JSON形式）</span></label>
              <textarea name="metadata" style="min-height:100px;font-family:monospace;font-size:.82em">${metaJson.replace(/</g,'&lt;')}</textarea>
            </div>
            <div style="display:flex;gap:12px">
              <button type="submit" class="btn btn-primary">保存（再embedding）</button>
              <a href="${url('/rag_admin/documents?collection=' + encodeURIComponent(collection))}" style="color:#888;text-decoration:none;padding:9px 0">キャンセル</a>
            </div>
          </div>
        </form>
      </div>`;
    res.send(layout('ドキュメント編集', body));
  } catch (err: any) {
    res.send(layout('エラー', `${headerHtml()}<div class="main"><div class="alert alert-err">❌ ${err.message}</div></div>`));
  }
});

// ── POST: ドキュメント更新 ────────────────────────
router.post('/update', requireAuth, async (req, res) => {
  const docId = (req.body.doc_id ?? '').trim();
  const collection = (req.body.collection ?? 'default').trim();
  const text = (req.body.text ?? '').trim();
  const metaRaw = (req.body.metadata ?? '{}').trim();

  if (!docId) return res.redirect(url('/rag_admin'));

  try {
    let metadata: Record<string, any> = {};
    try { metadata = JSON.parse(metaRaw); } catch { throw new Error('メタデータのJSON形式が正しくありません'); }

    await ragPut(`/document/${encodeURIComponent(docId)}`, { text, metadata, collection });
    res.redirect(url('/rag_admin/documents?collection=' + encodeURIComponent(collection)));
  } catch (err: any) {
    const body = `${headerHtml('更新エラー')}<div class="main"><div class="alert alert-err">❌ ${err.message}</div>
      <a href="javascript:history.back()" class="btn btn-primary" style="margin-top:16px;display:inline-block">← 戻る</a></div>`;
    res.send(layout('更新エラー', body));
  }
});

// ── POST: ドキュメント削除 ────────────────────────
router.post('/delete-document', requireAuth, async (req, res) => {
  const docId = (req.body.doc_id ?? '').trim();
  const collection = (req.body.collection ?? 'default').trim();
  if (!docId) return res.redirect(url('/rag_admin'));

  try {
    await ragDeleteDoc(`/document/${encodeURIComponent(docId)}?collection=${encodeURIComponent(collection)}`);
    res.redirect(url('/rag_admin/documents?collection=' + encodeURIComponent(collection)));
  } catch (err: any) {
    res.send(layout('削除エラー', `${headerHtml()}<div class="main"><div class="alert alert-err">❌ ${err.message}</div></div>`));
  }
});

// ── GET: 投入フォーム ─────────────────────────────
router.get('/ingest', requireAuth, async (_req, res) => {
  let collections: string[] = [];
  try {
    const data = await ragGet('/collections');
    collections = (data.collections ?? []).map((c: any) => c.name);
  } catch {}

  const colOptions = (collections.length > 0 ? collections : ['default'])
    .map(c => `<option value="${c}">${c}</option>`).join('');
  const colOptionsWithNew = colOptions + '<option value="__new__">＋ 新しいコレクション</option>';

  const body = `
    ${headerHtml('投入')}
    <div class="main">
      <h2>📥 データ投入</h2>

      <div class="tabs">
        <a href="${url('/rag_admin')}" class="tab">📚 コレクション</a>
        <a href="${url('/rag_admin/ingest')}" class="tab active">📥 投入</a>
      </div>

      <!-- URL投入 -->
      <div class="card">
        <h3>🔗 URLから取り込む</h3>
        <form method="post" action="${url('/rag_admin/ingest-url')}">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div>
              <label>URL</label>
              <input type="url" name="ingest_url" placeholder="https://note.com/..." required>
              <p class="hint">HTMLをfetchしてテキストを抽出し、RAGに投入します</p>
            </div>
            <div class="grid2">
              <div>
                <label>コレクション</label>
                <select name="collection" id="col_url">
                  ${colOptionsWithNew}
                </select>
              </div>
              <div id="new_col_url_wrap" style="display:none">
                <label>新しいコレクション名</label>
                <input type="text" name="new_collection_url" placeholder="collection_name">
              </div>
            </div>
            <div>
              <button type="submit" class="btn btn-primary">取り込む</button>
            </div>
          </div>
        </form>
      </div>

      <!-- テキスト直接投入 -->
      <div class="card">
        <h3>📝 テキストを直接投入</h3>
        <form method="post" action="${url('/rag_admin/ingest-text')}">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="grid2">
              <div>
                <label>タイトル（任意）</label>
                <input type="text" name="title" placeholder="ドキュメントのタイトル">
              </div>
              <div>
                <label>URL/ソース（任意）</label>
                <input type="text" name="source_url" placeholder="https://...">
              </div>
            </div>
            <div>
              <label>テキスト</label>
              <textarea name="text" placeholder="投入するテキストを入力..." required></textarea>
            </div>
            <div class="grid2">
              <div>
                <label>コレクション</label>
                <select name="collection" id="col_text">
                  ${colOptionsWithNew}
                </select>
              </div>
              <div id="new_col_text_wrap" style="display:none">
                <label>新しいコレクション名</label>
                <input type="text" name="new_collection_text" placeholder="collection_name">
              </div>
            </div>
            <div>
              <button type="submit" class="btn btn-primary">投入する</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <script>
      // 新規コレクション表示切り替え
      ['url','text'].forEach(suffix => {
        const sel = document.getElementById('col_' + suffix);
        const wrap = document.getElementById('new_col_' + suffix + '_wrap');
        sel.addEventListener('change', () => {
          wrap.style.display = sel.value === '__new__' ? 'block' : 'none';
        });
      });
    </script>`;

  res.send(layout('RAG投入', body));
});

// ── POST: URL投入 ────────────────────────────────
router.post('/ingest-url', requireAuth, async (req, res) => {
  const ingestUrl = (req.body.ingest_url ?? '').trim();
  const col = req.body.collection === '__new__'
    ? (req.body.new_collection_url ?? 'default').trim()
    : req.body.collection ?? 'default';

  if (!ingestUrl) return res.redirect(url('/rag_admin/ingest'));

  try {
    const { title, text } = await fetchUrl(ingestUrl);
    if (!text) throw new Error('テキストが取得できませんでした');

    const result = await ragPost('/ingest', {
      text,
      metadata: { title, url: ingestUrl, ingested_at: new Date().toISOString() },
      collection: col,
    });

    const body = `
      ${headerHtml('投入結果')}
      <div class="main">
        <h2>📥 投入完了</h2>
        <div class="alert alert-ok">
          ✅ 投入しました<br>
          <strong>${title || ingestUrl}</strong><br>
          コレクション: <code>${col}</code> / ID: <code>${result.id}</code>
        </div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <a href="${url('/rag_admin/ingest')}" class="btn btn-primary">続けて投入</a>
          <a href="${url('/rag_admin')}" class="btn" style="background:#0f3460;color:#8be9fd">コレクション一覧</a>
        </div>
      </div>`;
    res.send(layout('投入完了', body));

  } catch (err: any) {
    const body = `
      ${headerHtml('投入エラー')}
      <div class="main">
        <h2>📥 投入エラー</h2>
        <div class="alert alert-err">❌ ${err.message}</div>
        <a href="${url('/rag_admin/ingest')}" class="btn btn-primary" style="margin-top:16px;display:inline-block">← 戻る</a>
      </div>`;
    res.send(layout('投入エラー', body));
  }
});

// ── POST: テキスト直接投入 ───────────────────────
router.post('/ingest-text', requireAuth, async (req, res) => {
  const text = (req.body.text ?? '').trim();
  const title = (req.body.title ?? '').trim();
  const sourceUrl = (req.body.source_url ?? '').trim();
  const col = req.body.collection === '__new__'
    ? (req.body.new_collection_text ?? 'default').trim()
    : req.body.collection ?? 'default';

  if (!text) return res.redirect(url('/rag_admin/ingest'));

  try {
    const metadata: Record<string, string> = { ingested_at: new Date().toISOString() };
    if (title) metadata.title = title;
    if (sourceUrl) metadata.url = sourceUrl;

    const result = await ragPost('/ingest', { text, metadata, collection: col });

    const body = `
      ${headerHtml('投入結果')}
      <div class="main">
        <h2>📥 投入完了</h2>
        <div class="alert alert-ok">
          ✅ 投入しました<br>
          ${title ? `<strong>${title}</strong><br>` : ''}
          コレクション: <code>${col}</code> / ID: <code>${result.id}</code>
        </div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <a href="${url('/rag_admin/ingest')}" class="btn btn-primary">続けて投入</a>
          <a href="${url('/rag_admin')}" class="btn" style="background:#0f3460;color:#8be9fd">コレクション一覧</a>
        </div>
      </div>`;
    res.send(layout('投入完了', body));

  } catch (err: any) {
    const body = `
      ${headerHtml('投入エラー')}
      <div class="main">
        <h2>📥 投入エラー</h2>
        <div class="alert alert-err">❌ ${err.message}</div>
        <a href="${url('/rag_admin/ingest')}" class="btn btn-primary" style="margin-top:16px;display:inline-block">← 戻る</a>
      </div>`;
    res.send(layout('投入エラー', body));
  }
});

// ── POST: コレクション削除 ───────────────────────
router.post('/delete-collection', requireAuth, async (req, res) => {
  const collection = (req.body.collection ?? '').trim();
  if (!collection) return res.redirect(url('/rag_admin'));

  try {
    await ragDelete('/collection', { collection });
    res.redirect(url('/rag_admin') + '?deleted=' + encodeURIComponent(collection));
  } catch (err: any) {
    const body = `
      ${headerHtml('削除エラー')}
      <div class="main">
        <h2>🧬 削除エラー</h2>
        <div class="alert alert-err">❌ ${err.message}</div>
        <a href="${url('/rag_admin')}" class="btn btn-primary" style="margin-top:16px;display:inline-block">← 戻る</a>
      </div>`;
    res.send(layout('削除エラー', body));
  }
});

export const meta = {
  name: 'RAG管理',
  icon: 'fas fa-dna',
  desc: 'ローカルRAGコンテナの管理・データ投入',
  layer: 'layer2' as const,
  url: '/rag_admin',
};

export { router };
