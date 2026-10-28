const BLOCKED_PUBLIC_UPLOAD_SCOPES = new Set(['contractors']);

function publicUploadRelativePath(urlPath) {
  return String(urlPath || '')
    .replace(/\\/g, '/')
    .replace(/^\/uploads\/?/i, '')
    .replace(/^\//, '');
}

function isBlockedPublicUpload(urlPath) {
  const relative = publicUploadRelativePath(urlPath);
  const scope = relative.split('/')[0].toLowerCase();
  return BLOCKED_PUBLIC_UPLOAD_SCOPES.has(scope);
}

module.exports = {
  BLOCKED_PUBLIC_UPLOAD_SCOPES,
  publicUploadRelativePath,
  isBlockedPublicUpload,
};
