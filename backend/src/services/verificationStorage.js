const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');
const { parsePrivateDocumentUrl } = require('../utils/verification-docs');
const { uploadRoot } = require('../middleware/uploadMiddleware');

const privateRoot = path.resolve(__dirname, '../../private/verification');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function ensureRoot() {
  fs.mkdirSync(privateRoot, { recursive: true });
}

function resolvePrivate(relativePath) {
  const raw = String(relativePath || '').replace(/\\/g, '/');
  if (!raw || raw.includes('..') || path.isAbsolute(raw)) {
    throw new ApiError(400, 'Invalid file path');
  }
  const full = path.resolve(privateRoot, raw);
  const root = path.resolve(privateRoot);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new ApiError(400, 'Invalid file path');
  }
  return full;
}

function contentTypeFor(relativePath, fallback) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return fallback || 'application/octet-stream';
}

function saveFromDisk(userId, diskPath, mimeType) {
  if (!diskPath || !fs.existsSync(diskPath)) {
    throw new ApiError(400, 'Choose a file to upload');
  }
  ensureRoot();
  const ext = MIME_EXT[mimeType] || path.extname(diskPath).replace('.', '') || 'bin';
  const name = `doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const relative = path.posix.join(String(userId), name);
  const full = resolvePrivate(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.copyFileSync(diskPath, full);
  return relative;
}

function open(relativePath, mimeType) {
  const full = resolvePrivate(relativePath);
  if (!fs.existsSync(full)) throw new ApiError(404, 'Verification document not found');
  return {
    full,
    contentType: contentTypeFor(relativePath, mimeType),
  };
}

function resolveUpload(url) {
  const rel = String(url || '').replace(/^\/uploads\/?/, '').replace(/\\/g, '/');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
    throw new ApiError(400, 'Invalid file path');
  }
  const full = path.resolve(uploadRoot, rel);
  const root = path.resolve(uploadRoot);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new ApiError(400, 'Invalid file path');
  }
  return full;
}

function openFromUrl(url, mimeType) {
  const relative = parsePrivateDocumentUrl(url);
  if (relative) return open(relative, mimeType);
  if (String(url || '').startsWith('/uploads/')) {
    const full = resolveUpload(url);
    if (!fs.existsSync(full)) throw new ApiError(404, 'Verification document not found');
    return { full, contentType: mimeType || contentTypeFor(full, 'application/octet-stream') };
  }
  throw new ApiError(404, 'Verification document not found');
}

module.exports = {
  privateRoot,
  resolvePrivate,
  saveFromDisk,
  open,
  openFromUrl,
};
