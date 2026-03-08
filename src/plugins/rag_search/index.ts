import { Router } from 'express';
import { execFile } from 'child_process';
import http from 'http';
import { requireAuth } from '../../core/auth';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string) => `${BASE}${p}`;
const router = Router();

// ── データソース定義 ──────────────────────────────
const HQ_SCRIPT = '/home/node/.openclaw/workspace/skills/hq-rag-search/scripts/rag_search.js';
const LOCAL_RAG_URL = process.env.LOCAL_RAG_URL ?? 'http://rag:3001';

const HQ_COLLECTIONS = [
  { id: 'flow_notes',   label: 'flow_notes（思考・哲学）',    count: 1393 },
  { id: 'plurality',    label: 'plurality（Plurality理論）',   count: 1581 },
  { id: 'discussions',  label: 'discussions（議論・会話）',    count: 787  },
  { id: 'teddy_notes',  label: 'teddy_notes（テディのノート）', count: 347 },
  { id: 'environment',  label: 'environment（環境設定）',      count: 5    },
];

// ── HTTP ヘルパー ─────────────────────────────────
function httpPost(urlStr: string, body: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(urlStr);
    const req = http.request({
      hostname: parsed.hostname,
      port: parseInt(parsed.port || '80'),
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('JSON parse error: ' + d.slice(0,100))); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(urlStr, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('JSON parse error')); }
      });
    });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ── HTML テンプレート ──────────────────────────────
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
  .main{max-width:860px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  .form-row{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end}
  input[type=text]{flex:1;min-width:200px;padding:10px 14px;background:#0d1117;border:1px solid #0f3460;
    border-radius:6px;color:#e0e0e0;font-size:1em}
  input[type=text]:focus{outline:none;border-color:#e94560}
  select{padding:10px 14px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;
    color:#e0e0e0;font-size:.9em}
  select:focus{outline:none;border-color:#e94560}
  button[type=submit]{padding:10px 24px;background:#e94560;color:#fff;border:none;border-radius:6px;
    font-size:1em;font-weight:600;cursor:pointer;white-space:nowrap}
  button[type=submit]:hover{background:#c73652}
  .source-tabs{display:flex;gap:0;margin-bottom:16px;border-bottom:1px solid #0f3460}
  .source-tab{padding:8px 20px;cursor:pointer;color:#888;font-size:.9em;border-bottom:2px solid transparent;text-decoration:none}
  .source-tab.active{color:#e94560;border-bottom-color:#e94560}
  .result-card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:18px;margin-bottom:14px}
  .result-meta{font-size:.78em;color:#888;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap}
  .result-score{color:#8be9fd}
  .result-text{font-size:.9em;line-height:1.7;color:#d0d0d0;white-space:pre-wrap}
  .badge{font-size:.72em;padding:2px 8px;border-radius:4px;font-weight:600}
  .badge-hq{background:#0f3460;color:#8be9fd}
  .badge-local{background:#1a3a1a;color:#50fa7b}
  .error{color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px;margin-top:16px}
  .count{color:#888;font-size:.85em;margin-bottom:16px}
  .hint{color:#555;font-size:.8em;margin-top:6px}
</style></head><body>${body}</body></html>`;
}

// ── GET: フォーム ─────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const source = (req.query.source as string) ?? 'local';

  // ローカルRAGのコレクション取得
  let localCollections: Array<{name: string, count: number}> = [];
  let localStatus = '❓';
  try {
    const data = await httpGet(LOCAL_RAG_URL + '/health');
    if (data.status === 'ok') {
      localStatus = '✅ 稼働中';
      const colData = await httpGet(LOCAL_RAG_URL + '/collections');
      localCollections = colData.collections ?? [];
    }
  } catch {
    localStatus = '❌ 未接続';
  }

  const localCollOptions = localCollections.length > 0
    ? localCollections.map(c => `<option value="${c.name}">${c.name}（${c.count}件）</option>`).join('')
    : '<option value="default">default（空）</option>';

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>🔍 RAG検索</span>
    </div>
    <div class="main">
      <h2>🔍 RAG検索</h2>

      <div class="source-tabs">
        <a href="${url('/rag')}?source=local" class="source-tab${source==='local'?' active':''}">
          🟢 ローカル RAG <span class="badge badge-local">${localStatus}</span>
        </a>
        <a href="${url('/rag')}?source=hq" class="source-tab${source==='hq'?' active':''}">
          🔵 HQ RAG <span class="badge badge-hq">pgvector</span>
        </a>
      </div>

      <form method="post" action="${url('/rag')}">
        <input type="hidden" name="source" value="${source}">
        <div class="form-row">
          <input type="text" name="query" placeholder="検索クエリを入力..." required autofocus>
          <select name="collection">
            ${source === 'hq'
              ? HQ_COLLECTIONS.map(c => `<option value="${c.id}">${c.label}（${c.count}件）</option>`).join('')
              : localCollOptions}
          </select>
          <select name="n">
            <option value="3">3件</option>
            <option value="5" selected>5件</option>
            <option value="10">10件</option>
          </select>
          <button type="submit">検索</button>
        </div>
        <p class="hint">
          ${source === 'local'
            ? `📍 ローカル ChromaDB (${LOCAL_RAG_URL}) — all-MiniLM-L6-v2`
            : '📍 HQ PostgreSQL pgvector（nomic-embed-text 768次元 / SSH経由）'}
        </p>
      </form>
    </div>`;

  res.send(layout('RAG検索', body));
});

// ── POST: 検索実行 ────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const query = (req.body.query ?? '').trim();
  const collection = req.body.collection ?? 'default';
  const n = parseInt(req.body.n ?? '5');
  const source = req.body.source ?? 'local';

  if (!query) return res.redirect(url('/rag') + `?source=${source}`);

  const startTime = Date.now();

  try {
    let results: Array<{num: number, score: number, title: string, urlLink: string, text: string}> = [];

    if (source === 'local') {
      // ── ローカルRAGコンテナ ──
      const data = await httpPost(LOCAL_RAG_URL + '/search', { query, n, collection });
      results = (data.results ?? []).map((r: any, i: number) => ({
        num: i + 1,
        score: r.score ?? 0,
        title: r.metadata?.title ?? r.metadata?.url ?? '',
        urlLink: r.metadata?.url ?? '',
        text: r.text ?? '',
      }));

    } else {
      // ── HQ pgvector（既存スクリプト）──
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile('node', [HQ_SCRIPT, query, `--collection=${collection}`, `--n=${n}`], {
          timeout: 30000,
          env: { ...process.env, HOME: '/home/node' },
        }, (err, out, stderr) => {
          if (err) reject(new Error(err.message + '\n' + stderr));
          else resolve(out);
        });
      });
      const blocks = stdout.split(/\n\[(\d+)\]/).slice(1);
      for (let i = 0; i < blocks.length; i += 2) {
        const num = parseInt(blocks[i]);
        const content = blocks[i+1] ?? '';
        const firstLine = content.split('\n')[0] ?? '';
        const scoreMatch = firstLine.match(/score:([\d.]+)/);
        const titleMatch = firstLine.match(/\|\s*(.+)$/);
        const urlMatch = content.match(/https?:\/\/\S+/);
        const textMatch = content.match(/【[^】]*】([\s\S]*)/);
        results.push({
          num,
          score: parseFloat(scoreMatch?.[1] ?? '0'),
          title: titleMatch?.[1]?.trim() ?? '',
          urlLink: urlMatch?.[0] ?? '',
          text: textMatch?.[1]?.trim() ?? content.slice(0, 400),
        });
      }
    }

    const elapsed = Date.now() - startTime;
    const sourceLabel = source === 'local' ? '🟢 ローカル RAG' : '🔵 HQ pgvector';
    const badgeClass = source === 'local' ? 'badge-local' : 'badge-hq';

    const cards = results.map(r => `
      <div class="result-card">
        <div class="result-meta">
          <span>#${r.num}</span>
          <span class="result-score">score: ${r.score.toFixed(4)}</span>
          ${r.urlLink ? `<a href="${r.urlLink}" target="_blank" style="color:#50fa7b;text-decoration:none">${r.urlLink.slice(0,60)}</a>` : ''}
        </div>
        ${r.title ? `<div style="font-weight:600;margin-bottom:6px">${r.title.replace(/</g,'&lt;')}</div>` : ''}
        <div class="result-text">${r.text.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,600)}${r.text.length>600?'…':''}</div>
      </div>`).join('');

    const colLabel = source === 'hq'
      ? (HQ_COLLECTIONS.find(c => c.id === collection)?.label ?? collection)
      : collection;

    const resultBody = `
      <div class="header">
        <a href="${url('/')}">🏭 labo-portal</a>
        <span class="sep">›</span>
        <a href="${url('/rag')}?source=${source}">🔍 RAG検索</a>
      </div>
      <div class="main">
        <h2>🔍 RAG検索結果</h2>
        <form method="post" action="${url('/rag')}" style="margin-bottom:20px">
          <input type="hidden" name="source" value="${source}">
          <div class="form-row">
            <input type="text" name="query" value="${query.replace(/"/g,'&quot;')}" required>
            <select name="collection">
              ${source === 'hq'
                ? HQ_COLLECTIONS.map(c => `<option value="${c.id}"${c.id===collection?' selected':''}>${c.label}</option>`).join('')
                : `<option value="${collection}" selected>${collection}</option>`}
            </select>
            <select name="n">
              ${[3,5,10].map(v => `<option value="${v}"${v===n?' selected':''}>${v}件</option>`).join('')}
            </select>
            <button type="submit">再検索</button>
          </div>
        </form>
        <p class="count">
          <span class="badge ${badgeClass}">${sourceLabel}</span>
          「${query.replace(/</g,'&lt;')}」— ${colLabel} — ${results.length}件（${elapsed}ms）
        </p>
        ${results.length > 0 ? cards : '<p style="color:#888">結果が見つかりませんでした。</p>'}
      </div>`;

    res.send(layout('RAG検索結果', resultBody));

  } catch (err: any) {
    const errBody = `
      <div class="header">
        <a href="${url('/')}">🏭 labo-portal</a>
        <span class="sep">›</span>
        <a href="${url('/rag')}?source=${source}">🔍 RAG検索</a>
      </div>
      <div class="main">
        <h2>🔍 RAG検索エラー</h2>
        <div class="error"><strong>エラー:</strong> ${err.message}</div>
        <p style="margin-top:16px"><a href="${url('/rag')}?source=${source}" style="color:#e94560">← 戻る</a></p>
      </div>`;
    res.send(layout('RAG検索エラー', errBody));
  }
});

export const meta = {
  name: 'RAG検索',
  icon: '🔍',
  desc: 'ローカル ChromaDB / HQ pgvector で知識ベースを検索',
  layer: 'layer2' as const,
  url: '/rag',
};

export { router };
