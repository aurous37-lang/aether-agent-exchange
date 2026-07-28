import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { paramId } from '../utils/params';
import { disputeEvidenceSchema, arbiterVoteSchema } from '../utils/validation';
import { wsService } from '../services/websocket';
import { auditLog } from '../services/audit';
import { requireConsent } from '../middleware/consent';
import { calculateTrustScore } from './jobs';
import { assertJobCanComplete, SettlementError } from '../services/settlement';

const router = Router();

// ─── Get Dispute Detail ──────────────────────────────────────────

router.get('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: paramId(req) },
    include: {
      job: {
        include: {
          client: { select: { id: true, displayName: true, walletAddress: true } },
          agent: { select: { id: true, name: true, walletAddress: true } },
          submissions: true,
        },
      },
      evidence: { orderBy: { createdAt: 'desc' } },
      votes: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!dispute) { res.status(404).json({ error: 'Dispute not found' }); return; }
  res.json(dispute);
});

// ─── Submit Evidence ─────────────────────────────────────────────

router.post('/:id/evidence', requireAuth, requireConsent, validate(disputeEvidenceSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: paramId(req) },
    include: { job: { include: { agent: true } } },
  });

  if (!dispute) { res.status(404).json({ error: 'Dispute not found' }); return; }
  if (dispute.status === 'RESOLVED') { res.status(400).json({ error: 'Dispute already resolved' }); return; }

  const isClient = dispute.job.clientId === req.auth!.userId;
  const isAgentSide = dispute.job.agent?.handlerId === req.auth!.userId;
  if (!isClient && !isAgentSide) { res.status(403).json({ error: 'Not a party to this dispute' }); return; }

  const evidence = await prisma.disputeEvidence.create({
    data: {
      disputeId: paramId(req),
      submittedBy: req.auth!.walletAddress,
      contentHash: req.body.contentHash,
      description: req.body.description,
    },
  });

  auditLog(req.auth!.walletAddress, 'EVIDENCE_SUBMITTED', 'DISPUTE', paramId(req), { jobId: dispute.jobId });
  res.status(201).json(evidence);
});

// ─── Arbiter Vote ────────────────────────────────────────────────

router.post('/:id/vote', requireAuth, requireConsent, requireRole('ARBITER', 'ADMIN'), validate(arbiterVoteSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const dispute = await prisma.dispute.findUnique({
    where: { id: paramId(req) },
    include: { votes: true, job: true },
  });

  if (!dispute) { res.status(404).json({ error: 'Dispute not found' }); return; }
  if (dispute.status === 'RESOLVED') { res.status(400).json({ error: 'Already resolved' }); return; }

  const existingVote = await prisma.arbiterVote.findUnique({
    where: {
      disputeId_arbiterWallet: {
        disputeId: paramId(req),
        arbiterWallet: req.auth!.walletAddress,
      },
    },
  });

  if (existingVote) {
    res.status(409).json({ error: 'You have already voted on this dispute' });
    return;
  }

  const vote = await prisma.arbiterVote.create({
    data: {
      disputeId: paramId(req),
      arbiterWallet: req.auth!.walletAddress,
      agentBps: req.body.agentBps,
      reasoning: req.body.reasoning,
    },
  });

  // Check if we have 3 votes → auto-resolve with majority
  const allVotes = await prisma.arbiterVote.findMany({ where: { disputeId: paramId(req) } });
  if (allVotes.length >= 3) {
    // Majority vote: average the agentBps
    const avgBps = Math.round(allVotes.reduce((sum, v) => sum + v.agentBps, 0) / allVotes.length);
    if (avgBps > 0) {
      try {
        await assertJobCanComplete(dispute.job, {});
      } catch (error: any) {
        res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
        return;
      }
    }

    await prisma.dispute.update({
      where: { id: paramId(req) },
      data: { status: 'RESOLVED', agentBps: avgBps, resolvedAt: new Date() },
    });

    // Update job status
    const resolvedJob = await prisma.job.update({
      where: { id: dispute.jobId },
      data: { status: avgBps > 0 ? 'COMPLETED' : 'CANCELLED' },
    });

    // Recalculate trust score for the agent
    if (resolvedJob.agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: resolvedJob.agentId } });
      if (agent) {
        const jobsCompleted = await prisma.job.count({ where: { agentId: agent.id, status: 'COMPLETED' } });
        const disputesLost = await prisma.dispute.count({
          where: {
            job: { agentId: agent.id },
            status: 'RESOLVED',
            agentBps: 0,
          },
        });
        const trustScore = calculateTrustScore(
          { avgRating: agent.avgRating, createdAt: agent.createdAt },
          jobsCompleted,
          disputesLost,
        );
        await prisma.agent.update({
          where: { id: agent.id },
          data: { trustScore },
        });
      }
    }

    auditLog(req.auth!.walletAddress, 'DISPUTE_RESOLVED', 'DISPUTE', dispute.id, { jobId: dispute.jobId, agentBps: avgBps });
    wsService.broadcast(`job:${dispute.jobId}`, 'dispute:resolved', { disputeId: dispute.id, agentBps: avgBps });
  }

  auditLog(req.auth!.walletAddress, 'ARBITER_VOTED', 'DISPUTE', paramId(req), { agentBps: req.body.agentBps });
  res.json(vote);
});

export default router;
