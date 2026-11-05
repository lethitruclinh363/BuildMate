const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

function createEkycClient({
  fetchImpl = global.fetch,
  baseUrl = env.ekycServiceUrl,
  token = env.ekycInternalToken,
  timeoutMs = env.ekycTimeoutMs,
} = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');

  async function request(pathname, { method = 'POST', headers = {}, body, useToken = false } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new ApiError(502, 'eKYC service is not configured');
    }
    const nextHeaders = { ...headers };
    if (useToken) {
      if (!token) throw new ApiError(503, 'eKYC internal token is not configured');
      nextHeaders['X-Internal-Token'] = token;
    }
    const url = `${root}${pathname}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: nextHeaders,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const cause = err?.cause;
      console.error('[ekyc] upstream connection failed', {
        url,
        method,
        error: err?.message,
        code: cause?.code || err?.code || null,
      });
      const wrapped = new ApiError(502, 'eKYC service is unavailable');
      wrapped.cause = err;
      throw wrapped;
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!response.ok) {
      const detail = typeof payload?.detail === 'string' ? payload.detail : 'eKYC service request failed';
      console.error('[ekyc] upstream response failed', {
        url,
        method,
        status: response.status,
        detail,
      });
      const statusCode = response.status >= 500 ? 502 : response.status;
      throw new ApiError(statusCode, detail);
    }
    return payload;
  }

  function imagePart(buffer, filename, mime = 'image/jpeg') {
    return new Blob([buffer], { type: mime });
  }

  return {
    verifyEkyc({ frontImageUrl, backImageUrl }) {
      return request('/api/v1/ai/verify-ekyc', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front_image_url: frontImageUrl,
          back_image_url: backImageUrl,
        }),
        useToken: true,
      });
    },

    verifyEkycUpload(front, back) {
      const form = new FormData();
      form.append('front_image', imagePart(front.buffer, 'front.jpg', front.mime), 'front.jpg');
      if (back?.buffer) {
        form.append('back_image', imagePart(back.buffer, 'back.jpg', back.mime), 'back.jpg');
      }
      return request('/api/v1/ai/verify-ekyc-upload', { body: form, useToken: true });
    },

    checkReadiness(image) {
      const form = new FormData();
      form.append('selfie_image', imagePart(image.buffer, 'preview.jpg', image.mime), 'preview.jpg');
      return request('/api/v1/face/check-readiness', { body: form, useToken: true });
    },

    validateFrame({ frame, step, reference, opposite }) {
      const form = new FormData();
      form.append('frame_image', imagePart(frame.buffer, 'frame.jpg', frame.mime), 'frame.jpg');
      form.append('step', step);
      if (reference?.buffer) {
        form.append('reference_image', imagePart(reference.buffer, 'reference.jpg', reference.mime), 'reference.jpg');
      }
      if (opposite?.buffer) {
        form.append('opposite_image', imagePart(opposite.buffer, 'opposite.jpg', opposite.mime), 'opposite.jpg');
      }
      return request('/api/v1/face/validate-frame', { body: form, useToken: true });
    },

    enroll({ selfie, left, right, up, down }) {
      const form = new FormData();
      form.append('selfie_image', imagePart(selfie.buffer, 'center.jpg', selfie.mime), 'center.jpg');
      form.append('left_image', imagePart(left.buffer, 'left.jpg', left.mime), 'left.jpg');
      form.append('right_image', imagePart(right.buffer, 'right.jpg', right.mime), 'right.jpg');
      form.append('up_image', imagePart(up.buffer, 'up.jpg', up.mime), 'up.jpg');
      form.append('down_image', imagePart(down.buffer, 'down.jpg', down.mime), 'down.jpg');
      return request('/api/v1/face/enroll', { body: form, useToken: true });
    },

    matchIdPortrait(front, selfie) {
      const form = new FormData();
      form.append('id_front_image', imagePart(front.buffer, 'front.jpg', front.mime), 'front.jpg');
      form.append('selfie_image', imagePart(selfie.buffer, 'center.jpg', selfie.mime), 'center.jpg');
      return request('/api/v1/face/match-id-portrait', { body: form, useToken: true });
    },
  };
}

module.exports = { createEkycClient, ekycAiClient: createEkycClient() };
