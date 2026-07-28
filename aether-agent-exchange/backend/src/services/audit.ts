import prisma from '../lib/prisma';

/**
 * Write a compliance audit log entry. Fire-and-forget — never blocks the primary action.
 */
export function auditLog(
  actor: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  prisma.platformAuditLog.create({
    data: {
      actor,
      action,
      resourceType,
      resourceId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  }).catch((err) => {
    console.error('[AUDIT] Failed to write audit log:', err.message);
  });
}
