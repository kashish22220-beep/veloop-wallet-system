const AuditLog = require('../models/AuditLog');

/**
 * Writes an audit record. Pass the same `session` as the wallet change so the
 * audit entry commits (or rolls back) together with it.
 */
async function logAudit(
  { actorId = null, action, targetUserId = null, targetType = null, referenceId = null, metadata = {}, req = null },
  session = null
) {
  const doc = {
    actorId,
    action,
    targetUserId,
    targetType,
    referenceId,
    metadata,
    ip: req ? req.ip : null,
    userAgent: req ? req.get('user-agent') || null : null,
  };
  await AuditLog.create([doc], { session });
}

module.exports = { logAudit };
