import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import { requireAuth } from '../../core/auth';
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, ''); const url = (p: string) => `${BASE}${p}`;

const router = Router();

const SCRIPT = '/home/node/.openclaw/workspace/skills/hq-rag-search/scripts/rag_search.js';

const COLLECTIONS = [
  { id: 'flow_notes',   label: 'flow_notes（思考・哲学）',    count: 1393 },
  { id: 'plurality',    label: 'plurality（Plurality理論）',   count: 1581 },
  { id: 'discussions',  label: 'discussions（議論・会話）',    count: 787  },
  { id: 'teddy_notes',  label: 'teddy_notes（テディのノート）', count: 347 },
  { id: 'environment',  label: 'environment（環境設定）',      count: 5    },
];

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
  .form-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end}
  input[type=text]{flex:1;min-width:200px;padding:10px 14px;background:#0d1117;border:1px solid #0f3460;
    border-radius:6px;color:#e0e0e0;font-size:1em}
  input[type=text]:focus{outline:none;border-color:#e94560}
  select{padding:10px 14px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;
    color:#e0e0e0;font-size:.9em}
  select:focus{outline:none;border-color:#e94560}
  button{padding:10px 24px;background:#e94560;color:#fff;border:none;border-radius:6px;
    font-size:1em;font-weight:600;cursor:pointer;white-space:nowrap}
  button:hover{background:#c73652}
  .results{margin-top:24px}
  .result-card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:18px;margin-bottom:14px}
  .result-meta{font-size:.78em;color:#888;margin-bottom:8px;display:flex;gap:12px}
  .result-score{color:#8be9fd}
  .result-source{color:#50fa7b}
  .result-text{font-size:.9em;line-height:1.7;color:#d0d0d0;white-space:pre-wrap}
  .loading{color:#888;font-style:italic}
  .error{color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px;margin-top:16px}
  .count{color:#888;font-size:.85em;margin-bottom:16px}
</style></head><body>
${body}
</body></html>`;
}

// GET: 検索フォーム
router.get('/', requireAuth, (req, res) => {
  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>🔍 RAG検索</span>
    </div>
    <div class="main">
      <h2>🔍 HQ RAG 検索</h2>
      <form method="post" action="${url('/rag')}">
        <div class="form-row">
          <input type="text" name="query" placeholder="検索クエリを入力..." required autofocus>
          <select name="collection">
            ${COLLECTIONS.map(c => `<option value="${c.id}">${c.label}（${c.count}件）</option>`).join('')}
          </select>
          <select name="n">
            <option value="3">3件</option>
            <option value="5">5件</option>
            <option value="10">10件</option>
          </select>
          <button type="submit">検索</button>
        </div>
      </form>
      <p style="color:#888;font-size:.82em;margin-top:8px">
        📍 HQ PostgreSQL pgvector（nomic-embed-text 768次元）
      </p>
    </div>`;
  res.send(layout('RAG検索', body));
});

// POST: 検索実行
router.post('/', requireAuth, (req, res) => {
  const query = (req.body.query ?? '').trim();
  const collection = req.body.collection ?? 'flow_notes';
  const n = parseInt(req.body.n ?? '3');

  if (!query) return res.redirect(url('/rag'));

  const collLabel = COLLECTIONS.find(c => c.id === collection)?.label ?? collection;
  const startTime = Date.now();

  execFile('node', [SCRIPT, query, `--collection=${collection}`, `--n=${n}`], {
    timeout: 30000,
    env: { ...process.env, HOME: '/home/node' },
  }, (err, stdout, stderr) => {
    const elapsed = Date.now() - startTime;

    if (err) {
      const errorBody = `
        <div class="header">
          <a href="${url('/')}">🏭 labo-portal</a>
          <span class="sep">›</span>
          <a href="${url('/rag')}">🔍 RAG検索</a>
          <span class="sep">›</span>
          <span>エラー</span>
        </div>
        <div class="main">
          <h2>🔍 RAG検索エラー</h2>
          <div class="error"><strong>エラー:</strong> ${err.message}<br><pre style="margin-top:8px;font-size:.85em">${stderr}</pre></div>
          <p style="margin-top:16px"><a href="${url('/rag')}" style="color:#e94560">← 戻る</a></p>
        </div>`;
      return res.send(layout('RAG検索エラー', errorBody));
    }

    // テキスト形式をパース
    // 出力例:
    // [1] score:0.7375 | タイトル
    //      https://...
    //      【...】テキスト...
    const blocks = stdout.split(/\n\[(\d+)\]/).slice(1);
    const results: Array<{num:string, score:string, title:string, url:string, text:string}> = [];
    for (let i = 0; i < blocks.length; i += 2) {
      const num = blocks[i];
      const content = blocks[i+1] ?? '';
      const firstLine = content.split('\n')[0] ?? '';
      const scoreMatch = firstLine.match(/score:([\d.]+)/);
      const titleMatch = firstLine.match(/\|\s*(.+)$/);
      const urlMatch = content.match(/https?:\/\/\S+/);
      const textMatch = content.match(/【[^】]*】([\s\S]*)/);
      results.push({
        num,
        score: scoreMatch?.[1] ?? '0',
        title: titleMatch?.[1]?.trim() ?? '',
        url: urlMatch?.[0] ?? '',
        text: textMatch?.[1]?.trim() ?? content.slice(0, 400),
      });
    }

    const cards = results.map(r => `
      <div class="result-card">
        <div class="result-meta">
          <span>#${r.num}</span>
          <span class="result-score">スコア: ${parseFloat(r.score).toFixed(4)}</span>
          ${r.url ? `<a href="${r.url}" target="_blank" class="result-source" style="color:#50fa7b;text-decoration:none">${r.url.slice(0,60)}</a>` : ''}
        </div>
        ${r.title ? `<div style="font-weight:600;margin-bottom:6px">${r.title.replace(/</g,'&lt;')}</div>` : ''}
        <div class="result-text">${r.text.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0, 600)}${r.text.length > 600 ? '…' : ''}</div>
      </div>`).join('');

    const resultBody = `
      <div class="header">
        <a href="${url('/')}">🏭 labo-portal</a>
        <span class="sep">›</span>
        <a href="${url('/rag')}">🔍 RAG検索</a>
      </div>
      <div class="main">
        <h2>🔍 RAG検索結果</h2>
        <form method="post" action="${url('/rag')}" style="margin-bottom:20px">
          <div class="form-row">
            <input type="text" name="query" value="${query.replace(/"/g,'&quot;')}" required>
            <select name="collection">
              ${COLLECTIONS.map(c => `<option value="${c.id}"${c.id===collection?' selected':''}>${c.label}</option>`).join('')}
            </select>
            <select name="n">
              ${[3,5,10].map(v => `<option value="${v}"${v===n?' selected':''}>${v}件</option>`).join('')}
            </select>
            <button type="submit">再検索</button>
          </div>
        </form>
        <p class="count">「${query}」— ${collLabel} — ${results.length}件（${elapsed}ms）</p>
        ${results.length > 0 ? cards : '<p style="color:#888">結果が見つかりませんでした。</p>'}
      </div>`;

    res.send(layout('RAG検索結果', resultBody));
  });
});

export const meta = {
  name: 'RAG検索',
  icon: '🔍',
  desc: 'HQ PostgreSQL pgvectorで知識ベースを検索',
  layer: 'layer2' as const,
  url: '/rag',
};

export { router };
