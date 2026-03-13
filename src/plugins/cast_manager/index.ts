import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { requireAuth } from '../../core/auth';

const BASE: string = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const WS = process.env.WORKSPACE_ROOT ?? '/home/node/.openclaw/workspace';
const url = (p: string): string => BASE + p;
const router = Router();

const CASTS_DIR = `${WS}/data/casts`;

// ── multer ────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, _f, cb) => {
    const dir = path.join(CASTS_DIR, req.params.id);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.jpg','.jpeg','.png','.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
});

// ── Profile型（実際のprofile.jsonに合わせた） ────
interface StyleDef {
  description: string;
  image: string;
  prompt_features_override?: string | null;
}

interface Profile {
  name: string;
  display_name?: string;
  emoji?: string;
  role?: string;
  division?: string;
  hire_date?: string;
  character?: string;
  prompt_features?: string;
  default_style?: string;
  styles?: Record<string, StyleDef>;
  personality?: Record<string, string>;
  avatars?: Record<string, string>;
  updated_at?: string;
  [key: string]: unknown;
}

// ── helpers ──────────────────────────────────────
function loadProfile(id: string): Profile | null {
  const f = path.join(CASTS_DIR, id, 'profile.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
}

function saveProfile(id: string, p: Profile) {
  fs.writeFileSync(path.join(CASTS_DIR, id, 'profile.json'), JSON.stringify(p, null, 2));
}

function listCasts(): Array<{id: string} & Profile> {
  if (!fs.existsSync(CASTS_DIR)) return [];
  return fs.readdirSync(CASTS_DIR)
    .filter(d => fs.statSync(path.join(CASTS_DIR, d)).isDirectory())
    .map(d => { const p = loadProfile(d); return p ? { id: d, ...p } : null; })
    .filter(Boolean) as Array<{id: string} & Profile>;
}

/** stylesのデフォルト画像、またはフォルダ内の最初の画像を返す */
function getMainImageFile(id: string, profile: Profile): string | null {
  const defaultStyle = profile.default_style ?? 'normal';
  const styleDef = profile.styles?.[defaultStyle];
  if (styleDef?.image) {
    const full = path.join(CASTS_DIR, id, styleDef.image);
    if (fs.existsSync(full)) return styleDef.image;
  }
  // fallback: フォルダ内の画像を探す
  const dir = path.join(CASTS_DIR, id);
  const imgs = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  return imgs[0] ?? null;
}

/** フォルダ内の全画像ファイル一覧 */
function listImages(id: string): string[] {
  const dir = path.join(CASTS_DIR, id);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

function sanitizeId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

// ── layout ───────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<title>${title} — labo-portal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:12px 24px;display:flex;align-items:center;gap:12px}
  .header a{color:#e94560;text-decoration:none;font-size:.9em}
  .sep{color:#555}
  .main{max-width:960px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  h3{color:#aaa;font-size:.85em;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px}
  .card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:20px;margin-bottom:16px}
  label{display:block;color:#aaa;font-size:.82em;margin-bottom:5px}
  input[type=text],textarea{width:100%;padding:9px 12px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;color:#e0e0e0;font-size:.9em;font-family:inherit}
  input:focus,textarea:focus{outline:none;border-color:#e94560}
  textarea{resize:vertical}
  .btn{padding:9px 20px;border:none;border-radius:6px;font-size:.9em;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
  .btn-primary{background:#e94560;color:#fff}
  .btn-primary:hover{background:#c73652}
  .btn-ghost{background:#0f3460;color:#8be9fd}
  .btn-danger{background:#550010;color:#e94560;border:1px solid #e94560}
  .btn-danger:hover{background:#e94560;color:#fff}
  .btn-sm{padding:5px 12px;font-size:.8em}
  .cast-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
  .cast-card{background:#0d1117;border:1px solid #0f3460;border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .2s}
  .cast-card:hover{border-color:#e94560}
  .cast-card .thumb{width:100%;aspect-ratio:1;background:#16213e;display:flex;align-items:center;justify-content:center;font-size:3em;overflow:hidden}
  .cast-card .thumb img{width:100%;height:100%;object-fit:cover}
  .cast-card .info{padding:10px 10px 4px}
  .cast-card .cname{font-weight:700;font-size:.95em}
  .cast-card .crole{color:#888;font-size:.78em;margin-top:3px}
  .cast-card .actions{display:flex;gap:6px;padding:0 10px 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .hint{color:#555;font-size:.78em;margin-top:4px}
  .path-badge{font-size:.75em;color:#555;background:#0d1117;border:1px solid #1a2a4a;border-radius:4px;padding:3px 8px;font-family:monospace;cursor:pointer;user-select:all}
  .path-badge:hover{color:#8be9fd;border-color:#0f3460}
  .alert{padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:.9em}
  .alert-ok{background:#0a2a0a;border:1px solid #50fa7b;color:#50fa7b}
  .alert-err{background:#2a0a0a;border:1px solid #e94560;color:#e94560}
  /* 画像ギャラリー */
  .gallery{position:relative;background:#0d1117;border:1px solid #0f3460;border-radius:8px;overflow:hidden;aspect-ratio:1}
  .gallery img{width:100%;height:100%;object-fit:contain;display:none}
  .gallery img.active{display:block}
  .gallery .nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.6);border:none;color:#fff;font-size:1.4em;padding:8px 12px;cursor:pointer;border-radius:6px}
  .gallery .nav:hover{background:rgba(233,69,96,.7)}
  .gallery .nav-prev{left:8px}
  .gallery .nav-next{right:8px}
  .gallery .counter{position:absolute;bottom:8px;right:10px;font-size:.75em;color:#aaa;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:10px}
  .style-label{position:absolute;bottom:8px;left:10px;font-size:.75em;color:#8be9fd;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:10px}
  .detail-layout{display:grid;grid-template-columns:280px 1fr;gap:24px;align-items:start}
  .info-row{display:flex;gap:8px;margin-bottom:10px;align-items:baseline}
  .info-label{color:#555;font-size:.8em;min-width:80px}
  .info-val{color:#e0e0e0;font-size:.9em}
</style></head>
<body>${body}
<script>
function initGallery(el) {
  const imgs = el.querySelectorAll('img');
  let cur = 0;
  function show(i) {
    imgs.forEach((img,j) => img.classList.toggle('active', j===i));
    const counter = el.querySelector('.counter');
    if(counter) counter.textContent = (i+1) + ' / ' + imgs.length;
    const label = el.querySelector('.style-label');
    if(label) label.textContent = imgs[i]?.dataset.style || '';
  }
  el.querySelector('.nav-prev')?.addEventListener('click', () => { cur=(cur-1+imgs.length)%imgs.length; show(cur); });
  el.querySelector('.nav-next')?.addEventListener('click', () => { cur=(cur+1)%imgs.length; show(cur); });
  show(0);
}
document.querySelectorAll('.gallery').forEach(initGallery);
</script>
</body></html>`;
}

function headerHtml(sub?: string): string {
  return `<div class="header">
    <a href="${url('/')}"><i class="fas fa-industry"></i> labo-portal</a>
    <span class="sep">›</span>
    <a href="${url('/cast_manager')}"><i class="fas fa-masks-theater"></i> キャスト</a>
    ${sub ? `<span class="sep">›</span><span>${sub}</span>` : ''}
  </div>`;
}

function pathBadge(p: string): string {
  return `<span class="path-badge" title="クリックでコピー" onclick="navigator.clipboard.writeText('${p}').then(()=>this.style.color='#50fa7b').catch(()=>{})">📁 ${p}</span>`;
}

// ── GET: 画像配信 ─────────────────────────────────
router.get('/:id/img/:file', requireAuth, (req, res) => {
  const filePath = path.join(CASTS_DIR, req.params.id, req.params.file);
  if (!filePath.startsWith(CASTS_DIR)) return res.status(403).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── GET: 一覧 ─────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const casts = listCasts();
  const msg = (req.query.msg as string) ?? '';

  const cards = casts.map(c => {
    const mainImg = getMainImageFile(c.id, c);
    const thumb = mainImg
      ? `<img src="${url('/cast_manager/' + c.id + '/img/' + mainImg)}" alt="${c.name}">`
      : `<span>${c.emoji || '👤'}</span>`;
    return `
      <div class="cast-card">
        <a href="${url('/cast_manager/' + c.id)}" style="text-decoration:none;color:inherit">
          <div class="thumb">${thumb}</div>
          <div class="info">
            <div class="cname">${c.emoji || ''} ${c.name}</div>
            <div class="crole">${c.role || c.division || ''}</div>
          </div>
        </a>
        <div class="actions">
          <a href="${url('/cast_manager/' + c.id + '/edit')}" class="btn btn-ghost btn-sm" style="flex:1;text-align:center">編集</a>
          <form method="post" action="${url('/cast_manager/' + c.id + '/delete')}"
            onsubmit="return confirm('「${c.name}」を削除しますか？')" style="margin:0">
            <button type="submit" class="btn btn-danger btn-sm">削除</button>
          </form>
        </div>
      </div>`;
  }).join('');

  const body = `
    ${headerHtml()}
    <div class="main">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2><i class="fas fa-masks-theater"></i> キャスト管理</h2>
        <a href="${url('/cast_manager/new')}" class="btn btn-primary">＋ 新規</a>
      </div>
      <div style="margin-bottom:20px">${pathBadge(CASTS_DIR)}</div>
      ${msg === 'saved' ? '<div class="alert alert-ok">✅ 保存しました</div>' : ''}
      ${msg === 'deleted' ? '<div class="alert alert-ok">✅ 削除しました</div>' : ''}
      <div class="cast-grid">${cards || '<p style="color:#555">キャストがありません</p>'}</div>
    </div>`;
  res.send(layout('キャスト管理', body));
});

// ── GET: 詳細 ─────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  if (req.params.id === 'new') return res.redirect(url('/cast_manager/new'));
  const id = req.params.id;
  const profile = loadProfile(id);
  if (!profile) return res.redirect(url('/cast_manager'));

  const castDir = path.join(CASTS_DIR, id);
  const allImages = listImages(id);

  // stylesに登録されている画像と未登録画像を分離
  const styledImages: Array<{file: string, styleKey: string, label: string, exists: boolean}> = [];
  const unstyledImages: string[] = [...allImages];

  if (profile.styles) {
    for (const [sKey, sDef] of Object.entries(profile.styles)) {
      const imgFile = sDef.image;
      const exists = allImages.includes(imgFile);
      const label = `${sKey}${sDef.description ? ' — ' + sDef.description : ''}`;
      styledImages.push({ file: imgFile, styleKey: sKey, label, exists });
      
      // 未登録リストから削除
      const idx = unstyledImages.indexOf(imgFile);
      if (idx !== -1) unstyledImages.splice(idx, 1);
    }
  }

  // ギャラリー画像HTML生成
  const galleryImgs = styledImages
    .filter(s => s.exists)
    .map(s => `<img src="${url('/cast_manager/' + id + '/img/' + s.file)}" alt="${s.label}" data-style="${s.label}">`)
    .concat(
      unstyledImages.map(img => `<img src="${url('/cast_manager/' + id + '/img/' + img)}" alt="${img}" data-style="未分類 — ${img}">`)
    )
    .join('');

  // スタイル画像の警告（存在しない場合）
  const missingImages = styledImages.filter(s => !s.exists);
  const warnings = missingImages.length > 0
    ? `<div class="alert alert-err" style="margin-bottom:16px">⚠️ 以下の画像が見つかりません: ${missingImages.map(m => `<code>${m.file}</code> (${m.styleKey})`).join(', ')}</div>`
    : '';

  const totalImages = styledImages.filter(s => s.exists).length + unstyledImages.length;
  
  const gallery = totalImages > 0 ? `
    <div class="gallery">
      ${galleryImgs}
      ${totalImages > 1 ? `<button class="nav nav-prev">‹</button><button class="nav nav-next">›</button>` : ''}
      <div class="counter"></div>
      <div class="style-label"></div>
    </div>` : `<div style="background:#0d1117;border:1px solid #0f3460;border-radius:8px;aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:4em">${profile.emoji || '👤'}</div>`;
  
  // 未登録画像の情報
  const unstyledInfo = unstyledImages.length > 0
    ? `<div class="alert alert-ok" style="margin-top:16px">ℹ️ 未分類画像: ${unstyledImages.length}件 — ${unstyledImages.map(f => `<code>${f}</code>`).join(', ')}</div>`
    : '';

  const personality = profile.personality && Object.keys(profile.personality).length > 0
    ? Object.entries(profile.personality).map(([k, v]) => `<div class="info-row"><span class="info-label">${k}</span><span class="info-val">${v}</span></div>`).join('')
    : '';

  const body = `
    ${headerHtml(profile.name)}
    <div class="main">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h2>${profile.emoji || '👤'} ${profile.name}</h2>
        <div style="display:flex;gap:8px">
          <a href="${url('/cast_manager/' + id + '/edit')}" class="btn btn-ghost btn-sm"><i class="fas fa-edit"></i> 編集</a>
          <a href="${url('/cast_manager')}" class="btn btn-ghost btn-sm">← 一覧</a>
        </div>
      </div>
      <div style="margin-bottom:20px">${pathBadge(castDir)}</div>
      ${warnings}
      <div class="detail-layout">
        <div>${gallery}</div>
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="info-row"><span class="info-label">役割</span><span class="info-val">${profile.role || '—'}</span></div>
          <div class="info-row"><span class="info-label">部署</span><span class="info-val">${profile.division || '—'}</span></div>
          <div class="info-row"><span class="info-label">入社日</span><span class="info-val">${profile.hire_date || '—'}</span></div>
          ${profile.character ? `<div><span class="info-label" style="display:block;margin-bottom:4px">キャラクター</span><p style="font-size:.85em;line-height:1.6;color:#ccc">${profile.character}</p></div>` : ''}
          ${profile.prompt_features ? `<div><span class="info-label" style="display:block;margin-bottom:4px">プロンプト特徴</span><p style="font-size:.8em;line-height:1.5;color:#888;font-family:monospace">${profile.prompt_features}</p></div>` : ''}
          ${personality ? `<div><span class="info-label" style="display:block;margin-bottom:8px">パーソナリティ</span>${personality}</div>` : ''}
        </div>
      </div>
      ${unstyledInfo}
    </div>`;
  res.send(layout(profile.name, body));
});

// ── GET: 編集フォーム ─────────────────────────────
router.get('/:id/edit', requireAuth, (req, res) => {
  const id = req.params.id;
  const profile = loadProfile(id);
  if (!profile) return res.redirect(url('/cast_manager'));

  const v = (f: string) => (profile[f] as string) ?? '';

  const body = `
    ${headerHtml('編集')}
    <div class="main">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2><i class="fas fa-edit"></i> ${profile.name} を編集</h2>
        <div style="margin-bottom:0">${pathBadge(path.join(CASTS_DIR, id))}</div>
      </div>
      <form method="post" action="${url('/cast_manager/' + id + '/edit')}" enctype="multipart/form-data">
        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="grid2">
            <div>
              <label>名前</label>
              <input type="text" name="name" value="${v('name')}" required>
            </div>
            <div>
              <label>絵文字</label>
              <input type="text" name="emoji" value="${v('emoji')}" placeholder="😈">
            </div>
          </div>
          <div class="grid2">
            <div>
              <label>役割・肩書き</label>
              <input type="text" name="role" value="${v('role')}">
            </div>
            <div>
              <label>部署</label>
              <input type="text" name="division" value="${v('division')}">
            </div>
          </div>
          <div>
            <label>キャラクター説明</label>
            <textarea name="character" rows="3">${v('character')}</textarea>
          </div>
          <div>
            <label>プロンプト特徴（英語）</label>
            <textarea name="prompt_features" rows="2">${v('prompt_features')}</textarea>
          </div>
          <div>
            <label>画像を追加（複数可）</label>
            <input type="file" name="images" accept="image/*" multiple style="color:#888;font-size:.82em;width:100%">
            <p class="hint">既存画像はそのまま保持されます</p>
          </div>
          <div style="display:flex;gap:12px;margin-top:4px">
            <button type="submit" class="btn btn-primary">保存</button>
            <a href="${url('/cast_manager/' + id)}" style="color:#888;text-decoration:none;padding:9px 0">キャンセル</a>
          </div>
        </div>
      </form>
    </div>`;
  res.send(layout('編集', body));
});

// ── POST: 編集保存 ────────────────────────────────
router.post('/:id/edit', requireAuth,
  upload.array('images') as any,
  (req, res) => {
    const id = req.params.id;
    const existing = loadProfile(id);
    if (!existing) return res.redirect(url('/cast_manager'));

    const profile: Profile = {
      ...existing,
      name: req.body.name ?? existing.name,
      emoji: req.body.emoji ?? existing.emoji,
      role: req.body.role ?? existing.role,
      division: req.body.division ?? existing.division,
      character: req.body.character ?? existing.character,
      prompt_features: req.body.prompt_features ?? existing.prompt_features,
      updated_at: new Date().toISOString(),
    };
    saveProfile(id, profile);
    res.redirect(url('/cast_manager/' + id + '?msg=saved'));
  });

// ── GET: 新規作成フォーム ─────────────────────────
router.get('/new', requireAuth, (_req, res) => {
  const body = `
    ${headerHtml('新規キャスト')}
    <div class="main">
      <h2>👤 新規キャスト</h2>
      <form method="post" action="${url('/cast_manager/new')}" enctype="multipart/form-data">
        <div class="card" style="display:flex;flex-direction:column;gap:14px">
          <div class="grid2">
            <div>
              <label>ID（英数小文字・ハイフン）<span style="color:#e94560">*</span></label>
              <input type="text" name="id" placeholder="mephi" required>
              <p class="hint">一度決めたIDは変更不可</p>
            </div>
            <div>
              <label>名前 <span style="color:#e94560">*</span></label>
              <input type="text" name="name" required>
            </div>
          </div>
          <div class="grid2">
            <div>
              <label>役割</label>
              <input type="text" name="role">
            </div>
            <div>
              <label>絵文字</label>
              <input type="text" name="emoji" placeholder="👤">
            </div>
          </div>
          <div>
            <label>キャラクター説明</label>
            <textarea name="character" rows="3"></textarea>
          </div>
          <div>
            <label>画像（複数可）</label>
            <input type="file" name="images" accept="image/*" multiple style="color:#888;font-size:.82em;width:100%">
          </div>
          <div style="display:flex;gap:12px;margin-top:4px">
            <button type="submit" class="btn btn-primary">作成</button>
            <a href="${url('/cast_manager')}" style="color:#888;text-decoration:none;padding:9px 0">キャンセル</a>
          </div>
        </div>
      </form>
    </div>`;
  res.send(layout('新規キャスト', body));
});

// ── POST: 新規作成 ────────────────────────────────
router.post('/new', requireAuth,
  upload.array('images') as any,
  (req, res) => {
    const id = sanitizeId(req.body.id ?? '');
    if (!id) return res.redirect(url('/cast_manager/new'));

    const dir = path.join(CASTS_DIR, id);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const profile: Profile = {
      name: req.body.name ?? id,
      emoji: req.body.emoji ?? '',
      role: req.body.role ?? '',
      character: req.body.character ?? '',
      updated_at: new Date().toISOString(),
    };
    saveProfile(id, profile);
    res.redirect(url('/cast_manager?msg=saved'));
  });

// ── POST: 削除 ────────────────────────────────────
router.post('/:id/delete', requireAuth, (req, res) => {
  const dir = path.join(CASTS_DIR, req.params.id);
  if (dir.startsWith(CASTS_DIR) && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  res.redirect(url('/cast_manager?msg=deleted'));
});

export const meta = {
  name: 'キャスト',
  icon: 'fas fa-masks-theater',
  desc: 'キャラクター管理（画像ギャラリー・profile.json）',
  layer: 'layer2' as const,
  url: '/cast_manager',
};

export { router };
