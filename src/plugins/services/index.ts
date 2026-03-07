import { Router } from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../core/auth';

const BASE: string = (process.env.APP_BASE ?? '').replace(/\/$/, '');
const url = (p: string): string => BASE + p;

const router = Router();

interface ServiceDef {
  id: string;
  name: string;
  icon: string;
  check: string;       // プロセス確認コマンド
  start?: string;      // 起動コマンド（オプション）
  logFile?: string;    // ログファイルパス
}

const SERVICES: ServiceDef[] = [
  {
    id: 'labo_portal',
    name: 'labo-portal',
    icon: '🏭',
    check: "ps aux | grep 'ts-node.*app.ts' | grep -v grep",
    logFile: '/tmp/labo_portal.log',
  },
  {
    id: 'openclaw',
    name: 'OpenClaw Gateway',
    icon: '🦀',
    check: "ps aux | grep 'openclaw' | grep -v grep",
  },
];

function run(cmd: string): Promise<{ out: string; err: string; code: number }> {
  return new Promise(resolve => {
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({ out: stdout.trim(), err: stderr.trim(), code: error?.code ?? 0 });
    });
  });
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
  .main{max-width:800px;margin:0 auto;padding:28px 24px}
  h2{color:#e94560;font-size:1.1em;margin-bottom:20px}
  .service-card{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:18px;margin-bottom:14px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .svc-icon{font-size:1.6em}
  .svc-info{flex:1}
  .svc-name{font-weight:600;margin-bottom:4px}
  .svc-status{font-size:.85em}
  .on{color:#50fa7b}
  .off{color:#e94560}
  .actions{display:flex;gap:8px;flex-wrap:wrap}
  .btn{padding:7px 16px;border:none;border-radius:5px;font-size:.85em;cursor:pointer;font-weight:600}
  .btn-log{background:#0f3460;color:#8be9fd}
  .btn-log:hover{background:#1a4480}
  .sysinfo{background:#16213e;border:1px solid #0f3460;border-radius:8px;padding:18px;margin-top:24px}
  .sysinfo h3{color:#aaa;font-size:.85em;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px}
  .sysinfo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
  .sysinfo-item{background:#0d1117;border-radius:6px;padding:12px}
  .sysinfo-label{color:#888;font-size:.75em;margin-bottom:4px}
  .sysinfo-value{font-size:.95em;font-family:monospace}
  pre{background:#0d1117;border-radius:6px;padding:14px;font-size:.82em;overflow-x:auto;max-height:300px;overflow-y:auto;line-height:1.5;border:1px solid #0f3460}
  .refresh{color:#888;font-size:.8em;margin-top:20px}
</style></head><body>
${body}
</body></html>`;
}

// GET: ステータス一覧
router.get('/', requireAuth, async (_req, res) => {
  // サービスステータス確認
  const statuses = await Promise.all(SERVICES.map(async s => {
    const r = await run(s.check);
    return { ...s, running: r.out.length > 0 };
  }));

  // システム情報
  const [uptime, mem, cpu] = await Promise.all([
    run('uptime -p 2>/dev/null || uptime'),
    run("free -h | awk 'NR==2{printf \"%s / %s\", $3, $2}'"),
    run("grep 'cpu MHz' /proc/cpuinfo | awk '{sum+=$4; n++} END {printf \"%.0f MHz x %d\", sum/n, n}'"),
  ]);

  const cards = statuses.map(s => `
    <div class="service-card">
      <div class="svc-icon">${s.icon}</div>
      <div class="svc-info">
        <div class="svc-name">${s.name}</div>
        <div class="svc-status ${s.running ? 'on' : 'off'}">${s.running ? '● 稼働中' : '○ 停止中'}</div>
      </div>
      <div class="actions">
        ${s.logFile ? `<a href="${url('/services/log?id=' + s.id)}" class="btn btn-log">ログ</a>` : ''}
      </div>
    </div>`).join('');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <span>⚙️ サービス</span>
    </div>
    <div class="main">
      <h2>⚙️ サービス状態</h2>
      ${cards}
      <div class="sysinfo">
        <h3>システム情報</h3>
        <div class="sysinfo-grid">
          <div class="sysinfo-item"><div class="sysinfo-label">稼働時間</div><div class="sysinfo-value">${uptime.out}</div></div>
          <div class="sysinfo-item"><div class="sysinfo-label">メモリ使用</div><div class="sysinfo-value">${mem.out}</div></div>
          <div class="sysinfo-item"><div class="sysinfo-label">CPU</div><div class="sysinfo-value">${cpu.out || 'N/A'}</div></div>
          <div class="sysinfo-item"><div class="sysinfo-label">ホスト</div><div class="sysinfo-value">${process.env.HOSTNAME ?? 'unknown'}</div></div>
        </div>
      </div>
      <p class="refresh"><a href="${url('/services')}" style="color:#888">↻ 更新</a></p>
    </div>`;

  res.send(layout('サービス', body));
});

// GET: ログ表示
router.get('/log', requireAuth, async (req, res) => {
  const id = req.query.id as string;
  const svc = SERVICES.find(s => s.id === id);
  if (!svc?.logFile || !fs.existsSync(svc.logFile)) {
    return res.status(404).send('Log not found');
  }

  // 末尾200行
  const r = await run(`tail -200 ${svc.logFile}`);
  const escaped = r.out.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const body = `
    <div class="header">
      <a href="${url('/')}">🏭 labo-portal</a>
      <span class="sep">›</span>
      <a href="${url('/services')}">⚙️ サービス</a>
      <span class="sep">›</span>
      <span>${svc.name} ログ</span>
    </div>
    <div class="main">
      <h2>${svc.icon} ${svc.name} — ログ（末尾200行）</h2>
      <pre>${escaped || '（ログなし）'}</pre>
      <p style="margin-top:12px"><a href="${url('/services/log?id=' + id)}" style="color:#888">↻ 更新</a></p>
    </div>`;

  res.send(layout(`${svc.name} ログ`, body));
});

export const meta = {
  name: 'サービス',
  icon: '⚙️',
  desc: 'プロセス状態・ログ確認',
  layer: 'core' as const,
  url: '/services',
};

export { router };
