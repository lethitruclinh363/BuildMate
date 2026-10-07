const { AUDIT_ACTION } = require('../models/AuditLog');
const { AuditLog } = require('../repositories/systemAccess');
const { findUsersByIds } = require('../repositories/partnerAccess');

async function writeAudit({ actorId, actorRole = '', action, entityType, entityId = '', meta = {}, ip = '' }) {
  const doc = await AuditLog.create({
    actorId: actorId || null,
    actorRole,
    action,
    entityType,
    entityId: String(entityId || ''),
    meta,
    ip,
  });
  return doc.toPublic();
}

function fromRequest(req, fields) {
  return writeAudit({
    actorId: req.user?.id,
    actorRole: req.user?.role || '',
    ip: req.ip || req.headers['x-forwarded-for'] || '',
    ...fields,
  });
}

async function listAudit({ action, limit = 50 } = {}) {
  const filter = {};
  if (action) filter.action = action;
  const rows = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200));
  const actors = await findUsersByIds(rows.map((row) => row.actorId).filter(Boolean));
  const byId = new Map(actors.map((actor) => [String(actor._id), actor]));
  return rows.map((row) => {
    const actor = row.actorId ? byId.get(String(row.actorId)) : null;
    return {
      ...row.toPublic(),
      actor: actor
        ? { id: actor._id, name: actor.name, email: actor.email, role: actor.role }
        : null,
    };
  });
}

module.exports = { writeAudit, fromRequest, listAudit, AUDIT_ACTION };
