import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { auditLog } from '../services/audit';
import { paramId } from '../utils/params';
import { z } from 'zod';
import { validate } from '../middleware/validate';

const router = Router();

const reportReasons = ['PROHIBITED_CONTENT', 'FRAUD', 'IP_VIOLATION', 'PRIVACY_VIOLATION', 'OTHER'] as const;

const reportSchema = z.object({
  reason: z.enum(reportReasons),
  description: z.string().min(10).max(2000),
});

// ─── Report a Job ───────────────────────────────────────────────────
// Any authenticated user can report a job for policy violations (Section 9).

router.post('/jobs/:id/report', requireAuth, validate(reportSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const jobId = paramId(req);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const existing = await prisma.jobReport.findFirst({
    where: { jobId, reporterId: req.auth!.userId, status: 'PENDING' },
  });
  if (existing) {
    res.status(409).json({ error: 'You already have a pending report on this job' });
    return;
  }

  const report = await prisma.jobReport.create({
    data: {
      jobId,
      reporterId: req.auth!.userId,
      reason: req.body.reason,
      description: req.body.description,
    },
  });

  auditLog(req.auth!.walletAddress, 'JOB_REPORTED', 'JOB', jobId, { reason: req.body.reason });

  res.status(201).json(report);
});

export default router;
