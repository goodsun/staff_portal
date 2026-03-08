import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.authenticated) return next();
  const next_url = encodeURIComponent(req.originalUrl);
  res.redirect(`${BASE}/login?next=${next_url}`);
}

// APIキー認証 or セッション認証（CLI/エージェントからの呼び出し対応）
// X-API-Key ヘッダーが一致すれば認証OK。なければセッション認証にフォールバック。
export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const expected = process.env.LABO_API_KEY ?? '';

  if (apiKey && expected.length > 0) {
    try {
      const a = Buffer.from(apiKey.padEnd(expected.length, '\0').slice(0, Math.max(apiKey.length, expected.length)));
      const b = Buffer.from(expected.padEnd(apiKey.length, '\0').slice(0, Math.max(apiKey.length, expected.length)));
      if (timingSafeEqual(a, b) && apiKey.length === expected.length) return next();
    } catch {
      // fall through to session auth
    }
  }

  // フォールバック: セッション認証
  const session = req.session as any;
  if (session?.authenticated) return next();

  // どちらもNG
  if (apiKey !== undefined) {
    // APIキーが送られてきたが不一致 → JSON で 401
    res.status(401).json({ error: 'Invalid API key' });
  } else {
    // ブラウザアクセス → ログインページへ
    const next_url = encodeURIComponent(req.originalUrl);
    res.redirect(`${BASE}/login?next=${next_url}`);
  }
}

export function checkPassword(input: string): boolean {
  const expected = process.env.LABO_PASSWORD ?? '';
  if (expected.length === 0) return false;
  // タイミング攻撃対策: crypto.timingSafeEqual を使用
  try {
    const a = Buffer.from(input.padEnd(expected.length, '\0').slice(0, Math.max(input.length, expected.length)));
    const b = Buffer.from(expected.padEnd(input.length, '\0').slice(0, Math.max(input.length, expected.length)));
    return timingSafeEqual(a, b) && input.length === expected.length;
  } catch {
    return false;
  }
}
