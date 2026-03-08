"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = exports.meta = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("../../core/auth");
const upload_1 = require("../../core/upload");
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const WS = process.env.WORKSPACE_ROOT ?? '/home/node/.openclaw/workspace';
const url = (p) => `${BASE}${p}`;
const router = (0, express_1.Router)();
exports.router = router;
const DOC_ROOT = `${WS}/data/docs`;
const UPLOAD_DIR = `${WS}/data/docs`;
const ALLOWED_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.sh', '.ts', '.js', '.py', '.pdf', '.html', '.htm']);
function safeJoin(base, rel) {
    const full = path_1.default.resolve(base, rel);
    return full.startsWith(base) ? full : null;
}
function layout(title, body) {
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<title>${title} — labo-portal</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:12px 24px;
          display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:52px}
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
router.get('/', auth_1.requireAuth, (req, res) => {
    const rel = (req.query.path ?? '').replace(/\.\./g, '').replace(/^\//, '');
    const full = safeJoin(DOC_ROOT, rel);
    if (!full || !fs_1.default.existsSync(full))
        return res.status(404).send('Not found');
    if (!fs_1.default.statSync(full).isDirectory()) {
        return res.redirect(`${url('/docs/view')}?path=${encodeURIComponent(rel)}`);
    }
    const entries = fs_1.default.readdirSync(full).map(name => {
        const ep = path_1.default.join(full, name);
        const isDir = fs_1.default.statSync(ep).isDirectory();
        const ext = path_1.default.extname(name).toLowerCase();
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
        const ext = path_1.default.extname(e.name).toLowerCase();
        const isPdf = ext === '.pdf';
        const href = e.isDir
            ? `${url('/docs')}?path=${encodeURIComponent(childRel)}`
            : isPdf
                ? `${url('/docs/raw')}?path=${encodeURIComponent(childRel)}`
                : `${url('/docs/view')}?path=${encodeURIComponent(childRel)}`;
        const linkAttr = isPdf ? `target="_blank"` : '';
        const delBtn = !e.isDir
            ? `<form method="post" action="${url('/docs/delete')}" style="margin-left:auto;display:flex"
           onsubmit="return confirm('「${e.name}」を削除しますか？\\nこの操作は元に戻せません。');event.stopPropagation()">
           <input type="hidden" name="path" value="${childRel}">
           <input type="hidden" name="back" value="${rel}">
           <button type="submit" title="削除"
             style="padding:3px 8px;background:transparent;color:#555;border:1px solid #333;border-radius:4px;font-size:.78em;cursor:pointer"
             onmouseenter="this.style.color='#e94560';this.style.borderColor='#660020'"
             onmouseleave="this.style.color='#555';this.style.borderColor='#333'">🗑</button>
         </form>`
            : '';
        return `<li style="display:flex;align-items:center">
      <a href="${href}" ${linkAttr} style="display:flex;align-items:center;gap:10px;flex:1;padding:8px 0;color:#e0e0e0;text-decoration:none">
        <span>${e.isDir ? '📁' : isPdf ? '📑' : '📄'}</span>${e.name}${e.isDir ? '/' : ''}${isPdf ? ' <span style="font-size:.72em;color:#888;margin-left:4px">↗</span>' : ''}
      </a>
      ${delBtn}
    </li>`;
    }).join('');
    const body = `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <span class="bc">${crumbs}</span>
      <span style="flex:1"></span>
      <a href="${url('/docs/upload')}${rel ? '?path=' + encodeURIComponent(rel) : ''}"
        style="padding:6px 14px;background:#e94560;color:#fff;border-radius:5px;text-decoration:none;font-size:.82em;font-weight:600">📤 アップロード</a>
    </div>
    <div class="main">
      <ul class="dir-list">${items || '<li style="color:#888;padding:12px 0">（空のディレクトリ）</li>'}</ul>
    </div>`;
    res.send(layout(rel || 'workspace', body));
});
// ファイル表示
router.get('/view', auth_1.requireAuth, (req, res) => {
    const rel = (req.query.path ?? '').replace(/\.\./g, '').replace(/^\//, '');
    const full = safeJoin(DOC_ROOT, rel);
    if (!full || !fs_1.default.existsSync(full))
        return res.status(404).send('Not found');
    const ext = path_1.default.extname(full).toLowerCase();
    if (!ALLOWED_EXTS.has(ext))
        return res.status(403).send('Forbidden');
    // PDFはrawで新タブ表示
    if (ext === '.pdf') {
        return res.redirect(`${url('/docs/raw')}?path=${encodeURIComponent(rel)}`);
    }
    const filename = path_1.default.basename(full);
    const dirRel = path_1.default.dirname(rel);
    const rawContent = fs_1.default.readFileSync(full, 'utf-8');
    const escaped = rawContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <a class="bc" href="${url('/docs')}?path=${encodeURIComponent(dirRel)}">${dirRel}</a>
      <span class="sep">›</span>
      <span>${filename}</span>
      <span style="flex:1"></span>
      <a href="${url('/docs/raw')}?path=${encodeURIComponent(rel)}" download="${filename}"
        style="padding:6px 14px;background:#0f3460;color:#8be9fd;border-radius:5px;text-decoration:none;font-size:.82em;font-weight:600">⬇ DL</a>
      <span style="flex:1"></span>
      <form method="post" action="${url('/docs/delete')}" style="display:inline"
        onsubmit="return confirm('「${filename}」を削除しますか？\\nこの操作は元に戻せません。')">
        <input type="hidden" name="path" value="${rel}">
        <input type="hidden" name="back" value="${dirRel}">
        <button type="submit"
          style="padding:6px 14px;background:#3a0010;color:#e94560;border:1px solid #660020;border-radius:5px;font-size:.82em;font-weight:600;cursor:pointer"> <i class="fas fa-trash"></i> 削除</button>
      </form>
    </div>
    <div class="main">
      ${ext === '.md'
        ? `<div class="markdown-body" id="md"></div>
           <script>document.getElementById('md').innerHTML=marked.parse(${JSON.stringify(rawContent)});</script>`
        : `<pre style="background:#16213e;padding:24px;border-radius:8px;border:1px solid #0f3460;overflow-x:auto;line-height:1.5;font-size:.9em">${escaped}</pre>`}
    </div>`;
    res.send(layout(filename, body));
});
// ファイル削除
router.post('/delete', auth_1.requireAuth, (req, res) => {
    const rel = (req.body.path ?? '').replace(/\.\./g, '').replace(/^\//, '');
    const back = (req.body.back ?? '').replace(/\.\./g, '').replace(/^\//, '');
    const full = safeJoin(DOC_ROOT, rel);
    if (full && fs_1.default.existsSync(full) && !fs_1.default.statSync(full).isDirectory()) {
        const ext = path_1.default.extname(full).toLowerCase();
        if (ALLOWED_EXTS.has(ext))
            fs_1.default.unlinkSync(full);
    }
    res.redirect(`${url('/docs')}?path=${encodeURIComponent(back)}`);
});
// 生ファイル配信（ダウンロード用）
router.get('/raw', auth_1.requireAuth, (req, res) => {
    const rel = (req.query.path ?? '').replace(/\.\./g, '').replace(/^\//, '');
    const full = safeJoin(DOC_ROOT, rel);
    if (!full || !fs_1.default.existsSync(full))
        return res.status(404).send('Not found');
    const ext = path_1.default.extname(full).toLowerCase();
    if (!ALLOWED_EXTS.has(ext))
        return res.status(403).send('Forbidden');
    res.setHeader('Content-Disposition', `attachment; filename="${path_1.default.basename(full)}"`);
    res.sendFile(full);
});
// アップロード
const docUpload = (0, upload_1.makeDocUploader)(UPLOAD_DIR);
router.get('/upload', auth_1.requireAuth, (req, res) => {
    const destPath = req.query.path ?? '';
    res.send(layout('アップロード', `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <a href="${url('/docs')}"> <i class="fas fa-file-alt"></i> ドキュメント</a>
      <span class="sep">›</span>
      <span>アップロード</span>
    </div>
    <div class="main" style="max-width:600px">
      <h2 style="color:#e94560;margin-bottom:24px">📤 ドキュメントアップロード</h2>
      <form method="post" action="${url('/docs/upload')}${destPath ? '?path=' + encodeURIComponent(destPath) : ''}" enctype="multipart/form-data" id="uploadForm">
        <div id="dropZone" style="border:2px dashed #0f3460;border-radius:8px;padding:48px 32px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s">
          <div style="font-size:2.5em;margin-bottom:12px">📄</div>
          <p style="color:#aaa;margin-bottom:8px">ここにファイルをドロップ</p>
          <p style="color:#555;font-size:.82em;margin-bottom:16px">または</p>
          <label style="padding:8px 20px;background:#0f3460;color:#8be9fd;border-radius:6px;cursor:pointer;font-weight:600">
            ファイルを選択
            <input type="file" name="file" id="fileInput" accept=".txt,.md,.pdf,.html,.htm" required style="display:none">
          </label>
          <p id="fname" style="margin-top:14px;color:#8be9fd;font-size:.9em;min-height:1.2em"></p>
          <p style="color:#555;font-size:.78em;margin-top:8px">許可形式: .txt .md .pdf .html（最大5MB）</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
          <button type="submit" id="submitBtn"
            style="padding:10px 24px;background:#e94560;color:#fff;border:none;border-radius:6px;font-size:1em;font-weight:600;cursor:pointer">アップロード</button>
          <a href="${url('/docs')}${destPath ? '?path=' + encodeURIComponent(destPath) : ''}" style="color:#888;text-decoration:none">キャンセル</a>
        </div>
      </form>
      <script>
        const drop = document.getElementById('dropZone');
        const input = document.getElementById('fileInput');
        const fname = document.getElementById('fname');
        const form = document.getElementById('uploadForm');

        input.onchange = () => { if (input.files[0]) fname.textContent = input.files[0].name; };

        drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor='#e94560'; drop.style.background='rgba(233,69,96,.05)'; });
        drop.addEventListener('dragleave', () => { drop.style.borderColor='#0f3460'; drop.style.background=''; });
        drop.addEventListener('drop', e => {
          e.preventDefault();
          drop.style.borderColor='#0f3460'; drop.style.background='';
          const file = e.dataTransfer.files[0];
          if (!file) return;
          const dt = new DataTransfer(); dt.items.add(file);
          input.files = dt.files;
          fname.textContent = file.name;
        });
        drop.addEventListener('click', e => { if (e.target === drop || e.target.tagName === 'P' || e.target.tagName === 'DIV') input.click(); });
        form.onsubmit = () => { document.getElementById('submitBtn').textContent = 'アップロード中...'; };
      </script>
    </div>`));
});
router.post('/upload', auth_1.requireAuth, (req, res) => {
    docUpload.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).send(layout('エラー', `
        <div class="header"><a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a><span class="sep">›</span><a href="${url('/docs')}"> <i class="fas fa-file-alt"></i> ドキュメント</a></div>
        <div class="main">
          <p style="color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px">${err.message}</p>
          <p style="margin-top:12px"><a href="${url('/docs/upload')}" style="color:#e94560">← 戻る</a></p>
        </div>`));
        }
        const f = req.file;
        res.send(layout('完了', `
      <div class="header"><a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a><span class="sep">›</span><a href="${url('/docs')}"> <i class="fas fa-file-alt"></i> ドキュメント</a></div>
      <div class="main">
        <p style="color:#50fa7b;margin-bottom:16px">✅ アップロード完了: ${f.filename}</p>
        <p><a href="${url('/docs')}?path=uploads/docs" style="color:#8be9fd">アップロードフォルダを開く</a>
        &nbsp;&nbsp;<a href="${url('/docs/upload')}" style="color:#888">もう一枚</a></p>
      </div>`));
    });
});
exports.meta = {
    name: 'Document Viewer',
    icon: 'fas fa-file-alt',
    desc: 'Markdown・テキスト・設定ファイルを表示＆アップロード',
    layer: 'core',
    url: '/docs',
};
