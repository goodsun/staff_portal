"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSET_MIMES = exports.DOC_MIMES = void 0;
exports.sanitizeFilename = sanitizeFilename;
exports.makeDocUploader = makeDocUploader;
exports.makeAssetUploader = makeAssetUploader;
/**
 * upload.ts — ファイルアップロード共通ユーティリティ
 * MIMEタイプ二重チェック + ファイル名サニタイズ
 */
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ファイル名サニタイズ（パストラバーサル・危険文字を除去）
function sanitizeFilename(raw) {
    const basename = path_1.default.basename(raw); // ディレクトリ部を除去
    return basename
        .replace(/[^\w\-. \u3000-\u9FFFぁ-ん゛゜ァ-ヶｦ-ｯｱ-ﾝﾞﾟー一-龯]/g, '_') // 危険文字→_
        .replace(/^\.+/, '_') // 先頭ドット除去
        .replace(/\s+/g, '_') // 空白→_
        .slice(0, 200); // 長さ制限
}
// ドキュメント用設定
exports.DOC_MIMES = {
    'text/plain': ['.txt'],
    'text/markdown': ['.md'],
    'application/pdf': ['.pdf'],
    'text/html': ['.html', '.htm'],
    'application/octet-stream': ['.txt', '.md'], // ブラウザがfallbackすることがある
};
// アセット用設定
exports.ASSET_MIMES = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],
    'video/mp4': ['.mp4'],
    'video/webm': ['.webm'],
    'video/quicktime': ['.mov'],
    'model/gltf+json': ['.gltf'],
    'model/gltf-binary': ['.glb'],
    'application/octet-stream': ['.glb', '.gltf'], // 3Dモデルのfallback
};
function makeStorage(destDir) {
    if (!fs_1.default.existsSync(destDir))
        fs_1.default.mkdirSync(destDir, { recursive: true });
    return multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, destDir),
        filename: (_req, file, cb) => {
            const safe = sanitizeFilename(file.originalname);
            const ext = path_1.default.extname(safe);
            const base = path_1.default.basename(safe, ext);
            const unique = `${base}_${Date.now()}${ext}`;
            cb(null, unique);
        },
    });
}
function makeMimeFilter(allowedMimes) {
    return (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const mimeOk = allowedMimes[file.mimetype];
        const extOk = Object.values(allowedMimes).flat().includes(ext);
        if (mimeOk || extOk) {
            cb(null, true);
        }
        else {
            cb(new Error(`許可されていないファイル形式: ${file.mimetype} (${ext})`));
        }
    };
}
function makeDocUploader(destDir) {
    return (0, multer_1.default)({
        storage: makeStorage(destDir),
        fileFilter: makeMimeFilter(exports.DOC_MIMES),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    });
}
function makeAssetUploader(destDir) {
    return (0, multer_1.default)({
        storage: makeStorage(destDir),
        fileFilter: makeMimeFilter(exports.ASSET_MIMES),
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });
}
