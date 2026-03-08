import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../core/auth';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string) => `${BASE}${p}`;
const router = Router();

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const GEN_SCRIPT = path.join(__dirname, 'gen.js');
const OUT_DIR = '/home/node/.openclaw/workspace/data/generated';
const CASTS_DIR = '/home/node/.openclaw/workspace/data/casts';
const IMAGE_GEN_DATA = '/home/node/.openclaw/workspace/data/presets';
const SCENE_DIR = '/home/node/.openclaw/workspace/data/scenes';
if (!fs.existsSync(SCENE_DIR)) fs.mkdirSync(SCENE_DIR, { recursive: true });

function loadPresets() {
  try {
    const touch = JSON.parse(fs.readFileSync(path.join(IMAGE_GEN_DATA, 'touch_presets.json'), 'utf-8'));
    const model = JSON.parse(fs.readFileSync(path.join(IMAGE_GEN_DATA, 'model_presets.json'), 'utf-8'));
    return { touch, model };
  } catch { return { touch: { presets: [], default: '' }, model: { presets: [], default: '' } }; }
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── gen.js（Imagen / Gemini multimodal） ─────────
const GEN_SCRIPT_CONTENT = `
const fs = require('fs');
const https = require('https');
// argv: prompt outPath apiKey refsJson model aspect
// refsJson: JSON array of {path, label} e.g. '[{"path":"/...","label":"A"}]' or '' for no ref
const [,, prompt, outPath, apiKey, refsJsonArg, modelArg, aspectArg] = process.argv;
const aspect = aspectArg || '1:1';
const refs = (() => { try { return JSON.parse(refsJsonArg || '[]'); } catch(e) { return []; } })()
  .filter(r => r.path && fs.existsSync(r.path));
if (!prompt || !outPath || !apiKey) { console.error('usage: gen.js <prompt> <outPath> <apiKey> [refsJson] [model] [aspect]'); process.exit(1); }

function httpsPost(urlStr, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(new Error('parse: '+d.slice(0,100)));} }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function genWithRefs(refList) {
  const model = modelArg || 'gemini-3-pro-image-preview';
  console.log('using model:', model, 'refs:', refList.length);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  const aspectPrompt = aspect !== '1:1' ? ', aspect ratio ' + aspect : '';
  const parts = [];
  for (const ref of refList) {
    const mimeType = ref.path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const b64 = fs.readFileSync(ref.path).toString('base64');
    parts.push({ inline_data: { mime_type: mimeType, data: b64 } });
    if (ref.type === 'background') {
      parts.push({ text: '[This is the background setting/scene]' });
    } else {
      parts.push({ text: '[This is character ' + ref.label + ']' });
    }
  }
  parts.push({ text: prompt + aspectPrompt + '. Use the reference images as character design bases. Maintain each character visual style.' });
  const payload = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['image', 'text'] }
  };
  const data = await httpsPost(url, payload);
  if (data.error) { console.error(JSON.stringify(data.error)); process.exit(1); }
  const resParts = data.candidates?.[0]?.content?.parts ?? [];
  const imgPart = resParts.find(p => p.inlineData?.data);
  if (!imgPart) { console.error('No image in response:', JSON.stringify(data).slice(0,300)); process.exit(1); }
  fs.writeFileSync(outPath, Buffer.from(imgPart.inlineData.data, 'base64'));
  console.log('OK(' + model + '):' + outPath);
}

async function genImagen() {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=' + apiKey;
  const data = await httpsPost(url, { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: aspect } });
  if (data.error) { console.error(JSON.stringify(data.error)); process.exit(1); }
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error('No image:', JSON.stringify(data).slice(0,200)); process.exit(1); }
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('OK(imagen):' + outPath);
}

async function run() {
  if (refs.length > 0) {
    await genWithRefs(refs);
  } else {
    await genImagen();
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
`;
fs.writeFileSync(GEN_SCRIPT, GEN_SCRIPT_CONTENT);

// ── キャストデータ読み込み ────────────────────────
function loadCasts(): Array<{id: string, name: string, emoji: string, role: string, prompt_features: string, default_style: string, styles: Record<string,any>, avatars: Record<string,string>}> {
  if (!fs.existsSync(CASTS_DIR)) return [];
  return fs.readdirSync(CASTS_DIR)
    .filter(d => fs.statSync(path.join(CASTS_DIR, d)).isDirectory())
    .map(d => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, d, 'profile.json'), 'utf-8'));
        return { id: d, name: p.name, emoji: p.emoji || '', role: p.role, prompt_features: p.prompt_features || p.base_prompt || '', default_style: p.default_style || 'normal', styles: p.styles || {}, avatars: p.avatars ?? {} };
      } catch { return null; }
    }).filter(Boolean) as any[];
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
  .main{max-width:760px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  h3{color:#aaa;font-size:.82em;text-transform:uppercase;letter-spacing:2px;margin-bottom:10px}
  .card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:20px;margin-bottom:16px}
  label{display:block;color:#aaa;font-size:.82em;margin-bottom:5px}
  select,textarea,input[type=text]{width:100%;padding:9px 12px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;color:#e0e0e0;font-size:.9em;font-family:inherit}
  select:focus,textarea:focus{outline:none;border-color:#e94560}
  textarea{resize:vertical}
  .btn{padding:9px 20px;border:none;border-radius:6px;font-size:.9em;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
  .btn-primary{background:#e94560;color:#fff}
  .btn-primary:hover{background:#c73652}
  .btn-copy{background:#0f3460;color:#8be9fd}
  .btn-copy:hover{background:#1a4a80}
  .btn:disabled{background:#555;color:#888;cursor:not-allowed}
  .dry-run{background:#0a1628;border:1px solid #1a4a80;border-radius:6px;padding:14px;margin:14px 0;display:none}
  .dry-run.visible{display:block}
  .dry-run .label{color:#888;font-size:.78em;margin-bottom:6px}
  .dry-run .prompt-text{color:#8be9fd;font-family:monospace;font-size:.85em;word-break:break-all;line-height:1.6}
  .cast-preview{display:flex;align-items:center;gap:12px;padding:10px;background:#0d1117;border-radius:6px;margin-bottom:12px;display:none}
  .cast-preview.visible{display:flex}
  .cast-preview img{width:48px;height:48px;border-radius:6px;object-fit:cover;border:1px solid #0f3460}
  .cast-preview .cast-icon{width:48px;height:48px;border-radius:6px;background:#16213e;display:flex;align-items:center;justify-content:center;font-size:1.5em}
  .cast-preview .cast-info .cname{font-weight:700;font-size:.9em}
  .cast-preview .cast-info .crole{color:#888;font-size:.78em}
  .img-wrap{margin-top:24px;text-align:center}
  .img-wrap img{max-width:100%;border-radius:8px;border:1px solid #0f3460}
  .prompt-echo{color:#888;font-size:.82em;margin-top:10px;font-style:italic}
  .error{color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px;margin-top:16px}
  .hint{color:#555;font-size:.78em;margin-top:4px}
</style></head><body>${body}</body></html>`;
}

// ── API: 背景シーン一覧 ──────────────────────────
const IMG_EXTS = ['.jpg','.jpeg','.png','.webp'];
router.get('/api/scenes', requireAuth, (_req, res) => {
  const files = fs.existsSync(SCENE_DIR)
    ? fs.readdirSync(SCENE_DIR).filter(f => IMG_EXTS.includes(path.extname(f).toLowerCase()))
    : [];
  res.json(files.map(f => ({ filename: f, url: url('/image_gen/scene/' + f) })));
});

// ── 背景画像配信 ─────────────────────────────────
router.get('/scene/:file', requireAuth, (req, res) => {
  const filePath = path.join(SCENE_DIR, path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── 背景画像アップロード ──────────────────────────
import { makeAssetUploader } from '../../core/upload';
const sceneUploader = makeAssetUploader(SCENE_DIR);
router.post('/upload/scene', requireAuth, sceneUploader.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ ok: true, filename: req.file.filename, url: url('/image_gen/scene/' + req.file.filename) });
});

// ── 背景画像削除 ──────────────────────────────────
router.delete('/scene/:file', requireAuth, (req, res) => {
  const filePath = path.join(SCENE_DIR, path.basename(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ── API: プリセット（タッチ・モデル） ────────────
router.get('/api/presets', requireAuth, (_req, res) => {
  res.json(loadPresets());
});

// ── API: キャストデータJSON ───────────────────────
router.get('/api/casts', requireAuth, (_req, res) => {
  const casts = loadCasts().map(c => {
    const stylesResolved: Record<string,any> = {};
    for (const [sk, sv] of Object.entries(c.styles)) {
      const imgFile = (sv as any).image;
      const imgUrl = imgFile && fs.existsSync(path.join(CASTS_DIR, c.id, imgFile))
        ? url('/image_gen/cast-avatar/' + c.id + '/' + imgFile) : '';
      stylesResolved[sk] = { ...(sv as any), imageUrl: imgUrl };
    }
    const mainImg = c.avatars?.main || '';
    const mainImgUrl = mainImg && fs.existsSync(path.join(CASTS_DIR, c.id, mainImg))
      ? url('/image_gen/cast-avatar/' + c.id + '/' + mainImg) : '';
    return { id: c.id, name: c.name, emoji: c.emoji, role: c.role, prompt_features: c.prompt_features, default_style: c.default_style, styles: stylesResolved, mainImgUrl };
  });
  res.json(casts);
});

// ── API: キャストアバター画像 ─────────────────────
router.get('/cast-avatar/:id/:file', requireAuth, (req, res) => {
  const filePath = path.join(CASTS_DIR, req.params.id, req.params.file);
  if (!filePath.startsWith(CASTS_DIR) || !fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ── GET: フォーム ─────────────────────────────────
router.get('/', requireAuth, (_req, res) => {
  if (!GEMINI_KEY) {
    const body = `<div class="header"><a href="${url('/')}">🏭 labo-portal</a><span class="sep">›</span><span>🎨 画像生成</span></div>
      <div class="main"><h2>🎨 Imagen 画像生成</h2><div class="error">GEMINI_API_KEY が設定されていません。</div></div>`;
    return res.send(layout('画像生成', body));
  }

  const casts = loadCasts();
  const castsData = JSON.stringify(casts.map(c => {
    const stylesResolved: Record<string,any> = {};
    for (const [sk, sv] of Object.entries(c.styles)) {
      const imgFile = (sv as any).image;
      const imgUrl = imgFile && fs.existsSync(path.join(CASTS_DIR, c.id, imgFile))
        ? url('/image_gen/cast-avatar/' + c.id + '/' + imgFile) : '';
      stylesResolved[sk] = { ...(sv as any), imageUrl: imgUrl };
    }
    const mainImg = c.avatars?.main || '';
    const mainImgUrl = mainImg && fs.existsSync(path.join(CASTS_DIR, c.id, mainImg))
      ? url('/image_gen/cast-avatar/' + c.id + '/' + mainImg) : '';
    return { id: c.id, name: c.name, emoji: c.emoji, role: c.role, prompt_features: c.prompt_features, default_style: c.default_style, styles: stylesResolved, mainImgUrl };
  }));

  const castOptions = casts.map(c =>
    `<option value="${c.id}">${c.emoji} ${c.name}（${c.role}）</option>`
  ).join('');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>🎨 画像生成</span>
    </div>
    <div class="main">
      <h2>🎨 Imagen 画像生成</h2>
      <form method="post" action="${url('/image_gen')}" id="form">

        <!-- キャスト選択（複数） -->
        <div class="card">
          <h3>🎭 キャスト（任意・複数可）</h3>
          <div id="castRows"></div>
          <button type="button" id="btnAddCast" class="btn btn-copy" style="margin-top:8px;font-size:.82em">＋ キャスト追加</button>
          <p class="hint" style="margin-top:6px">複数選択時はプロンプトでA/B/Cと指定: "A is standing, B is next to A"</p>
          <input type="hidden" name="cast_refs" id="castRefsInput">
        </div>

        <!-- 背景シーン -->
        <div class="card">
          <h3>🖼 背景シーン（任意）</h3>
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <label>背景画像</label>
              <select name="background_scene" id="sceneSelect">
                <option value="">なし（背景指定しない）</option>
              </select>
            </div>
            <div id="scenePreviewWrap" style="display:none;position:relative">
              <img id="scenePreviewImg" src="" alt="" style="height:64px;border-radius:6px;border:1px solid #0f3460;object-fit:cover">
              <button type="button" id="btnSceneDelete" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-size:12px;line-height:20px;text-align:center;padding:0">✕</button>
            </div>
            <div>
              <label>画像をアップロード</label>
              <input type="file" id="sceneUploadInput" accept="image/*" style="display:none">
              <button type="button" id="btnSceneUpload" class="btn btn-copy" style="font-size:.82em">📁 追加</button>
            </div>
          </div>
        </div>

        <!-- カメラ & タッチ -->
        <div class="card">
          <h3>🎬 カメラ & タッチ</h3>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:180px">
              <label>カメラ（AIモデル）</label>
              <select name="gen_model" id="modelSelect">
                <option value="">読み込み中...</option>
              </select>
              <p class="hint" id="modelHint"></p>
            </div>
            <div style="flex:1;min-width:180px">
              <label>タッチ（画風）</label>
              <select name="gen_touch" id="touchSelect">
                <option value="">読み込み中...</option>
              </select>
            </div>
            <div style="flex:0 0 140px">
              <label>アスペクト比</label>
              <select name="gen_aspect" id="aspectSelect">
                <option value="1:1">1:1（正方形）</option>
                <option value="9:16" selected>9:16（縦・スマホ）</option>
                <option value="16:9">16:9（横・ワイド）</option>
                <option value="3:4">3:4（縦・ポートレート）</option>
                <option value="4:3">4:3（横・標準）</option>
              </select>
            </div>
          </div>
        </div>

        <!-- シーン・追加プロンプト -->
        <div class="card">
          <h3>✍️ プロンプト</h3>
          <label id="sceneLabel">シーン・ポーズ・追加指示</label>
          <textarea name="scene" id="sceneInput" rows="4" placeholder="standing in a library, looking at camera, slight smile..."></textarea>
          <p class="hint" id="sceneHint">キャスト選択時はベースプロンプトに追加されます</p>
        </div>

        <!-- dry-run プレビュー -->
        <div class="dry-run" id="dryRun">
          <div class="label">📋 組み立て結果（nanobananaに貼り付け可）</div>
          <div class="prompt-text" id="promptPreview"></div>
        </div>

        <input type="hidden" name="final_prompt" id="finalPrompt">

        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <button type="button" id="btnPreview" class="btn btn-copy"><i class="fas fa-search"></i> プロンプト確認</button>
          <button type="button" id="btnCopy" class="btn btn-copy" style="display:none"><i class="fas fa-copy"></i> コピー</button>
          <button type="button" id="btnGen" class="btn btn-primary"><i class="fas fa-palette"></i> 生成する</button>
        </div>
        <p class="hint" style="margin-top:8px">生成には10〜30秒かかります</p>
      </form>
    </div>

    <!-- 生成結果パネル -->
    <div id="resultPanel" style="display:none;margin-top:32px;padding:24px;background:#0f3460;border-radius:12px">
      <h3 style="margin-top:0;color:#e94560">🎨 生成完了</h3>
      <div id="resultImgWrap" style="text-align:center;margin-bottom:16px">
        <img id="resultImg" src="" alt="generated" style="max-width:100%;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.5)">
      </div>
      <p id="resultPromptEcho" style="color:#aaa;font-size:.88em;margin-bottom:16px"></p>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a id="resultDownload" href="#" download class="btn btn-copy">⬇ ダウンロード</a>
        <button type="button" id="btnScrollTop" class="btn btn-primary">↑ フォームに戻る</button>
      </div>
      <div id="resultError" style="display:none;color:#e94560;margin-top:12px"></div>
    </div>

    <script src="${url('/image_gen/client.js')}" defer></script>`;
  res.send(layout('画像生成', body));
});

// ── 生成ロジック共通関数 ─────────────────────────
function resolveGenArgs(body: Record<string, any>): { prompt: string, args: string[], filename: string, outPath: string } | null {
  const prompt = ((body.final_prompt || body.scene || body.prompt) ?? '').trim();
  if (!prompt || !GEMINI_KEY) return null;

  let refImagePath = '';
  const castId = String(body.cast_id ?? '').trim();
  const castStyle = String(body.cast_style ?? '').trim();
  if (castId) {
    try {
      const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, castId, 'profile.json'), 'utf-8'));
      const styleData = profile.styles?.[castStyle] || profile.styles?.[profile.default_style] || {};
      const imgFile = styleData.image || profile.avatars?.main || '';
      if (imgFile) {
        const candidate = path.join(CASTS_DIR, castId, imgFile);
        if (fs.existsSync(candidate)) refImagePath = candidate;
      }
    } catch {}
  }

  const uiModel = String(body.gen_model ?? '').trim();
  const genModel = uiModel || (refImagePath ? 'gemini-3-pro-image-preview' : '');
  const genAspect = String(body.gen_aspect ?? '1:1').trim() || '1:1';

  let refsArr: Array<{path: string, label: string}> = [];
  const castRefsRaw = String(body.cast_refs ?? '').trim();
  if (castRefsRaw) {
    try {
      const castRefsInput = JSON.parse(castRefsRaw) as Array<{id: string, style: string, label: string}>;
      for (const cr of castRefsInput) {
        if (!cr.id) continue;
        try {
          const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, cr.id, 'profile.json'), 'utf-8'));
          const styleData = profile.styles?.[cr.style] || profile.styles?.[profile.default_style] || {};
          const imgFile = styleData.image || '';
          if (imgFile) {
            const candidate = path.join(CASTS_DIR, cr.id, imgFile);
            if (fs.existsSync(candidate)) refsArr.push({ path: candidate, label: cr.label });
          }
        } catch {}
      }
    } catch {}
  } else if (refImagePath) {
    refsArr = [{ path: refImagePath, label: 'A' }];
  }
  const bgFile = String(body.background_scene ?? '').trim();
  if (bgFile) {
    const bgPath = path.join(SCENE_DIR, path.basename(bgFile));
    if (fs.existsSync(bgPath)) refsArr.push({ path: bgPath, label: 'BG', type: 'background' } as any);
  }

  const filename = `gen_${Date.now()}.png`;
  const outPath = path.join(OUT_DIR, filename);
  const args = [GEN_SCRIPT, prompt, outPath, GEMINI_KEY, JSON.stringify(refsArr), genModel, genAspect];
  return { prompt, args, filename, outPath };
}

// ── POST /api/generate: JSON API（fetch用） ───────
router.post('/api/generate', requireAuth, (req, res) => {
  const resolved = resolveGenArgs(req.body);
  if (!resolved) return res.status(400).json({ ok: false, error: 'prompt required or GEMINI_KEY missing' });
  const { prompt, args, filename, outPath } = resolved;
  console.log('[image_gen] api/generate prompt:', prompt.slice(0, 80));
  execFile('node', args, { timeout: 90000, env: { ...process.env, HOME: '/home/node' } }, (err, _stdout, stderr) => {
    if (err || !fs.existsSync(outPath)) {
      return res.status(500).json({ ok: false, error: err?.message ?? 'generation failed', stderr });
    }
    res.json({ ok: true, filename, imgUrl: url('/image_gen/img/' + filename), downloadUrl: url('/image_gen/img/' + filename) });
  });
});

// ── POST /: 後方互換（フォーム直送用、現在は未使用） ──
router.post('/', requireAuth, (req, res) => {
  const resolved = resolveGenArgs(req.body);
  if (!resolved) return res.redirect(url('/image_gen'));
  const { prompt, args, filename, outPath } = resolved;
  console.log('[image_gen] POST / prompt:', prompt.slice(0, 80));
  execFile('node', args, { timeout: 90000, env: { ...process.env, HOME: '/home/node' } }, (err, _stdout, stderr) => {
    if (err || !fs.existsSync(outPath)) {
      const body = `<div class="header"><a href="${url('/')}">🏭 labo-portal</a><span class="sep">›</span>
        <a href="${url('/image_gen')}">🎨 画像生成</a></div>
        <div class="main"><h2>🎨 生成エラー</h2>
          <div class="error">${err?.message ?? 'Unknown error'}<br>
            <pre style="margin-top:8px;font-size:.85em;white-space:pre-wrap">${stderr}</pre></div>
          <p style="margin-top:16px"><a href="${url('/image_gen')}" style="color:#e94560">← 戻る</a></p></div>`;
      return res.send(layout('生成エラー', body));
    }
    const body = `<div class="header"><a href="${url('/')}">🏭 labo-portal</a><span class="sep">›</span>
      <a href="${url('/image_gen')}">🎨 画像生成</a></div>
      <div class="main"><h2>🎨 生成完了</h2>
        <div class="img-wrap"><img src="${url('/image_gen/img/' + filename)}" alt="generated">
          <p class="prompt-echo">「${prompt.replace(/</g,'&lt;').slice(0,120)}${prompt.length>120?'…':''}」</p></div>
        <div style="display:flex;gap:16px;margin-top:20px;flex-wrap:wrap">
          <a href="${url('/image_gen/img/' + filename)}" download="${filename}" class="btn btn-copy">⬇ ダウンロード</a>
          <a href="${url('/image_gen')}" class="btn btn-primary">もう一枚生成</a></div></div>`;
    res.send(layout('生成完了', body));
  });
});

// ── client.js 配信 ───────────────────────────────
router.get('/client.js', requireAuth, (req, res) => {
  const apiBase = url('/image_gen');
  const js = `
(function() {
  var castMap = {};
  var touchMap = {};
  var modelMap = {};

  // localStorage: 設定の保存・復元
  var LS_KEY = 'ig_settings';
  function saveSettings() {
    var s = {};
    ['gen_touch','gen_model','gen_aspect'].forEach(function(name) {
      var el = document.querySelector('[name="' + name + '"]');
      if (el) s[name] = el.value;
    });
    var sceneEl = document.getElementById('sceneSelect');
    if (sceneEl) s['background_scene'] = sceneEl.value;
    var sceneInput = document.getElementById('sceneInput');
    if (sceneInput) s['scene_text'] = sceneInput.value;
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch(e) {}
  }
  function restoreSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
      ['gen_touch','gen_model','gen_aspect'].forEach(function(name) {
        var el = document.querySelector('[name="' + name + '"]');
        if (el && s[name]) el.value = s[name];
      });
      var sceneEl = document.getElementById('sceneSelect');
      if (sceneEl && s['background_scene']) {
        sceneEl.value = s['background_scene'];
        sceneEl.dispatchEvent(new Event('change'));
      }
      var sceneInput = document.getElementById('sceneInput');
      if (sceneInput && s['scene_text']) sceneInput.value = s['scene_text'];
    } catch(e) {}
  }

  // casts + presets を並行取得
  Promise.all([
    fetch('${url('/image_gen/api/casts')}', { credentials: 'same-origin' }).then(function(r){ return r.json(); }),
    fetch('${url('/image_gen/api/presets')}', { credentials: 'same-origin' }).then(function(r){ return r.json(); }),
    fetch('${url('/image_gen/api/scenes')}', { credentials: 'same-origin' }).then(function(r){ return r.json(); })
  ]).then(function(results) {
    var scenes = results[2] || [];
    var casts = results[0];
    var presets = results[1];
    casts.forEach(function(c){ castMap[c.id] = c; });
    // touch
    var touchSel = document.getElementById('touchSelect');
    if (touchSel && presets.touch && presets.touch.presets) {
      touchSel.innerHTML = presets.touch.presets.map(function(t) {
        return '<option value="' + t.id + '"' + (t.id === presets.touch.default ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('');
      presets.touch.presets.forEach(function(t){ touchMap[t.id] = t; });
    }
    // model
    var modelSel = document.getElementById('modelSelect');
    var modelHint = document.getElementById('modelHint');
    if (modelSel && presets.model && presets.model.presets) {
      modelSel.innerHTML = presets.model.presets.map(function(m) {
        return '<option value="' + m.model + '"' + (m.id === presets.model.default ? ' selected' : '') + '>' + m.label + '</option>';
      }).join('');
      presets.model.presets.forEach(function(m){ modelMap[m.model] = m; });
      if (modelHint) modelHint.textContent = (presets.model.presets.find(function(m){ return m.id === presets.model.default; }) || {}).note || '';
      modelSel.addEventListener('change', function() {
        var m = modelMap[modelSel.value];
        if (modelHint) modelHint.textContent = m ? m.note : '';
      });
    }
    // シーン（背景）リスト
    var sceneSel = document.getElementById('sceneSelect');
    var scenePreviewWrap = document.getElementById('scenePreviewWrap');
    var scenePreviewImg = document.getElementById('scenePreviewImg');
    function buildSceneOptions() {
      while (sceneSel.options.length > 1) sceneSel.remove(1);
      scenes.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.filename; opt.textContent = s.filename;
        sceneSel.appendChild(opt);
      });
    }
    if (sceneSel && scenes.length > 0) {
      buildSceneOptions();
      sceneSel.addEventListener('change', function() {
        var sel = scenes.find(function(s){ return s.filename === sceneSel.value; });
        if (sel) { scenePreviewImg.src = sel.url; scenePreviewWrap.style.display = 'block'; }
        else { scenePreviewWrap.style.display = 'none'; }
      });
    }
    // シーン削除ボタン
    var btnSceneDelete = document.getElementById('btnSceneDelete');
    if (btnSceneDelete) {
      btnSceneDelete.addEventListener('click', function() {
        var filename = sceneSel ? sceneSel.value : '';
        if (!filename) return;
        if (!confirm(filename + ' を削除しますか？')) return;
        fetch('${url('/image_gen/scene/')}' + encodeURIComponent(filename), { method: 'DELETE', credentials: 'same-origin' })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.ok) {
              scenes = scenes.filter(function(s){ return s.filename !== filename; });
              buildSceneOptions();
              sceneSel.value = '';
              scenePreviewWrap.style.display = 'none';
            }
          });
      });
    }
    // シーンアップロード
    var btnSceneUpload = document.getElementById('btnSceneUpload');
    var sceneUploadInput = document.getElementById('sceneUploadInput');
    if (btnSceneUpload && sceneUploadInput) {
      btnSceneUpload.addEventListener('click', function(){ sceneUploadInput.click(); });
      sceneUploadInput.addEventListener('change', function() {
        var file = sceneUploadInput.files && sceneUploadInput.files[0];
        if (!file) return;
        var fd = new FormData(); fd.append('file', file);
        fetch('${url('/image_gen/upload/scene')}', { method:'POST', body: fd, credentials:'same-origin' })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.ok) {
              var opt = document.createElement('option');
              opt.value = d.filename; opt.textContent = d.filename;
              sceneSel.appendChild(opt);
              sceneSel.value = d.filename;
              scenePreviewImg.src = d.url; scenePreviewWrap.style.display = 'block';
            }
          });
      });
    }
    initUI();
    restoreSettings();
  }).catch(function(e){ console.error('[image_gen] load error:', e); });

  var LABELS = ['A','B','C','D','E'];
  var castRowCount = 0;

  function buildCastOptions(selectedId) {
    var opts = '<option value="">— 選択しない —</option>';
    Object.values(castMap).forEach(function(c) {
      opts += '<option value="' + c.id + '"' + (c.id === selectedId ? ' selected' : '') + '>' + (c.emoji||'') + ' ' + c.name + '</option>';
    });
    return opts;
  }

  function addCastRow(defaultId) {
    if (castRowCount >= LABELS.length) return;
    var label = LABELS[castRowCount++];
    var rowId = 'castRow_' + label;
    var castSelId = 'castSel_' + label;
    var stylSelId = 'styleSel_' + label;
    var previewId = 'castPrev_' + label;
    var row = document.createElement('div');
    row.id = rowId;
    row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:#0d1117;border-radius:6px';
    row.innerHTML =
      '<div style="flex:0 0 28px;padding-top:28px;color:#e94560;font-weight:700;font-size:.9em">' + label + '</div>' +
      '<div style="flex:1;min-width:160px"><label style="display:block;color:#aaa;font-size:.82em;margin-bottom:5px">キャラクター</label>' +
      '<select id="' + castSelId + '" style="width:100%;padding:9px 12px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;color:#e0e0e0;font-size:.9em">' +
      buildCastOptions(defaultId) + '</select></div>' +
      '<div style="flex:1;min-width:130px" id="styleWrap_' + label + '"><label style="display:block;color:#aaa;font-size:.82em;margin-bottom:5px">スタイル</label>' +
      '<select id="' + stylSelId + '" style="width:100%;padding:9px 12px;background:#0d1117;border:1px solid #0f3460;border-radius:6px;color:#e0e0e0;font-size:.9em"><option value="">—</option></select></div>' +
      '<div id="' + previewId + '" style="flex:0 0 48px;width:48px;height:48px;border-radius:6px;background:#16213e;display:flex;align-items:center;justify-content:center;align-self:flex-end;margin-bottom:2px;font-size:1.4em;border:1px solid #0f3460">👤</div>' +
      (castRowCount > 1 ? '<button type="button" id="btnRemove_' + label + '" style="align-self:flex-end;margin-bottom:2px;background:none;border:none;color:#e94560;cursor:pointer;font-size:1.1em">✕</button>' : '');
    document.getElementById('castRows').appendChild(row);

    var castSel = document.getElementById(castSelId);
    var stylSel = document.getElementById(stylSelId);
    var preview = document.getElementById(previewId);
    var styleWrap2 = document.getElementById('styleWrap_' + label);

    function updatePreview() {
      var cast = castMap[castSel.value];
      if (!cast) return;
      var sk = stylSel.value || cast.default_style;
      var imgUrl = (cast.styles[sk] || {}).imageUrl || cast.mainImgUrl || '';
      preview.innerHTML = imgUrl
        ? '<img src="' + imgUrl + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px">'
        : '<span>' + (cast.emoji || '👤') + '</span>';
    }
    castSel.addEventListener('change', function() {
      var cast = castMap[castSel.value];
      if (cast) {
        // スタイル選択肢を再構築（castが変わった時のみ）
        stylSel.innerHTML = Object.entries(cast.styles).map(function(e) {
          var sk = e[0], sv = e[1];
          return '<option value="' + sk + '"' + (sk === cast.default_style ? ' selected' : '') + '>' + sv.description + '</option>';
        }).join('');
        styleWrap2.style.display = 'block';
        updatePreview();
      } else {
        styleWrap2.style.display = 'none';
        preview.innerHTML = '👤';
      }
    });
    stylSel.addEventListener('change', updatePreview);
    if (defaultId) updateRow();
    // 削除ボタンのイベント（2行目以降）
    var removeBtn = document.getElementById('btnRemove_' + label);
    if (removeBtn) removeBtn.addEventListener('click', function() {
      var el = document.getElementById(rowId);
      if (el) el.remove();
      castRowCount--;
    });
  } // end addCastRow

  function initUI() {
    var dryRun = document.getElementById('dryRun');
    var btnCopy = document.getElementById('btnCopy');
    var btnAddCast = document.getElementById('btnAddCast');
    // 最初の1行を自動追加
    addCastRow('');
    if (btnAddCast) btnAddCast.addEventListener('click', function() { addCastRow(''); });
  }

  function getCastRefs() {
    // 各castRowからrefs配列を組み立て
    var result = [];
    LABELS.forEach(function(label) {
      var castSel = document.getElementById('castSel_' + label);
      var stylSel = document.getElementById('styleSel_' + label);
      if (!castSel || !castSel.value) return;
      result.push({ id: castSel.value, style: stylSel ? stylSel.value : '', label: label });
    });
    return result;
  }

  function buildFinalPrompt() {
    var touchSelect = document.getElementById('touchSelect');
    var scene = (document.getElementById('sceneInput') || {value:''}).value.trim();
    var touchPrompt = '';
    if (touchSelect && touchSelect.value && touchMap[touchSelect.value]) {
      touchPrompt = touchMap[touchSelect.value].prompt || '';
    }
    var refs = getCastRefs();
    if (refs.length === 1) {
      // 単一キャスト: 従来通りprompt_featuresを含める
      var cast = castMap[refs[0].id];
      var sk = refs[0].style || (cast && cast.default_style) || '';
      var style = cast && cast.styles[sk] || {};
      var features = style.prompt_features_override || (cast && cast.prompt_features) || '';
      return [touchPrompt, features, scene].filter(Boolean).join(', ');
    } else if (refs.length > 1) {
      // 複数キャスト: ラベルを使う——prompt_featuresは入れない（refが語る）
      return [touchPrompt, scene].filter(Boolean).join(', ');
    }
    return [touchPrompt, scene].filter(Boolean).join(', ');
  }

  // defer済みスクリプトはDOMContentLoaded発火後に実行される — 直接登録
  (function bindButtons() {
    var btnPreview = document.getElementById('btnPreview');
    var btnCopy = document.getElementById('btnCopy');
    var btnGen = document.getElementById('btnGen');
    var dryRun = document.getElementById('dryRun');
    var promptPreview = document.getElementById('promptPreview');
    var finalPrompt = document.getElementById('finalPrompt');

    if (btnPreview) btnPreview.addEventListener('click', function() {
      var p = buildFinalPrompt();
      if (!p) return;
      promptPreview.textContent = p;
      dryRun.classList.add('visible');
      if (btnCopy) btnCopy.style.display = 'inline-block';
    });

    if (btnCopy) btnCopy.addEventListener('click', function() {
      navigator.clipboard.writeText(promptPreview.textContent).then(function() {
        btnCopy.textContent = '✅ コピー完了';
        setTimeout(function(){ btnCopy.textContent = '📋 コピー'; }, 2000);
      });
    });

    // 変更のたびにlocalStorageへ保存
    ['gen_touch','gen_model','gen_aspect'].forEach(function(name) {
      var el = document.querySelector('[name="' + name + '"]');
      if (el) el.addEventListener('change', saveSettings);
    });
    var sceneEl2 = document.getElementById('sceneSelect');
    if (sceneEl2) sceneEl2.addEventListener('change', saveSettings);
    var sceneInput2 = document.getElementById('sceneInput');
    if (sceneInput2) sceneInput2.addEventListener('input', saveSettings);

    // 結果パネル
    var resultPanel = document.getElementById('resultPanel');
    var resultImg = document.getElementById('resultImg');
    var resultPromptEcho = document.getElementById('resultPromptEcho');
    var resultDownload = document.getElementById('resultDownload');
    var resultError = document.getElementById('resultError');
    var btnScrollTop = document.getElementById('btnScrollTop');
    if (btnScrollTop) btnScrollTop.addEventListener('click', function() { window.scrollTo({top:0,behavior:'smooth'}); });

    var form = document.getElementById('form');
    if (btnGen) btnGen.addEventListener('click', function() {
      var p = buildFinalPrompt();
      if (!p) { alert('プロンプトを入力してください'); return; }
      if (finalPrompt) finalPrompt.value = p;
      var castRefsInput = document.getElementById('castRefsInput');
      var refs = getCastRefs();
      if (castRefsInput) castRefsInput.value = refs.length ? JSON.stringify(refs) : '';

      saveSettings();

      btnGen.disabled = true;
      btnGen.textContent = '生成中...（10〜30秒）';
      if (resultPanel) resultPanel.style.display = 'none';
      if (resultError) resultError.style.display = 'none';

      var fd = new FormData(form);
      fetch('${url('/image_gen/api/generate')}', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          btnGen.disabled = false;
          btnGen.textContent = '🎨 生成する';
          if (d.ok) {
            if (resultImg) resultImg.src = d.imgUrl;
            if (resultDownload) { resultDownload.href = d.downloadUrl; resultDownload.download = d.filename; }
            if (resultPromptEcho) resultPromptEcho.textContent = '「' + p.slice(0,120) + (p.length>120?'…':'') + '」';
            if (resultPanel) {
              resultPanel.style.display = 'block';
              resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          } else {
            if (resultError) { resultError.textContent = d.error || '生成に失敗しました'; resultError.style.display = 'block'; }
            if (resultPanel) resultPanel.style.display = 'block';
          }
        })
        .catch(function(e) {
          btnGen.disabled = false;
          btnGen.textContent = '🎨 生成する';
          if (resultError) { resultError.textContent = 'ネットワークエラー: ' + e.message; resultError.style.display = 'block'; }
          if (resultPanel) resultPanel.style.display = 'block';
        });
    });
  })();
})();
`;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(js);
});

// ── 画像配信 ─────────────────────────────────────
router.get('/img/:filename', requireAuth, (req, res) => {
  const filePath = path.join(OUT_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(filePath);
});

export const meta = {
  name: '画像生成',
  icon: 'fas fa-palette',
  desc: 'Imagenで画像生成（キャスト選択・dry-run対応）',
  layer: 'layer2' as const,
  url: '/image_gen',
};

export { router };
