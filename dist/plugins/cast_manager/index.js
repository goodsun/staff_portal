"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = exports.meta = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../../core/auth");
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const WS = process.env.WORKSPACE_ROOT ?? '/home/node/.openclaw/workspace';
const url = (p) => BASE + p;
const router = (0, express_1.Router)();
exports.router = router;
const CASTS_DIR = `${WS}/data/casts`;
// ── multer（アバター画像） ─────────────────────────
const storage = multer_1.default.diskStorage({
    destination: (req, _f, cb) => {
        const dir = path_1.default.join(CASTS_DIR, req.params.id);
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const slot = (file.fieldname === 'avatar_main' ? 'avatar'
            : file.fieldname === 'avatar_sub' ? 'avatar_sub'
                : 'avatar_official');
        cb(null, slot + ext);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(path_1.default.extname(file.originalname).toLowerCase());
        cb(null, ok);
    },
});
function loadProfile(id) {
    const f = path_1.default.join(CASTS_DIR, id, 'profile.json');
    if (!fs_1.default.existsSync(f))
        return null;
    try {
        return JSON.parse(fs_1.default.readFileSync(f, 'utf-8'));
    }
    catch {
        return null;
    }
}
function saveProfile(id, p) {
    fs_1.default.writeFileSync(path_1.default.join(CASTS_DIR, id, 'profile.json'), JSON.stringify(p, null, 2));
}
function listCasts() {
    if (!fs_1.default.existsSync(CASTS_DIR))
        return [];
    return fs_1.default.readdirSync(CASTS_DIR)
        .filter(d => fs_1.default.statSync(path_1.default.join(CASTS_DIR, d)).isDirectory())
        .map(d => { const p = loadProfile(d); return p ? { id: d, ...p } : null; })
        .filter(Boolean);
}
function castAvatarUrl(id, profile) {
    const avatarFile = profile.avatars?.main || 'avatar.jpg';
    const full = path_1.default.join(CASTS_DIR, id, avatarFile);
    if (fs_1.default.existsSync(full))
        return url(`/cast_manager/${id}/avatar/${avatarFile}`);
    return '';
}
function sanitizeId(raw) {
    return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}
// ── layout ───────────────────────────────────────
function layout(title, body) {
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
  .main{max-width:900px;margin:0 auto;padding:28px 24px}
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
  .cast-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px}
  .cast-card{background:#0d1117;border:1px solid #0f3460;border-radius:8px;overflow:hidden;cursor:pointer;transition:border-color .2s}
  .cast-card:hover{border-color:#e94560}
  .cast-card .thumb{width:100%;aspect-ratio:1;background:#16213e;display:flex;align-items:center;justify-content:center;font-size:3em;overflow:hidden}
  .cast-card .thumb img{width:100%;height:100%;object-fit:cover}
  .cast-card .info{padding:10px}
  .cast-card .cname{font-weight:700;font-size:.95em}
  .cast-card .crole{color:#888;font-size:.78em;margin-top:3px}
  .cast-card .actions{display:flex;gap:6px;padding:0 10px 10px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
  .avatar-preview{width:80px;height:80px;border-radius:8px;object-fit:cover;border:1px solid #0f3460;background:#0d1117}
  .hint{color:#555;font-size:.78em;margin-top:4px}
  .alert{padding:12px 16px;border-radius:6px;margin-bottom:16px;font-size:.9em}
  .alert-ok{background:#0a2a0a;border:1px solid #50fa7b;color:#50fa7b}
  .alert-err{background:#2a0a0a;border:1px solid #e94560;color:#e94560}
  .tag{display:inline-block;background:#0f3460;color:#8be9fd;padding:2px 8px;border-radius:4px;font-size:.75em;margin:2px}
</style></head><body>${body}</body></html>`;
}
function headerHtml(sub) {
    return `<div class="header">
    <a href="${url('/')}"> <i class="fas fa-industry"></i> labo-portal</a>
    <span class="sep">›</span>
    <a href="${url('/cast_manager')}">  <i class="fas fa-masks-theater"></i> キャスト</a>
    ${sub ? `<span class="sep">›</span><span>${sub}</span>` : ''}
  </div>`;
}
// ── GET: アバター画像配信 ────────────────────────
router.get('/:id/avatar/:file', auth_1.requireAuth, (req, res) => {
    const filePath = path_1.default.join(CASTS_DIR, req.params.id, req.params.file);
    if (!filePath.startsWith(CASTS_DIR))
        return res.status(403).end();
    if (!fs_1.default.existsSync(filePath))
        return res.status(404).end();
    res.sendFile(filePath);
});
// ── GET: 一覧 ────────────────────────────────────
router.get('/', auth_1.requireAuth, (req, res) => {
    const casts = listCasts();
    const msg = req.query.msg ?? '';
    const cards = casts.map(c => {
        const thumbUrl = castAvatarUrl(c.id, c);
        const thumb = thumbUrl
            ? `<img src="${thumbUrl}" alt="${c.name}">`
            : `<span>👤</span>`;
        return `
      <div class="cast-card">
        <div class="thumb">${thumb}</div>
        <div class="info">
          <div class="cname">${c.name}</div>
          <div class="crole">${c.role}</div>
        </div>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2><i class="fas fa-masks-theater"></i> キャスト管理</h2>
        <a href="${url('/cast_manager/new')}" class="btn btn-primary">＋ 新規キャスト</a>
      </div>
      ${msg === 'saved' ? '<div class="alert alert-ok">✅ 保存しました</div>' : ''}
      ${msg === 'deleted' ? '<div class="alert alert-ok">✅ 削除しました</div>' : ''}
      <div class="cast-grid">${cards || '<p style="color:#555">キャストがありません</p>'}</div>
    </div>`;
    res.send(layout('キャスト管理', body));
});
// ── フォームHTML（新規/編集共通） ────────────────
function profileForm(action, p, id) {
    const v = (f) => (p?.[f] ?? '');
    const tagsStr = Array.isArray(p?.tags) ? p.tags.join(', ') : '';
    // アバタープレビュー
    const avatarSlots = ['main', 'sub', 'official'].map(slot => {
        const fieldName = `avatar_${slot}`;
        const label = slot === 'main' ? 'メイン' : slot === 'sub' ? 'サブ' : 'オフィシャル';
        const existing = id && p?.avatars?.[slot] ? castAvatarUrl(id, p) : '';
        const preview = existing ? `<img src="${existing}" class="avatar-preview" style="display:block;margin-bottom:6px">` : '';
        return `<div>
      <label>${label}アバター</label>
      ${preview}
      <input type="file" name="${fieldName}" accept="image/*" style="color:#888;font-size:.82em;width:100%">
    </div>`;
    }).join('');
    return `
    <form method="post" action="${url(action)}" enctype="multipart/form-data">
      <div class="card" style="display:flex;flex-direction:column;gap:14px">
        <div class="grid2">
          <div>
            <label>ID（英数小文字・ハイフン）${!id ? '<span style="color:#e94560">*</span>' : ''}</label>
            <input type="text" name="id" value="${id ?? ''}" placeholder="mephi" ${id ? 'readonly style="color:#555"' : 'required'}>
            <p class="hint">一度決めたIDは変更不可</p>
          </div>
          <div>
            <label>名前 <span style="color:#e94560">*</span></label>
            <input type="text" name="name" value="${v('name')}" required>
          </div>
        </div>
        <div class="grid2">
          <div>
            <label>フルネーム</label>
            <input type="text" name="display_name" value="${v('display_name')}">
          </div>
          <div>
            <label>役割・肩書き</label>
            <input type="text" name="role" value="${v('role')}">
          </div>
        </div>
        <div>
          <label>ベースプロンプト <span style="color:#e94560">*</span></label>
          <textarea name="base_prompt" rows="3" required>${v('base_prompt')}</textarea>
          <p class="hint">キャラクターの外見・特徴を英語で</p>
        </div>
        <div>
          <label>スタイルプロンプト</label>
          <textarea name="style_prompt" rows="2">${v('style_prompt')}</textarea>
          <p class="hint">画風・照明・雰囲気など</p>
        </div>
        <div>
          <label>ネガティブプロンプト</label>
          <textarea name="negative_prompt" rows="2">${v('negative_prompt')}</textarea>
        </div>
        <div>
          <label>タグ（カンマ区切り）</label>
          <input type="text" name="tags" value="${tagsStr}" placeholder="character, bon-soleil">
        </div>
        <div>
          <h3 style="margin-bottom:12px">アバター画像</h3>
          <div class="grid3">${avatarSlots}</div>
        </div>
        <div style="display:flex;gap:12px;margin-top:4px">
          <button type="submit" class="btn btn-primary">保存</button>
          <a href="${url('/cast_manager')}" style="color:#888;text-decoration:none;padding:9px 0">キャンセル</a>
        </div>
      </div>
    </form>`;
}
// ── GET: 新規作成フォーム ────────────────────────
router.get('/new', auth_1.requireAuth, (_req, res) => {
    const body = `${headerHtml('新規キャスト')}<div class="main"><h2>👤 新規キャスト</h2>${profileForm('/cast_manager/new')}</div>`;
    res.send(layout('新規キャスト', body));
});
// ── POST: 新規作成 ───────────────────────────────
router.post('/new', auth_1.requireAuth, upload.fields([{ name: 'avatar_main' }, { name: 'avatar_sub' }, { name: 'avatar_official' }]), (req, res) => {
    const id = sanitizeId(req.body.id ?? '');
    if (!id)
        return res.redirect(url('/cast_manager/new'));
    const dir = path_1.default.join(CASTS_DIR, id);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    const avatars = {};
    const files = req.files;
    if (files?.avatar_main?.[0])
        avatars.main = files.avatar_main[0].filename;
    if (files?.avatar_sub?.[0])
        avatars.sub = files.avatar_sub[0].filename;
    if (files?.avatar_official?.[0])
        avatars.official = files.avatar_official[0].filename;
    const profile = {
        name: req.body.name ?? id,
        display_name: req.body.display_name ?? '',
        role: req.body.role ?? '',
        base_prompt: req.body.base_prompt ?? '',
        style_prompt: req.body.style_prompt ?? '',
        negative_prompt: req.body.negative_prompt ?? '',
        tags: (req.body.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        avatars,
        updated_at: new Date().toISOString(),
    };
    saveProfile(id, profile);
    res.redirect(url('/cast_manager?msg=saved'));
});
// ── GET: 編集フォーム ────────────────────────────
router.get('/:id/edit', auth_1.requireAuth, (req, res) => {
    const profile = loadProfile(req.params.id);
    if (!profile)
        return res.redirect(url('/cast_manager'));
    const body = `${headerHtml('編集')}<div class="main"><h2> <i class="fas fa-edit"></i> ${profile.name} を編集</h2>${profileForm('/cast_manager/' + req.params.id + '/edit', profile, req.params.id)}</div>`;
    res.send(layout('編集', body));
});
// ── POST: 編集保存 ───────────────────────────────
router.post('/:id/edit', auth_1.requireAuth, upload.fields([{ name: 'avatar_main' }, { name: 'avatar_sub' }, { name: 'avatar_official' }]), (req, res) => {
    const id = req.params.id;
    const existing = loadProfile(id);
    if (!existing)
        return res.redirect(url('/cast_manager'));
    const files = req.files;
    const avatars = { ...existing.avatars };
    if (files?.avatar_main?.[0])
        avatars.main = files.avatar_main[0].filename;
    if (files?.avatar_sub?.[0])
        avatars.sub = files.avatar_sub[0].filename;
    if (files?.avatar_official?.[0])
        avatars.official = files.avatar_official[0].filename;
    const profile = {
        ...existing,
        name: req.body.name ?? existing.name,
        display_name: req.body.display_name ?? '',
        role: req.body.role ?? '',
        base_prompt: req.body.base_prompt ?? '',
        style_prompt: req.body.style_prompt ?? '',
        negative_prompt: req.body.negative_prompt ?? '',
        tags: (req.body.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        avatars,
        updated_at: new Date().toISOString(),
    };
    saveProfile(id, profile);
    res.redirect(url('/cast_manager?msg=saved'));
});
// ── POST: 削除 ───────────────────────────────────
router.post('/:id/delete', auth_1.requireAuth, (req, res) => {
    const dir = path_1.default.join(CASTS_DIR, req.params.id);
    if (dir.startsWith(CASTS_DIR) && fs_1.default.existsSync(dir)) {
        fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
    res.redirect(url('/cast_manager?msg=deleted'));
});
exports.meta = {
    name: 'キャスト',
    icon: 'fas fa-masks-theater',
    desc: 'キャラクター管理（画像・プロンプトセット）',
    layer: 'layer2',
    url: '/cast_manager',
};
