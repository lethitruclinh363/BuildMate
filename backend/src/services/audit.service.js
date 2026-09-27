const { AuditLog, AUDIT_ACTION } = require('../models/AuditLog');

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
    .limit(Math.min(Number(limit) || 50, 200))
    .populate('actorId', 'name email role');
  return rows.map((row) => ({
    ...row.toPublic(),
    actor: row.actorId
      ? { id: row.actorId._id, name: row.actorId.name, email: row.actorId.email, role: row.actorId.role }
      : null,
  }));
}

module.exports = { writeAudit, fromRequest, listAudit, AUDIT_ACTION };
