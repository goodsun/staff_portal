import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../core/auth';
import { makeAssetUploader } from '../../core/upload';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string) => `${BASE}${p}`;

const router = Router();
const ASSET_ROOT = '/home/node/.openclaw/workspace/data/assets';
const UPLOAD_DIR = '/home/node/.openclaw/workspace/data/assets/uploads';

if (!fs.existsSync(ASSET_ROOT)) fs.mkdirSync(ASSET_ROOT, { recursive: true });

const assetUpload = makeAssetUploader(UPLOAD_DIR);

const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const VIDEO_EXTS  = new Set(['.mp4', '.webm', '.mov']);
const MODEL_EXTS  = new Set(['.glb', '.gltf']);

type AssetKind = 'image' | 'video' | 'model' | 'other';

function getKind(filename: string): AssetKind {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (MODEL_EXTS.has(ext)) return 'model';
  return 'other';
}

function kindIcon(kind: AssetKind) {
  return { image: '🖼', video: 'video', model: 'model', other: 'file' }[kind];
}

function safeJoin(base: string, rel: string): string | null {
  const full = path.resolve(base, rel);
  return full.startsWith(base) ? full : null;
}

const ALLOWED_EXTS = new Set([
  ...IMAGE_EXTS, ...VIDEO_EXTS, ...MODEL_EXTS
]);

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — labo-portal</title>
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:12px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .header a{color:#e94560;text-decoration:none;font-size:.9em}
  .header a:hover{text-decoration:underline}
  .sep{color:#555}
  .bc a{color:#8be9fd;text-decoration:none}
  .main{max-width:1100px;margin:0 auto;padding:24px}
  .toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px}
  .btn-upload{display:inline-block;padding:8px 18px;background:#e94560;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;font-size:.9em}
  .btn-upload:hover{background:#c73652}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
  .asset-card{background:#16213e;border:1px solid #0f3460;border-radius:8px;overflow:hidden;transition:border-color .2s}
  .asset-card:hover{border-color:#e94560}
  .asset-card a{text-decoration:none;color:#e0e0e0;display:block}
  .asset-thumb{height:140px;display:flex;align-items:center;justify-content:center;background:#0d1117;overflow:hidden}
  .asset-thumb img{max-width:100%;max-height:140px;object-fit:contain}
  .asset-thumb video{max-width:100%;max-height:140px;object-fit:contain}
  .asset-thumb .icon-big{font-size:3em}
  .asset-info{padding:10px 12px}
  .asset-name{font-size:.82em;word-break:break-all;color:#d0d0d0}
  .asset-kind{font-size:.72em;color:#888;margin-top:3px}
  .dir-list{list-style:none}
  .dir-list li{padding:8px 0;border-bottom:1px solid #0f3460}
  .dir-list li:last-child{border:none}
  .dir-list a{color:#e0e0e0;text-decoration:none;display:flex;align-items:center;gap:10px}
  .dir-list a:hover{color:#e94560}
  .preview-wrap{text-align:center;margin-bottom:24px}
  .preview-wrap img{max-width:100%;max-height:70vh;border-radius:8px;border:1px solid #0f3460}
  .preview-wrap video{max-width:100%;max-height:70vh;border-radius:8px}
  model-viewer{width:100%;height:500px;border-radius:8px;border:1px solid #0f3460;background:#0d1117}
  .meta-row{color:#888;font-size:.85em;margin-top:8px}
  .actions{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap}
  .actions a{padding:8px 18px;border-radius:6px;text-decoration:none;font-size:.9em;font-weight:600}
  .btn-dl{background:#0f3460;color:#8be9fd}
  .btn-back{background:#1a1a2e;color:#888;border:1px solid #555}
  .upload-zone{border:2px dashed #0f3460;border-radius:8px;padding:40px;text-align:center;transition:border-color .2s}
  .upload-zone:hover{border-color:#e94560}
  .upload-zone input{display:none}
  .upload-zone label{cursor:pointer}
  .upload-zone .drop-text{color:#888;font-size:.9em;margin-bottom:12px}
  .btn-file{display:inline-block;padding:9px 20px;background:#0f3460;color:#8be9fd;border-radius:6px;font-weight:600;cursor:pointer}
  .btn-file:hover{background:#1a4480}
  .empty{color:#888;padding:40px 0;text-align:center}
</style></head><body>
${body}
</body></html>`;
}

// ディレクトリ一覧 / グリッド表示
router.get('/', requireAuth, (req, res) => {
  const rel = (req.query.path as string ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(ASSET_ROOT, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).send('Not found');

  if (!fs.statSync(full).isDirectory()) {
    return res.redirect(`${url('/assets/view')}?path=${encodeURIComponent(rel)}`);
  }

  const entries = fs.readdirSync(full).map(name => {
    const ep = path.join(full, name);
    const isDir = fs.statSync(ep).isDirectory();
    const ext = path.extname(name).toLowerCase();
    const allowed = isDir || ALLOWED_EXTS.has(ext);
    const kind: AssetKind = isDir ? 'other' : getKind(name);
    return { name, isDir, allowed, kind };
  }).filter(e => !e.name.startsWith('.') && e.allowed)
    .sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));

  const relParts = rel.split('/').filter(Boolean);
  const crumbs = [
    `<a href="${url('/assets')}">assets</a>`,
    ...relParts.map((p, i) => {
      const link = relParts.slice(0, i + 1).join('/');
      return `<a href="${url('/assets')}?path=${encodeURIComponent(link)}">${p}</a>`;
    })
  ].join(' <span class="sep">›</span> ');

  const dirs = entries.filter(e => e.isDir);
  const files = entries.filter(e => !e.isDir);

  const dirItems = dirs.map(e => {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    return `<li><a href="${url('/assets')}?path=${encodeURIComponent(childRel)}"><span class="icon"><i class="fas fa-folder"></i></span>${e.name}/</a></li>`;
  }).join('');

  const fileCards = files.map(e => {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    const viewHref = `${url('/assets/view')}?path=${encodeURIComponent(childRel)}`;
    const thumb = e.kind === 'image'
      ? `<img src="${url('/assets/raw')}?path=${encodeURIComponent(childRel)}" alt="${e.name}" loading="lazy">`
      : e.kind === 'video'
      ? `<video src="${url('/assets/raw')}?path=${encodeURIComponent(childRel)}" muted></video>`
      : `<span class="icon-big">${kindIcon(e.kind)}</span>`;

    return `
      <div class="asset-card" style="position:relative">
        <a href="${viewHref}">
          <div class="asset-thumb">${thumb}</div>
          <div class="asset-info">
            <div class="asset-name">${e.name}</div>
            <div class="asset-kind">${kindIcon(e.kind)} ${e.kind}</div>
          </div>
        </a>
        <form method="post" action="${url('/assets/delete')}"
          onsubmit="return confirm('「${e.name}」を削除しますか？\\nこの操作は元に戻せません。')"
          style="position:absolute;top:6px;right:6px;margin:0">
          <input type="hidden" name="path" value="${childRel}">
          <input type="hidden" name="back" value="${rel}">
          <button type="submit" title="削除"
            style="width:26px;height:26px;background:rgba(26,0,16,0.85);color:#e94560;border:1px solid #660020;border-radius:50%;font-size:.8em;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">✕</button>
        </form>
      </div>`;
  }).join('');

  const body = `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <span class="bc">${crumbs}</span>
    </div>
    <div class="main">
      <div class="toolbar">
        <div></div>
        <a href="${url('/assets/upload')}${rel ? '?path=' + encodeURIComponent(rel) : ''}" class="btn-upload">📤 アップロード</a>
      </div>
      ${dirs.length > 0 ? `<ul class="dir-list" style="margin-bottom:20px">${dirItems}</ul>` : ''}
      ${files.length > 0
        ? `<div class="grid">${fileCards}</div>`
        : `<div class="empty">アセットがありません</div>`
      }
    </div>`;

  res.send(layout(rel || 'assets', body));
});

// ファイルプレビュー
router.get('/view', requireAuth, (req, res) => {
  const rel = (req.query.path as string ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(ASSET_ROOT, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).send('Not found');

  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).send('Forbidden');

  const filename = path.basename(full);
  const dirRel = path.dirname(rel);
  const stat = fs.statSync(full);
  const sizeKB = (stat.size / 1024).toFixed(1);
  const kind = getKind(filename);
  const rawUrl = `${url('/assets/raw')}?path=${encodeURIComponent(rel)}`;

  let preview = '';
  if (kind === 'image') {
    preview = `<img src="${rawUrl}" alt="${filename}" style="max-width:100%;max-height:70vh;border-radius:8px;border:1px solid #0f3460">`;
  } else if (kind === 'video') {
    preview = `<video src="${rawUrl}" controls style="max-width:100%;max-height:70vh;border-radius:8px"></video>`;
  } else if (kind === 'model') {
    preview = `<model-viewer src="${rawUrl}" alt="${filename}" camera-controls auto-rotate shadow-intensity="1" style="width:100%;height:500px;border-radius:8px;border:1px solid #0f3460;background:#0d1117"></model-viewer>`;
  } else {
    preview = `<p style="color:#888">プレビュー非対応</p>`;
  }

  const body = `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <a class="bc" href="${url('/assets')}?path=${encodeURIComponent(dirRel)}">${dirRel || 'assets'}</a>
      <span class="sep">›</span>
      <span>${filename}</span>
    </div>
    <div class="main">
      ${kind === 'image' ? `
      <div style="position:relative;display:inline-block;max-width:100%">
        <img src="${rawUrl}" alt="${filename}" style="max-width:100%;max-height:70vh;border-radius:8px;border:1px solid #0f3460;display:block">
        <form method="post" action="${url('/assets/delete')}"
          onsubmit="return confirm('「${filename}」を削除しますか？\\nこの操作は元に戻せません。')"
          style="position:absolute;top:8px;right:8px;margin:0">
          <input type="hidden" name="path" value="${rel}">
          <input type="hidden" name="back" value="${dirRel}">
          <button type="submit" title="削除"
            style="width:32px;height:32px;background:rgba(233,69,96,0.9);color:#fff;border:none;border-radius:50%;font-size:1.1em;font-weight:700;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.5)">✕</button>
        </form>
      </div>` : `<div class="preview-wrap">${preview}</div>`}
      <div class="meta-row" style="margin-top:12px">${kindIcon(kind)} ${kind} &nbsp;|&nbsp; ${sizeKB} KB &nbsp;|&nbsp; ${filename}</div>
      <div class="actions" style="margin-top:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <a href="${rawUrl}" download="${filename}" class="actions a btn-dl">⬇ ダウンロード</a>
        <a href="${url('/assets')}?path=${encodeURIComponent(dirRel)}" class="actions a btn-back">← 戻る</a>
        ${kind !== 'image' ? `
        <span style="flex:1"></span>
        <form method="post" action="${url('/assets/delete')}"
          onsubmit="return confirm('「${filename}」を削除しますか？\\nこの操作は元に戻せません。')"
          style="display:inline">
          <input type="hidden" name="path" value="${rel}">
          <input type="hidden" name="back" value="${dirRel}">
          <button type="submit"
            style="padding:8px 18px;background:#3a0010;color:#e94560;border:1px solid #660020;border-radius:6px;font-size:.9em;font-weight:600;cursor:pointer"> <i class="fas fa-trash"></i> 削除</button>
        </form>` : ''}
      </div>
    </div>`;

  res.send(layout(filename, body));
});

// 生ファイル配信（認証付き）
router.get('/raw', requireAuth, (req, res) => {
  const rel = (req.query.path as string ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(ASSET_ROOT, rel);
  if (!full || !fs.existsSync(full)) return res.status(404).send('Not found');

  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) return res.status(403).send('Forbidden');

  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  };
  res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');
  res.sendFile(full);
});

// ファイル削除
router.post('/delete', requireAuth, (req, res) => {
  const rel = (req.body.path ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const back = (req.body.back ?? '').replace(/\.\./g, '').replace(/^\//, '');
  const full = safeJoin(ASSET_ROOT, rel);
  if (full && fs.existsSync(full) && !fs.statSync(full).isDirectory()) {
    const ext = path.extname(full).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) fs.unlinkSync(full);
  }
  res.redirect(`${url('/assets')}?path=${encodeURIComponent(back)}`);
});

// アップロードフォーム
router.get('/upload', requireAuth, (req, res) => {
  const destPath = (req.query.path as string ?? '');
  const body = `
    <div class="header">
      <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
      <span class="sep">›</span>
      <a href="${url('/assets')}"> <i class="fas fa-images"></i> アセット</a>
      <span class="sep">›</span>
      <span>アップロード</span>
    </div>
    <div class="main" style="max-width:600px">
      <h2 style="color:#e94560;margin-bottom:24px">📤 アセットアップロード</h2>
      <form method="post" action="${url('/assets/upload')}${destPath ? '?path=' + encodeURIComponent(destPath) : ''}" enctype="multipart/form-data" id="uploadForm">
        <div id="dropZone" style="border:2px dashed #0f3460;border-radius:8px;padding:48px 32px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s">
          <div style="font-size:2.5em;margin-bottom:12px">🖼</div>
          <p style="color:#aaa;margin-bottom:8px">ここにファイルをドロップ</p>
          <p style="color:#555;font-size:.82em;margin-bottom:16px">または</p>
          <label style="padding:8px 20px;background:#0f3460;color:#8be9fd;border-radius:6px;cursor:pointer;font-weight:600">
            ファイルを選択
            <input type="file" id="fileInput" name="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.mp4,.webm,.mov,.glb,.gltf" required style="display:none">
          </label>
          <p id="fname" style="margin-top:14px;color:#8be9fd;font-size:.9em;min-height:1.2em"></p>
          <p style="color:#555;font-size:.78em;margin-top:8px">画像 / 動画 / 3Dモデル（最大100MB）</p>
        </div>
        <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
          <button type="submit" id="submitBtn"
            style="padding:10px 24px;background:#e94560;color:#fff;border:none;border-radius:6px;font-size:1em;font-weight:600;cursor:pointer">アップロード</button>
          <a href="${url('/assets')}${destPath ? '?path=' + encodeURIComponent(destPath) : ''}" style="color:#888;text-decoration:none">キャンセル</a>
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
    </div>`;
  res.send(layout('アセットアップロード', body));
});

// アップロード処理
router.post('/upload', requireAuth, (req, res) => {
  assetUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).send(layout('エラー', `
        <div class="header"><a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a><span class="sep">›</span><a href="${url('/assets')}"> <i class="fas fa-images"></i> アセット</a></div>
        <div class="main">
          <p style="color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px">${err.message}</p>
          <p style="margin-top:12px"><a href="${url('/assets/upload')}" style="color:#e94560">← 戻る</a></p>
        </div>`));
    }
    const f = (req as any).file;
    const kind = getKind(f.filename);
    const previewPath = `uploads/${f.filename}`;

    res.send(layout('完了', `
      <div class="header"><a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a><span class="sep">›</span><a href="${url('/assets')}"> <i class="fas fa-images"></i> アセット</a></div>
      <div class="main" style="max-width:720px">
        <p style="color:#50fa7b;margin-bottom:16px">✅ アップロード完了</p>
        ${kind === 'image'
          ? `<img src="${url('/assets/raw')}?path=${encodeURIComponent(previewPath)}" style="max-width:100%;max-height:400px;border-radius:8px;border:1px solid #0f3460">`
          : `<p style="color:#aaa">${kindIcon(kind)} ${f.filename}</p>`
        }
        <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap">
          <a href="${url('/assets/view')}?path=${encodeURIComponent(previewPath)}" style="padding:8px 18px;background:#0f3460;color:#8be9fd;border-radius:6px;text-decoration:none;font-weight:600">プレビュー</a>
          <a href="${url('/assets/upload')}" style="padding:8px 18px;background:#1a1a2e;color:#888;border:1px solid #555;border-radius:6px;text-decoration:none">もう一枚</a>
          <a href="${url('/assets')}" style="padding:8px 18px;background:#1a1a2e;color:#888;border:1px solid #555;border-radius:6px;text-decoration:none">一覧へ</a>
        </div>
      </div>`));
  });
});

export const meta = {
  name: 'Asset Viewer',
  icon: 'fas fa-images',
  desc: '画像・動画・3Dモデルの表示＆アップロード',
  layer: 'core' as const,
  url: '/assets',
};

export { router };
