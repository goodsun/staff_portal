import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../core/auth';
import { url } from '../../app';

const router = Router();
const DOC_ROOT = process.env.DOCS_ROOT ?? path.join(process.env.HOME ?? '/home/node', '.openclaw', 'workspace');
const ALLOWED_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.sh', '.ts', '.js', '.py']);

function safeJoin(base: string, rel: string): string | null {
  const full = path.resolve(base, rel);
  return full.startsWith(base) ? full : null;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — labo-portal</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:12px 24px;
          display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .header a{color:#e94560;text-decoration:none;font-size:.9em}
  .header a:hover{text-decoration:underline}
  .sep{color:#555}
  .bc a{color:#8be9fd;text-decoration:none}
  .bc a:hover{text-decoration:underline}
  .main{max-width:960px;margin:0 auto;padding:24px}
  .dir-list{list-style:none}
  .dir-list li{padding:8px 0;border-bottom:1px solid #0f3460}
  .dir-list li:last-child{border:none}
  .dir-list a{color:#e0e0e0;text-decoration:none;display:flex;align-items:center;gap:10px}
  .dir-list a:hover{color:#e94560}
  .markdown-body{background:#16213e!important;padding:32px;border-radius:8px;border:1px solid #0f3460}
</style></head><body>${body}</body></html>`;
}

// ディレクトリ一覧
router.get('/', requireAuth, (req, res) => {
  const rel = (req.query.path as string ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(DOC_ROOT, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).send('Not found');

  if (!fs.statSync(full).isDirectory()) {
    return res.redirect(`${url('/docs/view')}?path=${encodeURIComponent(rel)}`);
  }

  const entries = fs.readdirSync(full).map(name => {
    const ep = path.join(full, name);
    const isDir = fs.statSync(ep).isDirectory();
    const ext = path.extname(name).toLowerCase();
    return { name, isDir, allowed: isDir || ALLOWED_EXTS.has(ext) };
  }).filter(e => !e.name.startsWith('.') && e.allowed)
    .sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));

  const relParts = rel.split('/').filter(Boolean);
  const crumbs = [
    `<a href="${url('/docs')}">workspace</a>`,
    ...relParts.map((p, i) => {
      const link = relParts.slice(0, i + 1).join('/');
      return `<a href="${url('/docs')}?path=${encodeURIComponent(link)}">${p}</a>`;
    })
  ].join(' <span class="sep">›</span> ');

  const items = entries.map(e => {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    const href = e.isDir
      ? `${url('/docs')}?path=${encodeURIComponent(childRel)}`
      : `${url('/docs/view')}?path=${encodeURIComponent(childRel)}`;
    return `<li><a href="${href}"><span>${e.isDir ? '📁' : '📄'}</span>${e.name}${e.isDir ? '/' : ''}</a></li>`;
  }).join('');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span class="bc">${crumbs}</span>
    </div>
    <div class="main">
      <ul class="dir-list">${items || '<li style="color:#888;padding:12px 0">（空のディレクトリ）</li>'}</ul>
    </div>`;

  res.send(layout(rel || 'workspace', body));
});

// ファイル表示
router.get('/view', requireAuth, (req, res) => {
  const rel = (req.query.path as string ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(DOC_ROOT, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).send('Not found');

  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).send('Forbidden');

  const filename = path.basename(full);
  const dirRel = path.dirname(rel);
  const rawContent = fs.readFileSync(full, 'utf-8');
  const escaped = rawContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <a class="bc" href="${url('/docs')}?path=${encodeURIComponent(dirRel)}">${dirRel}</a>
      <span class="sep">›</span>
      <span>${filename}</span>
    </div>
    <div class="main">
      ${ext === '.md'
        ? `<div class="markdown-body" id="md"></div>
           <script>document.getElementById('md').innerHTML=marked.parse(${JSON.stringify(rawContent)});</script>`
        : `<pre style="background:#16213e;padding:24px;border-radius:8px;border:1px solid #0f3460;overflow-x:auto;line-height:1.5;font-size:.9em">${escaped}</pre>`
      }
    </div>`;

  res.send(layout(filename, body));
});

export const meta = {
  name: 'Document Viewer',
  icon: '📄',
  desc: 'Markdown・テキスト・設定ファイルを表示',
  layer: 'core' as const,
  url: '/docs',
};

export { router };
