import 'dotenv/config';
import express, { Router } from 'express';
import session from 'express-session';
import path from 'path';
import { requireAuth, checkPassword } from './core/auth';
import { loadPlugins, registry } from './core/plugin';

const app = express();
const PORT = parseInt(process.env.LABO_PORT ?? '8800');
const NAME = process.env.LABO_NAME ?? 'labo-portal';
const AGENT = process.env.LABO_AGENT ?? '';
export const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, ''); // 例: /mephi

// BASE付きURL（絶対パス）
export const url = (p: string) => `${BASE}${p}`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.LABO_SECRET ?? 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));

// ===== メインルーター（BASE 配下にマウント）=====
const router = Router();

// ===== 認証 =====

const loginPage = (error = '') => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NAME} — Login</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;
       display:flex;align-items:center;justify-content:center;min-height:100vh}
  .box{background:#16213e;border:1px solid #0f3460;border-radius:12px;padding:40px;width:340px}
  h1{color:#e94560;font-size:1.3em;margin-bottom:8px}
  .agent{color:#888;font-size:.9em;margin-bottom:28px}
  input{width:100%;padding:10px 14px;background:#0d1117;border:1px solid #0f3460;
        border-radius:6px;color:#e0e0e0;font-size:1em;margin-bottom:12px}
  input:focus{outline:none;border-color:#e94560}
  button{width:100%;padding:11px;background:#e94560;color:#fff;border:none;
         border-radius:6px;font-size:1em;font-weight:600;cursor:pointer}
  button:hover{background:#c73652}
  .error{color:#e94560;font-size:.85em;margin-bottom:12px}
</style></head><body>
<div class="box">
  <h1>🏭 ${NAME}</h1>
  ${AGENT ? `<div class="agent">${AGENT}</div>` : ''}
  ${error ? `<div class="error">${error}</div>` : ''}
  <form method="post" action="${url('/login')}">
    <input type="password" name="password" placeholder="パスワード" autofocus>
    <button type="submit">入る</button>
  </form>
</div></body></html>`;

router.get('/login', (_req, res) => res.send(loginPage()));

router.post('/login', (req, res) => {
  if (checkPassword(req.body.password ?? '')) {
    // 古いセッションを破棄して新しいセッションを作る（重複Cookie対策）
    req.session.regenerate((err) => {
      (req.session as any).authenticated = true;
      req.session.save(() => {
        const next = req.query.next as string ?? url('/');
        res.redirect(decodeURIComponent(next));
      });
    });
  } else {
    res.send(loginPage('パスワードが違います'));
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect(url('/login')));
});

// ===== ダッシュボード =====

router.get('/', requireAuth, (_req, res) => {
  const cards = registry.map(p => `
    <a href="${url(p.url)}" class="card">
      <div class="icon">${p.icon}</div>
      <div class="name">${p.name}<span class="badge">${p.layer}</span></div>
      <div class="desc">${p.desc}</div>
    </a>`).join('');

  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NAME}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh}
  .header{background:#16213e;border-bottom:1px solid #0f3460;padding:16px 24px;
          display:flex;justify-content:space-between;align-items:center}
  .header h1{color:#e94560;font-size:1.2em}
  .header .meta{color:#888;font-size:.85em;display:flex;gap:16px;align-items:center}
  .header a{color:#e94560;text-decoration:none}
  .main{max-width:900px;margin:40px auto;padding:0 24px}
  .section-title{color:#aaa;font-size:.8em;text-transform:uppercase;letter-spacing:2px;margin-bottom:16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
  .card{background:#16213e;border:1px solid #0f3460;border-radius:10px;padding:20px;
        text-decoration:none;color:#e0e0e0;transition:border-color .2s,transform .1s;display:block}
  .card:hover{border-color:#e94560;transform:translateY(-2px)}
  .card .icon{font-size:1.8em;margin-bottom:10px}
  .card .name{font-weight:600;margin-bottom:4px}
  .card .desc{color:#888;font-size:.82em;line-height:1.4}
  .badge{display:inline-block;font-size:.7em;padding:2px 6px;border-radius:4px;
         background:#0f3460;color:#8be9fd;margin-left:6px;vertical-align:middle}
  .empty{color:#888}
</style></head><body>
<div class="header">
  <h1>🏭 ${NAME}</h1>
  <div class="meta">
    ${AGENT ? `<span>${AGENT}</span>` : ''}
    <a href="${url('/logout')}">ログアウト</a>
  </div>
</div>
<div class="main">
  <div class="section-title">ツール</div>
  ${registry.length > 0
    ? `<div class="grid">${cards}</div>`
    : '<p class="empty">プラグインがまだありません。</p>'
  }
</div></body></html>`);
});

// ===== デバッグ =====
router.get('/debug-session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    cookies: req.headers.cookie,
    headers: { host: req.headers.host, referer: req.headers.referer }
  });
});

// ===== プラグイン読み込み（routerに登録）=====
console.log(`\n🏭 ${NAME} starting... (BASE: "${BASE || '/'}")`);
loadPlugins(router as any, path.join(__dirname, 'plugins'));

// メインルーターを BASE にマウント
app.use(BASE || '/', router);

console.log(`   → http://localhost:${PORT}${BASE}/\n`);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`   ✅ ready`);
});
