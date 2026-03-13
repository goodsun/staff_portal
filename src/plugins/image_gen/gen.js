
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
