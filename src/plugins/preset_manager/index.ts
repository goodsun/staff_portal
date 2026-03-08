import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../core/auth';
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, ''); const url = (p: string) => `${BASE}${p}`;

const router = Router();

const PRESETS_FILE = '/home/node/.openclaw/workspace/data/presets.json';

interface Preset {
  id: string;
  name: string;
  agent: string;
  persona: string;
  systemPrompt: string;
  notes: string;
  updatedAt: string;
}

function loadPresets(): Preset[] {
  if (!fs.existsSync(PRESETS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PRESETS_FILE, 'utf-8')); } catch { return []; }
}

function savePresets(presets: Preset[]): void {
  fs.writeFileSync(PRESETS_FILE, JSON.stringify(presets, null, 2));
}

function esc(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
  .btn-new{display:inline-block;padding:9px 20px;background:#e94560;color:#fff;border-radius:6px;
    text-decoration:none;font-weight:600;font-size:.9em;margin-bottom:20px}
  .btn-new:hover{background:#c73652}
  .preset-card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:18px;margin-bottom:14px}
  .preset-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
  .preset-name{font-weight:700;font-size:1.05em}
  .preset-agent{color:#8be9fd;font-size:.82em;margin-top:2px}
  .preset-actions{display:flex;gap:8px}
  .btn-sm{padding:5px 12px;border:none;border-radius:4px;font-size:.8em;cursor:pointer;font-weight:600;text-decoration:none;display:inline-block}
  .btn-edit{background:#0f3460;color:#8be9fd}
  .btn-edit:hover{background:#1a4480}
  .btn-del{background:#3a0010;color:#e94560}
  .btn-del:hover{background:#5a0020}
  .preset-prompt{font-size:.82em;color:#aaa;background:#0d1117;border-radius:4px;padding:10px;
    margin-top:8px;max-height:80px;overflow:hidden;line-height:1.5;white-space:pre-wrap}
  .preset-notes{font-size:.8em;color:#888;margin-top:6px}
  .preset-date{font-size:.75em;color:#555;margin-top:4px}
  label{display:block;color:#aaa;font-size:.85em;margin-bottom:4px;margin-top:16px}
  label:first-of-type{margin-top:0}
  input,textarea{width:100%;padding:10px 14px;background:#0d1117;border:1px solid #0f3460;
    border-radius:6px;color:#e0e0e0;font-size:.95em;font-family:inherit}
  input:focus,textarea:focus{outline:none;border-color:#e94560}
  textarea{resize:vertical;min-height:120px}
  .form-actions{display:flex;gap:12px;margin-top:20px}
  button[type=submit]{padding:10px 24px;background:#e94560;color:#fff;border:none;border-radius:6px;
    font-size:1em;font-weight:600;cursor:pointer}
  button[type=submit]:hover{background:#c73652}
  .btn-cancel{padding:10px 20px;background:#0f3460;color:#8be9fd;border:none;border-radius:6px;
    font-size:1em;cursor:pointer;text-decoration:none;display:inline-block}
  .empty{color:#888;padding:20px 0}
</style></head><body>
${body}
</body></html>`;
}

// GET: 一覧
router.get('/', requireAuth, (_req, res) => {
  const presets = loadPresets();

  const cards = presets.length === 0
    ? '<p class="empty">プリセットがありません。新規作成してください。</p>'
    : presets.map(p => `
      <div class="preset-card">
        <div class="preset-header">
          <div>
            <div class="preset-name">${esc(p.name)}</div>
            <div class="preset-agent">${esc(p.agent)} — ${esc(p.persona)}</div>
          </div>
          <div class="preset-actions">
            <a href="${url('/presets/edit?id=' + p.id)}" class="btn-sm btn-edit">編集</a>
            <form method="post" action="${url('/presets/delete')}" style="display:inline"
              onsubmit="return confirm('削除しますか？')">
              <input type="hidden" name="id" value="${esc(p.id)}">
              <button type="submit" class="btn-sm btn-del">削除</button>
            </form>
          </div>
        </div>
        <div class="preset-prompt">${esc(p.systemPrompt)}</div>
        ${p.notes ? `<div class="preset-notes">📝 ${esc(p.notes)}</div>` : ''}
        <div class="preset-date">更新: ${p.updatedAt}</div>
      </div>`).join('');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>🎭 プリセット</span>
    </div>
    <div class="main">
      <h2>🎭 キャラクタープリセット</h2>
      <a href="${url('/presets/new')}" class="btn-new">＋ 新規作成</a>
      ${cards}
    </div>`;

  res.send(layout('プリセット管理', body));
});

// GET: 新規作成フォーム
router.get('/new', requireAuth, (_req, res) => {
  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <a href="${url('/presets')}">🎭 プリセット</a>
      <span class="sep">›</span>
      <span>新規作成</span>
    </div>
    <div class="main">
      <h2>🎭 新規プリセット</h2>
      <form method="post" action="${url('/presets/save')}">
        <input type="hidden" name="id" value="">
        <label>プリセット名</label>
        <input type="text" name="name" placeholder="例: メフィ v2" required>
        <label>エージェント名</label>
        <input type="text" name="agent" placeholder="例: メフィ">
        <label>ペルソナ</label>
        <input type="text" name="persona" placeholder="例: CCO / デビルズアドボケート">
        <label>システムプロンプト</label>
        <textarea name="systemPrompt" placeholder="キャラクターの指示文..."></textarea>
        <label>メモ</label>
        <input type="text" name="notes" placeholder="変更点や用途など">
        <div class="form-actions">
          <button type="submit">保存</button>
          <a href="${url('/presets')}" class="btn-cancel">キャンセル</a>
        </div>
      </form>
    </div>`;

  res.send(layout('新規プリセット', body));
});

// GET: 編集フォーム
router.get('/edit', requireAuth, (req, res) => {
  const id = req.query.id as string;
  const p = loadPresets().find(x => x.id === id);
  if (!p) return res.redirect(url('/presets'));

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <a href="${url('/presets')}">🎭 プリセット</a>
      <span class="sep">›</span>
      <span>編集</span>
    </div>
    <div class="main">
      <h2>🎭 プリセット編集</h2>
      <form method="post" action="${url('/presets/save')}">
        <input type="hidden" name="id" value="${esc(p.id)}">
        <label>プリセット名</label>
        <input type="text" name="name" value="${esc(p.name)}" required>
        <label>エージェント名</label>
        <input type="text" name="agent" value="${esc(p.agent)}">
        <label>ペルソナ</label>
        <input type="text" name="persona" value="${esc(p.persona)}">
        <label>システムプロンプト</label>
        <textarea name="systemPrompt">${esc(p.systemPrompt)}</textarea>
        <label>メモ</label>
        <input type="text" name="notes" value="${esc(p.notes)}">
        <div class="form-actions">
          <button type="submit">保存</button>
          <a href="${url('/presets')}" class="btn-cancel">キャンセル</a>
        </div>
      </form>
    </div>`;

  res.send(layout('プリセット編集', body));
});

// POST: 保存
router.post('/save', requireAuth, (req, res) => {
  const presets = loadPresets();
  const { id, name, agent, persona, systemPrompt, notes } = req.body;

  if (id) {
    const idx = presets.findIndex(p => p.id === id);
    if (idx >= 0) {
      presets[idx] = { ...presets[idx], name, agent, persona, systemPrompt, notes, updatedAt: new Date().toISOString() };
    }
  } else {
    presets.push({
      id: Date.now().toString(36),
      name, agent, persona, systemPrompt, notes,
      updatedAt: new Date().toISOString(),
    });
  }
  savePresets(presets);
  res.redirect(url('/presets'));
});

// POST: 削除
router.post('/delete', requireAuth, (req, res) => {
  const { id } = req.body;
  const presets = loadPresets().filter(p => p.id !== id);
  savePresets(presets);
  res.redirect(url('/presets'));
});

export const meta = {
  name: 'プリセット',
  icon: '🎭',
  desc: 'キャラクタープリセット管理',
  layer: 'core' as const,
  url: '/presets',
};

export { router };
