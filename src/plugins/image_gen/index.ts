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
const OUT_DIR = '/home/node/.openclaw/workspace/generated_images';
const CASTS_DIR = '/home/node/.openclaw/workspace/data/casts';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── gen.js（Imagen / Gemini multimodal） ─────────
const GEN_SCRIPT_CONTENT = `
const fs = require('fs');
const https = require('https');
// argv: prompt, outPath, apiKey, [refImagePath], [model]
const [,, prompt, outPath, apiKey, refImagePath, modelArg] = process.argv;
if (!prompt || !outPath || !apiKey) { console.error('usage: gen.js <prompt> <outPath> <apiKey> [refImagePath]'); process.exit(1); }

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

async function genWithRef(refPath) {
  // Gemini multimodal: ref image + prompt → image
  const refData = fs.readFileSync(refPath);
  const mimeType = refPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const b64ref = refData.toString('base64');
  const model = modelArg || 'gemini-2.0-flash-exp-image-generation';
  console.log('using model:', model);
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
  const payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: b64ref } },
        { text: prompt + '. Use the reference image as the character design basis. Maintain the character visual style.' }
      ]
    }],
    generationConfig: { responseModalities: ['image', 'text'] }
  };
  const data = await httpsPost(url, payload);
  if (data.error) { console.error(JSON.stringify(data.error)); process.exit(1); }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find(p => p.inlineData?.data);
  if (!imgPart) { console.error('No image in response:', JSON.stringify(data).slice(0,300)); process.exit(1); }
  fs.writeFileSync(outPath, Buffer.from(imgPart.inlineData.data, 'base64'));
  console.log('OK(' + model + '):' + outPath);
}

async function genImagen() {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=' + apiKey;
  const data = await httpsPost(url, { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } });
  if (data.error) { console.error(JSON.stringify(data.error)); process.exit(1); }
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error('No image:', JSON.stringify(data).slice(0,200)); process.exit(1); }
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('OK(imagen):' + outPath);
}

async function run() {
  if (refImagePath && fs.existsSync(refImagePath)) {
    console.log('using ref:', refImagePath);
    await genWithRef(refImagePath);
  } else {
    await genImagen();
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
`;
if (!fs.existsSync(GEN_SCRIPT)) fs.writeFileSync(GEN_SCRIPT, GEN_SCRIPT_CONTENT);

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

        <!-- キャスト選択 -->
        <div class="card">
          <h3>🎭 キャスト（任意）</h3>
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <label>キャラクター</label>
              <select name="cast_id" id="castSelect">
                <option value="">選択しない（プロンプト直書き）</option>
                ${castOptions}
              </select>
            </div>
            <div style="flex:1;min-width:150px;display:none" id="styleWrap">
              <label>スタイル</label>
              <select name="cast_style" id="styleSelect"><option value="">—</option></select>
            </div>
          </div>
          <div class="cast-preview" id="castPreview">
            <div class="cast-icon" id="castIcon">👤</div>
            <div class="cast-info">
              <div class="cname" id="castName"></div>
              <div class="crole" id="castRole"></div>
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
          <button type="button" id="btnPreview" class="btn btn-copy">🔍 プロンプト確認</button>
          <button type="button" id="btnCopy" class="btn btn-copy" style="display:none">📋 コピー</button>
          <button type="button" id="btnGen" class="btn btn-primary">🎨 生成する</button>
        </div>
        <p class="hint" style="margin-top:8px">生成には10〜30秒かかります</p>
      </form>
    </div>
    <script src="${url('/image_gen/client.js')}" defer></script>`;
  res.send(layout('画像生成', body));
});

// ── POST: 生成実行 ────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  // final_prompt（組み立て済み）があればそれを使う、なければsceneをそのまま
  const prompt = ((req.body.final_prompt || req.body.scene || req.body.prompt) ?? '').trim();
  console.log('[image_gen] POST body keys:', Object.keys(req.body), 'cast_id:', req.body.cast_id, 'cast_style:', req.body.cast_style);
  console.log('[image_gen] POST received, prompt:', prompt.slice(0, 80));
  if (!prompt) return res.redirect(url('/image_gen'));
  if (!GEMINI_KEY) return res.redirect(url('/image_gen'));

  // ref画像・モデル: cast_id + cast_styleから解決
  let refImagePath = '';
  let genModel = '';
  const castId = String(req.body.cast_id ?? '').trim();
  const castStyle = String(req.body.cast_style ?? '').trim();
  if (castId) {
    try {
      const profile = JSON.parse(fs.readFileSync(path.join(CASTS_DIR, castId, 'profile.json'), 'utf-8'));
      const styleData = profile.styles?.[castStyle] || profile.styles?.[profile.default_style] || {};
      const imgFile = styleData.image || profile.avatars?.main || '';
      if (imgFile) {
        const candidate = path.join(CASTS_DIR, castId, imgFile);
        if (fs.existsSync(candidate)) refImagePath = candidate;
      }
      genModel = styleData.model || '';
    } catch {}
  }
  console.log('[image_gen] ref:', refImagePath || 'none', 'model:', genModel || 'default');

  const filename = `gen_${Date.now()}.png`;
  const outPath = path.join(OUT_DIR, filename);

  console.log('[image_gen] starting gen.js, outPath:', filename);
  const args = [GEN_SCRIPT, prompt, outPath, GEMINI_KEY];
  if (refImagePath) args.push(refImagePath);
  if (genModel) args.push(genModel);
  execFile('node', args, {
    timeout: 90000,
    env: { ...process.env, HOME: '/home/node' },
  }, (err, stdout, stderr) => {
    console.log('[image_gen] gen.js done, err:', err?.message, 'stdout:', stdout?.slice(0,50), 'stderr:', stderr?.slice(0,100));
    if (err || !fs.existsSync(outPath)) {
      const body = `
        <div class="header"><a href="${url('/')}">🏭 labo-portal</a><span class="sep">›</span>
          <a href="${url('/image_gen')}">🎨 画像生成</a></div>
        <div class="main">
          <h2>🎨 生成エラー</h2>
          <div class="error">${err?.message ?? 'Unknown error'}<br>
            <pre style="margin-top:8px;font-size:.85em;white-space:pre-wrap">${stderr}</pre></div>
          <p style="margin-top:16px"><a href="${url('/image_gen')}" style="color:#e94560">← 戻る</a></p>
        </div>`;
      return res.send(layout('生成エラー', body));
    }

    const body = `
      <div class="header"><a href="${url('/')}">🏭 labo-portal</a><span class="sep">›</span>
        <a href="${url('/image_gen')}">🎨 画像生成</a></div>
      <div class="main">
        <h2>🎨 生成完了</h2>
        <div class="img-wrap">
          <img src="${url('/image_gen/img/' + filename)}" alt="generated">
          <p class="prompt-echo">「${prompt.replace(/</g,'&lt;').slice(0, 120)}${prompt.length > 120 ? '…' : ''}」</p>
        </div>
        <div style="display:flex;gap:16px;margin-top:20px;flex-wrap:wrap">
          <a href="${url('/image_gen/img/' + filename)}" download="${filename}" class="btn btn-copy">⬇ ダウンロード</a>
          <a href="${url('/image_gen')}" class="btn btn-primary">もう一枚生成</a>
        </div>
      </div>`;
    res.send(layout('生成完了', body));
  });
});

// ── client.js 配信 ───────────────────────────────
router.get('/client.js', requireAuth, (req, res) => {
  const apiBase = url('/image_gen');
  const js = `
(function() {
  var castMap = {};

  console.log('[image_gen] loading casts from API...');
  fetch('${url('/image_gen/api/casts')}', { credentials: 'same-origin' })
    .then(function(r){
      console.log('[image_gen] /api/casts status:', r.status);
      return r.json();
    })
    .then(function(data){
      console.log('[image_gen] casts loaded:', data.length, data.map(function(c){return c.id;}));
      castMap = {};
      data.forEach(function(c){ castMap[c.id] = c; });
      initUI();
    })
    .catch(function(e){ console.error('[image_gen] cast load error:', e); });

  function initUI() {
    console.log('[image_gen] initUI called, castMap keys:', Object.keys(castMap));
    var castSelect = document.getElementById('castSelect');
    var styleSelect = document.getElementById('styleSelect');
    var styleWrap = document.getElementById('styleWrap');
    var castPreview = document.getElementById('castPreview');
    var castIcon = document.getElementById('castIcon');
    var castName = document.getElementById('castName');
    var castRole = document.getElementById('castRole');
    var sceneLabel = document.getElementById('sceneLabel');
    var dryRun = document.getElementById('dryRun');
    var btnCopy = document.getElementById('btnCopy');

    if (!castSelect) return;

    castSelect.addEventListener('change', function() {
      var id = castSelect.value;
      var cast = castMap[id];
      dryRun.classList.remove('visible');
      if (btnCopy) btnCopy.style.display = 'none';

      if (cast) {
        styleSelect.innerHTML = Object.entries(cast.styles).map(function(e) {
          var sk = e[0], sv = e[1];
          return '<option value="' + sk + '"' + (sk === cast.default_style ? ' selected' : '') + '>' + sv.description + '</option>';
        }).join('');
        styleWrap.style.display = 'block';
        castPreview.classList.add('visible');
        castName.textContent = (cast.emoji || '') + ' ' + cast.name;
        castRole.textContent = cast.role || '';
        updateStylePreview(cast);
        sceneLabel.textContent = 'シーン・ポーズ・追加指示';
      } else {
        styleWrap.style.display = 'none';
        castPreview.classList.remove('visible');
        sceneLabel.textContent = 'プロンプト（英語推奨）';
      }
    });

    styleSelect.addEventListener('change', function() {
      var cast = castMap[castSelect.value];
      if (cast) updateStylePreview(cast);
      dryRun.classList.remove('visible');
    });

    function updateStylePreview(cast) {
      var sk = styleSelect.value || cast.default_style;
      var style = cast.styles[sk] || {};
      var imgUrl = style.imageUrl || cast.mainImgUrl || '';
      castIcon.innerHTML = imgUrl
        ? '<img src="' + imgUrl + '" alt="" style="width:100%;height:100%;object-fit:cover">'
        : '<span style="font-size:1.5em">' + (cast.emoji || '\\u{1F464}') + '</span>';
    }
  }

  function buildFinalPrompt() {
    var castSelect = document.getElementById('castSelect');
    var styleSelect = document.getElementById('styleSelect');
    var scene = (document.getElementById('sceneInput') || {value:''}).value.trim();
    var id = castSelect ? castSelect.value : '';
    var cast = castMap[id];
    if (cast) {
      var sk = (styleSelect && styleSelect.value) || cast.default_style;
      var style = cast.styles[sk] || {};
      var features = style.prompt_features_override || cast.prompt_features || '';
      var prefix = style.prompt_prefix || '';
      return [prefix, features, scene].filter(Boolean).join(', ');
    }
    return scene;
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

    var form = document.getElementById('form');
    if (btnGen) btnGen.addEventListener('click', function() {
      var p = buildFinalPrompt();
      console.log('[image_gen] submit prompt:', p);
      if (!p) { alert('プロンプトを入力してください'); return; }
      if (finalPrompt) finalPrompt.value = p;
      var castSelect2 = document.getElementById('castSelect');
      var styleSelect2 = document.getElementById('styleSelect');
      console.log('[image_gen] calling form.submit(), cast:', castSelect2 && castSelect2.value, 'style:', styleSelect2 && styleSelect2.value);
      btnGen.disabled = true;
      btnGen.textContent = '生成中...（10〜30秒）';
      if (form) form.submit();
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
  icon: '🎨',
  desc: 'Imagenで画像生成（キャスト選択・dry-run対応）',
  layer: 'layer2' as const,
  url: '/image_gen',
};

export { router };
