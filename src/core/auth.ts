import { Request, Response, NextFunction } from 'express';

const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (session?.authenticated) return next();
  const next_url = encodeURIComponent(req.originalUrl);
  res.redirect(`${BASE}/login?next=${next_url}`);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.LABO_PASSWORD ?? '';
  return expected.length > 0 && input === expected;
}
