"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.checkPassword = checkPassword;
const crypto_1 = require("crypto");
const BASE = (process.env.APP_BASE ?? '').replace(/\/$/, '');
function requireAuth(req, res, next) {
    const session = req.session;
    if (session?.authenticated)
        return next();
    const next_url = encodeURIComponent(req.originalUrl);
    res.redirect(`${BASE}/login?next=${next_url}`);
}
function checkPassword(input) {
    const expected = process.env.LABO_PASSWORD ?? '';
    if (expected.length === 0)
        return false;
    // タイミング攻撃対策: crypto.timingSafeEqual を使用
    try {
        const a = Buffer.from(input.padEnd(expected.length, '\0').slice(0, Math.max(input.length, expected.length)));
        const b = Buffer.from(expected.padEnd(input.length, '\0').slice(0, Math.max(input.length, expected.length)));
        return (0, crypto_1.timingSafeEqual)(a, b) && input.length === expected.length;
    }
    catch {
        return false;
    }
}
