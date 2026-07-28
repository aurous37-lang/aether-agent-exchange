import { Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
const POLICY_VERSION = process.env.POLICY_VERSION || '2026-03-23';
const REQUIRED_CONSENT_TYPES = ['terms', 'privacy', 'risk', 'disclosure'] as const;

/**
 * Middleware: require that the authenticated user has accepted ALL consent types
 * for the current policy version.
 * Applies to all money-touching and state-changing endpoints.
 * This is BACKEND enforcement — frontend gates are secondary.
 *
 * Returns 451 (Unavailable For Legal Reasons) if any consent type is missing or stale.
 */
export function requireConsent(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  prisma.userConsent.findMany({
    where: {
      userId: req.auth.userId,
      policyVersion: POLICY_VERSION,
      consentType: { in: [...REQUIRED_CONSENT_TYPES] },
    },
    select: { consentType: true },
  }).then((consents) => {
    const accepted = new Set(consents.map(c => c.consentType));
    const missing = REQUIRED_CONSENT_TYPES.filter(t => !accepted.has(t));
    if (missing.length > 0) {
      res.status(451).json({
        error: 'Policy acceptance required',
        code: 'CONSENT_REQUIRED',
        currentVersion: POLICY_VERSION,
        missing,
        message: `You must accept all platform policies before performing this action. Missing: ${missing.join(', ')}`,
      });
      return;
    }
    next();
  }).catch((err) => {
    console.error('[CONSENT] Check failed:', err.message);
    // Fail closed in all environments — consent is a safety-critical path
    res.status(500).json({ error: 'Consent verification failed' });
  });
}

/**
 * Get the current policy version. Used by routes that need to return it.
 */
export function getCurrentPolicyVersion(): string {
  return POLICY_VERSION;
}
