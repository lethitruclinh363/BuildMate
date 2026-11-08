const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');

const STEPS = Object.freeze(['center', 'left', 'right', 'up', 'down']);

function hashFrame(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function createLivenessSession({
  ttlMs = 10 * 60 * 1000,
  minGapMs = 400,
  now = () => Date.now(),
} = {}) {
  const sessions = new Map();

  function read(userId) {
    const row = sessions.get(String(userId));
    if (!row) return null;
    if (now() - row.startedAt > ttlMs) {
      sessions.delete(String(userId));
      return null;
    }
    return row;
  }

  function assertStep(userId, step, buffer) {
    const pose = String(step || '').trim().toLowerCase();
    const id = String(userId);
    let row = read(id);
    if (pose === 'center') {
      row = {
        startedAt: now(),
        lastAt: 0,
        nextIndex: 0,
        hashes: new Set(),
      };
      sessions.set(id, row);
    }
    if (!row) {
      throw new ApiError(400, 'Face scan session expired. Start from the front-facing pose.');
    }
    if (STEPS[row.nextIndex] !== pose) {
      throw new ApiError(400, `Unexpected liveness step. Expected ${STEPS[row.nextIndex]}.`);
    }
    const ts = now();
    if (row.lastAt && ts - row.lastAt < minGapMs) {
      throw new ApiError(400, 'Please wait a moment between poses.');
    }
    const digest = hashFrame(buffer);
    if (row.hashes.has(digest)) {
      throw new ApiError(400, 'Reuse of a previous frame is not allowed.');
    }
    row.lastAt = ts;
    return { row, digest };
  }

  function markPassed(userId, digest) {
    const row = read(userId);
    if (!row) throw new ApiError(400, 'Face scan session expired. Start from the front-facing pose.');
    row.hashes.add(digest);
    row.nextIndex += 1;
  }

  function assertCompleted(userId) {
    const row = read(userId);
    if (!row || row.nextIndex !== STEPS.length) {
      throw new ApiError(400, 'Complete the five-pose face scan first');
    }
  }

  function clear(userId) {
    sessions.delete(String(userId));
  }

  return { assertStep, markPassed, assertCompleted, clear, STEPS };
}

module.exports = {
  STEPS,
  createLivenessSession,
  livenessSession: createLivenessSession(),
};
