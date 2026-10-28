const path = require('path');
const crypto = require('crypto');

const MIME_BY_EXT = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT));
const CHAT_MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.mov']);

const UPLOAD_SCOPES = Object.freeze({
  users: 'users',
  contractors: 'contractors',
  stores: 'stores',
  repair: 'repair',
  chat: 'chat',
  progress: 'progress',
});

function extensionOf(filename = '') {
  return path.extname(String(filename)).toLowerCase();
}

function isAllowedFile(file) {
  const ext = extensionOf(file.originalname);
  if (!MIME_BY_EXT[ext]) return false;
  if (file.mimetype && !ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
    return false;
  }
  return true;
}

function isChatMedia(file) {
  const ext = extensionOf(file.originalname);
  if (!CHAT_MEDIA_EXT.has(ext)) return false;
  if (file.mimetype && !file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/')) {
    return false;
  }
  return true;
}

function secureFilename(originalName) {
  const ext = MIME_BY_EXT[extensionOf(originalName)] ? extensionOf(originalName) : '';
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function maxBytesFor(file, fallbackMb) {
  const ext = extensionOf(file?.originalname);
  if (['.mp4', '.mov'].includes(ext)) return Math.max(fallbackMb, 25) * 1024 * 1024;
  if (['.pdf', '.doc', '.docx'].includes(ext)) return Math.max(fallbackMb, 10) * 1024 * 1024;
  return fallbackMb * 1024 * 1024;
}

module.exports = {
  MIME_BY_EXT,
  ALLOWED_MIME,
  CHAT_MEDIA_EXT,
  UPLOAD_SCOPES,
  extensionOf,
  isAllowedFile,
  isChatMedia,
  secureFilename,
  maxBytesFor,
};
