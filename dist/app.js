"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.url = exports.BASE = void 0;
require("dotenv/config");
const express_1 = __importStar(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./core/auth");
const plugin_1 = require("./core/plugin");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.LABO_PORT ?? '8800');
const NAME = process.env.LABO_NAME ?? 'labo-portal';
const AGENT = process.env.LABO_AGENT ?? '';
exports.BASE = (process.env.APP_BASE ?? '').replace(/\/$/, ''); // 例: /mephi
// BASE付きURL（絶対パス）
const url = (p) => `${exports.BASE}${p}`;
exports.url = url;
app.use(express_1.default.urlencoded({ extended: true }));
app.use(express_1.default.json());
app.use((0, express_session_1.default)({
    secret: process.env.LABO_SECRET ?? 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
}));
// ===== メインルーター（BASE 配下にマウント）=====
const router = (0, express_1.Router)();
// ===== 認証 =====
const loginPage = (error = '') => `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NAME} — Login</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
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
  <h1><i class="fas fa-industry"></i> ${NAME}</h1>
  ${AGENT ? `<div class="agent">${AGENT}</div>` : ''}
  ${error ? `<div class="error">${error}</div>` : ''}
  <form method="post" action="${(0, exports.url)('/login')}">
    <input type="password" name="password" placeholder="パスワード" autofocus>
    <button type="submit">入る</button>
  </form>
</div></body></html>`;
router.get('/login', (_req, res) => res.send(loginPage()));
router.post('/login', (req, res) => {
    if ((0, auth_1.checkPassword)(req.body.password ?? '')) {
        // 古いセッションを破棄して新しいセッションを作る（重複Cookie対策）
        req.session.regenerate((err) => {
            req.session.authenticated = true;
            req.session.save(() => {
                const next = req.query.next ?? (0, exports.url)('/');
                res.redirect(decodeURIComponent(next));
            });
        });
    }
    else {
        res.send(loginPage('パスワードが違います'));
    }
});
router.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect((0, exports.url)('/login')));
});
// ===== ダッシュボード =====
router.get('/', auth_1.requireAuth, (_req, res) => {
    const cards = plugin_1.registry.map(p => `
    <a href="${(0, exports.url)(p.url)}" class="card">
      <div class="icon"><i class="${p.icon}"></i></div>
      <div class="name">${p.name}<span class="badge">${p.layer}</span></div>
      <div class="desc">${p.desc}</div>
    </a>`).join('');
    res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${NAME}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
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
  <h1><i class="fas fa-industry"></i> ${NAME}</h1>
  <div class="meta">
    ${AGENT ? `<span>${AGENT}</span>` : ''}
    <a href="${(0, exports.url)('/logout')}">ログアウト</a>
  </div>
</div>
<div class="main">
  <div class="section-title">ツール</div>
  ${plugin_1.registry.length > 0
        ? `<div class="grid">${cards}</div>`
        : '<p class="empty">プラグインがまだありません。</p>'}
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
console.log(`\n🏭 ${NAME} starting... (BASE: "${exports.BASE || '/'}")`);
(0, plugin_1.loadPlugins)(router, path_1.default.join(__dirname, 'plugins'));
// メインルーターを BASE にマウント
app.use(exports.BASE || '/', router);
console.log(`   → http://localhost:${PORT}${exports.BASE}/\n`);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`   ✅ ready`);
});
