import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../../core/auth';
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, ''); const url = (p: string) => `${BASE}${p}`;

const router = Router();

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const GEN_SCRIPT = path.join(__dirname, 'gen.js');
const OUT_DIR = '/home/node/.openclaw/workspace/generated_images';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 画像生成スクリプト（実行時に書き出す）
const GEN_SCRIPT_CONTENT = `
const fs = require('fs');
const https = require('https');

const [,, prompt, outPath, apiKey] = process.argv;
if (!prompt || !outPath || !apiKey) { console.error('usage: gen.js <prompt> <outPath> <apiKey>'); process.exit(1); }

// Imagen 3 API (direct fetch)
const IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=' + apiKey;

async function run() {
  const payload = JSON.stringify({
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '1:1' }
  });

  const data = await new Promise((resolve, reject) => {
    const url = new URL(IMAGEN_URL);
    const req = https.request({
      hostname: url.hostname, path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  if (data.error) { console.error(JSON.stringify(data.error)); process.exit(1); }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error('No image in response:', JSON.stringify(data).slice(0,200)); process.exit(1); }

  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log('OK:' + outPath);
}
run().catch(e => { console.error(e.message); process.exit(1); });
`;

// スクリプトを書き出し
if (!fs.existsSync(GEN_SCRIPT)) {
  fs.writeFileSync(GEN_SCRIPT, GEN_SCRIPT_CONTENT);
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
  .main{max-width:720px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  textarea{width:100%;padding:12px 14px;background:#0d1117;border:1px solid #0f3460;
    border-radius:6px;color:#e0e0e0;font-size:.95em;resize:vertical;min-height:100px;font-family:inherit}
  textarea:focus{outline:none;border-color:#e94560}
  button{padding:11px 28px;background:#e94560;color:#fff;border:none;border-radius:6px;
    font-size:1em;font-weight:600;cursor:pointer;margin-top:12px}
  button:hover{background:#c73652}
  button:disabled{background:#555;cursor:not-allowed}
  .img-wrap{margin-top:24px;text-align:center}
  .img-wrap img{max-width:100%;border-radius:8px;border:1px solid #0f3460}
  .prompt-echo{color:#888;font-size:.82em;margin-top:10px;font-style:italic}
  .error{color:#e94560;background:#1a0010;border:1px solid #e94560;border-radius:6px;padding:12px;margin-top:16px}
  .note{color:#888;font-size:.8em;margin-top:8px}
</style></head><body>
${body}
</body></html>`;
}

// GET: フォーム
router.get('/', requireAuth, (_req, res) => {
  if (!GEMINI_KEY) {
    const body = `
      <div class="header">
        <a href="${url('/')}">🏭 labo-portal</a>
        <span class="sep">›</span>
        <span>🎨 画像生成</span>
      </div>
      <div class="main">
        <h2>🎨 Gemini 画像生成</h2>
        <div class="error">GEMINI_API_KEY が設定されていません。.env に追加してください。</div>
      </div>`;
    return res.send(layout('画像生成', body));
  }

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>🎨 画像生成</span>
    </div>
    <div class="main">
      <h2>🎨 Gemini 画像生成</h2>
      <form method="post" action="${url('/image_gen')}" id="form">
        <textarea name="prompt" placeholder="画像の説明を英語または日本語で入力..." required></textarea>
        <p class="note">モデル: gemini-2.0-flash-exp-image-generation</p>
        <button type="submit" id="btn">生成する</button>
      </form>
      <script>
        document.getElementById('form').onsubmit = () => {
          document.getElementById('btn').disabled = true;
          document.getElementById('btn').textContent = '生成中...（10〜30秒）';
        };
      </script>
    </div>`;
  res.send(layout('画像生成', body));
});

// POST: 生成実行
router.post('/', requireAuth, (req, res) => {
  const prompt = (req.body.prompt ?? '').trim();
  if (!prompt) return res.redirect(url('/image_gen'));
  if (!GEMINI_KEY) return res.redirect(url('/image_gen'));

  const filename = `gen_${Date.now()}.png`;
  const outPath = path.join(OUT_DIR, filename);

  execFile('node', [GEN_SCRIPT, prompt, outPath, GEMINI_KEY], {
    timeout: 60000,
    env: { ...process.env, HOME: '/home/node' },
  }, (err, stdout, stderr) => {
    if (err || !fs.existsSync(outPath)) {
      const body = `
        <div class="header">
          <a href="${url('/')}">🏭 labo-portal</a>
          <span class="sep">›</span>
          <a href="${url('/image_gen')}">🎨 画像生成</a>
        </div>
        <div class="main">
          <h2>🎨 生成エラー</h2>
          <div class="error">${err?.message ?? 'Unknown error'}<br><pre style="margin-top:8px;font-size:.85em">${stderr}</pre></div>
          <p style="margin-top:16px"><a href="${url('/image_gen')}" style="color:#e94560">← 戻る</a></p>
        </div>`;
      return res.send(layout('生成エラー', body));
    }

    const body = `
      <div class="header">
        <a href="${url('/')}">🏭 labo-portal</a>
        <span class="sep">›</span>
        <a href="${url('/image_gen')}">🎨 画像生成</a>
      </div>
      <div class="main">
        <h2>🎨 生成完了</h2>
        <div class="img-wrap">
          <img src="${url('/image_gen/img/' + filename)}" alt="generated">
          <p class="prompt-echo">「${prompt.replace(/</g,'&lt;').slice(0,120)}」</p>
        </div>
        <p style="margin-top:20px">
          <a href="${url('/image_gen/img/' + filename)}" download="${filename}" style="color:#8be9fd">⬇ ダウンロード</a>
          &nbsp;&nbsp;
          <a href="${url('/image_gen')}" style="color:#e94560">もう一枚生成</a>
        </p>
      </div>`;
    res.send(layout('生成完了', body));
  });
});

// 画像配信
router.get('/img/:filename', requireAuth, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(OUT_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(filePath);
});

export const meta = {
  name: '画像生成',
  icon: '🎨',
  desc: 'Geminiで画像を生成（note記事アイキャッチなど）',
  layer: 'layer2' as const,
  url: '/image_gen',
};

export { router };
