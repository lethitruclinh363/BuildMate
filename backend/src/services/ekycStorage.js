const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');

const privateRoot = path.resolve(__dirname, '../../private/ekyc');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function ensureRoot() {
  fs.mkdirSync(privateRoot, { recursive: true });
}

function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function assertEkycImage(file, maxBytes) {
  const buffer = file?.buffer;
  if (!buffer || buffer.length === 0) {
    throw new ApiError(400, 'Choose an image to upload');
  }
  if (buffer.length > maxBytes) {
    throw new ApiError(400, 'The file format or size is not valid.');
  }
  const mime = sniffImage(buffer);
  if (!mime) {
    throw new ApiError(400, 'Use a JPG, PNG, or WEBP image');
  }
  return mime;
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

function removeEkycImage(relativePath) {
  if (!relativePath) return false;
  try {
    const full = resolvePrivate(relativePath);
    if (fs.existsSync(full)) fs.unlinkSync(full);
    return true;
  } catch {
    return false;
  }
}

function saveEkycImage(userId, kind, buffer, mime) {
  ensureRoot();
  const ext = MIME_EXT[mime] || 'jpg';
  const name = `${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const relative = path.posix.join(String(userId), name);
  const full = resolvePrivate(relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return relative;
}

function readPrivate(relativePath) {
  const full = resolvePrivate(relativePath);
  if (!fs.existsSync(full)) throw new ApiError(404, 'Verification image not found');
  const buffer = fs.readFileSync(full);
  return {
    buffer,
    mime: sniffImage(buffer) || 'image/jpeg',
    full,
  };
}

function contentTypeFor(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

module.exports = {
  privateRoot,
  sniffImage,
  assertEkycImage,
  resolvePrivate,
  saveEkycImage,
  removeEkycImage,
  readPrivate,
  contentTypeFor,
};
