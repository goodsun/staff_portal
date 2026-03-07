/**
 * upload.ts — ファイルアップロード共通ユーティリティ
 * MIMEタイプ二重チェック + ファイル名サニタイズ
 */
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// ファイル名サニタイズ（パストラバーサル・危険文字を除去）
export function sanitizeFilename(raw: string): string {
  const basename = path.basename(raw);                         // ディレクトリ部を除去
  return basename
    .replace(/[^\w\-. \u3000-\u9FFFぁ-ん゛゜ァ-ヶｦ-ｯｱ-ﾝﾞﾟー一-龯]/g, '_') // 危険文字→_
    .replace(/^\.+/, '_')   // 先頭ドット除去
    .replace(/\s+/g, '_')   // 空白→_
    .slice(0, 200);          // 長さ制限
}

// ドキュメント用設定
export const DOC_MIMES: Record<string, string[]> = {
  'text/plain':         ['.txt'],
  'text/markdown':      ['.md'],
  'application/pdf':    ['.pdf'],
  'text/html':          ['.html', '.htm'],
  'application/octet-stream': ['.txt', '.md'],  // ブラウザがfallbackすることがある
};

// アセット用設定
export const ASSET_MIMES: Record<string, string[]> = {
  'image/jpeg':         ['.jpg', '.jpeg'],
  'image/png':          ['.png'],
  'image/gif':          ['.gif'],
  'image/webp':         ['.webp'],
  'image/svg+xml':      ['.svg'],
  'video/mp4':          ['.mp4'],
  'video/webm':         ['.webm'],
  'video/quicktime':    ['.mov'],
  'model/gltf+json':    ['.gltf'],
  'model/gltf-binary':  ['.glb'],
  'application/octet-stream': ['.glb', '.gltf'],  // 3Dモデルのfallback
};

function makeStorage(destDir: string) {
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destDir),
    filename: (_req, file, cb) => {
      const safe = sanitizeFilename(file.originalname);
      const ext = path.extname(safe);
      const base = path.basename(safe, ext);
      const unique = `${base}_${Date.now()}${ext}`;
      cb(null, unique);
    },
  });
}

function makeMimeFilter(allowedMimes: Record<string, string[]>) {
  return (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = allowedMimes[file.mimetype];
    const extOk = Object.values(allowedMimes).flat().includes(ext);

    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      cb(new Error(`許可されていないファイル形式: ${file.mimetype} (${ext})`));
    }
  };
}

export function makeDocUploader(destDir: string) {
  return multer({
    storage: makeStorage(destDir),
    fileFilter: makeMimeFilter(DOC_MIMES),
    limits: { fileSize: 5 * 1024 * 1024 },  // 5MB
  });
}

export function makeAssetUploader(destDir: string) {
  return multer({
    storage: makeStorage(destDir),
    fileFilter: makeMimeFilter(ASSET_MIMES),
    limits: { fileSize: 100 * 1024 * 1024 },  // 100MB
  });
}
