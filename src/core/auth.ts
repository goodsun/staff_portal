import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.authenticated) return next();
  const next_url = encodeURIComponent(req.originalUrl);
  res.redirect(`${BASE}/login?next=${next_url}`);
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
