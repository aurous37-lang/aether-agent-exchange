import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { paramId } from '../utils/params';
import { isPaidDirectWalletRail, loadEscrowLifecycleEvidence } from '../services/escrowLifecycle';

const router = Router();

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '170', 10);
const NET_MULTIPLIER = (10000 - PLATFORM_FEE_BPS) / 10000;

// ─── Action Log Helper (XAI audit trail) ────────────────────────

async function logAction(
  agentId: string,
  actionType: string,
  data: {
    jobId?: string;
    inputHash?: string;
    outputHash?: string;
    reasoning?: string;
    autonomous?: boolean;
    success: boolean;
    errorMessage?: string;
    durationMs?: number;
  }
): Promise<void> {
  try {
    await prisma.agentActionLog.create({
      data: {
        agentId,
        actionType,
        jobId: data.jobId,
        inputHash: data.inputHash,
        outputHash: data.outputHash,
        reasoning: data.reasoning,
        autonomous: data.autonomous ?? true,
        success: data.success,
        errorMessage: data.errorMessage,
        durationMs: data.durationMs,
      },
    });
  } catch (err) {
    // Logging must never break the primary action
    console.error('[AgentActionLog] Failed to write audit log:', err);
  }
}

// ─── Agent API Key Auth Middleware ───────────────────────────────
//
// API key format: "agentId:secretKey"
//   - agentId is the DB UUID of the agent
//   - secretKey is the random portion, bcrypt-hashed in the DB
// The middleware splits on the first ':', looks up active keys by agentId,
// then bcrypt.compare() each until a match is found.

interface AgentApiRequest extends Request {
  agentApiAuth?: { agentId: string; keyId: string };
}

async function requireAgentApiKey(req: AgentApiRequest, res: Response, next: NextFunction): Promise<void> {
  const apiKey = req.headers['x-agent-api-key'] as string;
  if (!apiKey) {
    res.status(401).json({ error: 'x-agent-api-key header required' });
    return;
  }

  // Split "agentId:secretKey"
  const colonIdx = apiKey.indexOf(':');
  if (colonIdx === -1) {
    res.status(401).json({ error: 'Invalid API key format — expected agentId:secretKey' });
    return;
  }

  const agentId = apiKey.slice(0, colonIdx);
  const secretKey = apiKey.slice(colonIdx + 1);

  if (!agentId || !secretKey) {
    res.status(401).json({ error: 'Invalid API key format — expected agentId:secretKey' });
    return;
  }

  // Look up all active keys for this agent
  const keys = await prisma.agentApiKey.findMany({
    where: { agentId, active: true },
    include: { agent: true },
  });

  // Try each key with bcrypt.compare
  let matchedKey: (typeof keys)[0] | null = null;
  for (const key of keys) {
    if (!key.agent.active) continue;
    const isMatch = await bcrypt.compare(secretKey, key.keyHash);
    if (isMatch) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) {
    res.status(401).json({ error: 'Invalid or inactive API key' });
    return;
  }

  // Update last used
  await prisma.agentApiKey.update({ where: { id: matchedKey.id }, data: { lastUsed: new Date() } });

  req.agentApiAuth = { agentId: matchedKey.agentId, keyId: matchedKey.id };
  next();
}

// ─── Available Jobs ──────────────────────────────────────────────

router.get('/jobs/available', requireAgentApiKey, async (req: AgentApiRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  const agentId = req.agentApiAuth!.agentId;

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    await logAction(agentId, 'SCAN', { success: false, errorMessage: 'Agent not found', durationMs: Date.now() - startTime });
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // Match jobs to agent capabilities
  const jobs = await prisma.job.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true, title: true, description: true, category: true,
      deliverables: true, budgetAmount: true, budgetToken: true,
      deadline: true, createdAt: true,
      client: { select: { displayName: true } },
      _count: { select: { bids: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const durationMs = Date.now() - startTime;
  await logAction(agentId, 'SCAN', {
    success: true,
    reasoning: `Scanned for available jobs, found ${jobs.length} open job(s)`,
    outputHash: crypto.createHash('sha256').update(JSON.stringify(jobs.map(j => j.id))).digest('hex'),
    durationMs,
  });

  res.json(jobs);
});

// ─── Autonomous Bid Intent ───────────────────────────────────────

router.post('/jobs/:id/accept', requireAgentApiKey, async (req: AgentApiRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  const agentId = req.agentApiAuth!.agentId;
  const jobId = paramId(req);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || !agent.autonomousAccept) {
    await logAction(agentId, 'ACCEPT', {
      jobId,
      success: false,
      errorMessage: 'Autonomous accept not enabled for this agent',
      reasoning: 'Agent attempted to accept job but autonomousAccept is disabled',
      durationMs: Date.now() - startTime,
    });
    res.status(403).json({ error: 'Autonomous accept not enabled for this agent' });
    return;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'OPEN') {
    await logAction(agentId, 'ACCEPT', {
      jobId,
      success: false,
      errorMessage: 'Job not available',
      reasoning: `Attempted to accept job ${jobId} but it is not open (status: ${job?.status ?? 'not found'})`,
      durationMs: Date.now() - startTime,
    });
    res.status(400).json({ error: 'Job not available' });
    return;
  }

  if (job.clientId === agent.handlerId) {
    await logAction(agentId, 'ACCEPT', {
      jobId,
      success: false,
      errorMessage: 'Agent cannot accept its handler wallet job',
      reasoning: 'Autonomous accept endpoint refused self-dealing job assignment',
      durationMs: Date.now() - startTime,
    });
    res.status(403).json({ error: 'Agent cannot accept its handler wallet job' });
    return;
  }

  const amount = Number(req.body?.amount ?? job.budgetAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    await logAction(agentId, 'ACCEPT', {
      jobId,
      success: false,
      errorMessage: 'Bid amount must be positive',
      reasoning: 'Autonomous accept endpoint records bid intent only and requires a valid bid amount',
      durationMs: Date.now() - startTime,
    });
    res.status(400).json({ error: 'Bid amount must be positive' });
    return;
  }

  const estimatedDuration = typeof req.body?.estimatedDuration === 'string' && req.body.estimatedDuration.trim()
    ? req.body.estimatedDuration.trim()
    : agent.responseTime || 'unspecified';
  const message = typeof req.body?.message === 'string' && req.body.message.trim()
    ? req.body.message.trim()
    : 'Autonomous agent bid intent recorded. Client approval is required before assignment.';

  const bid = await prisma.bid.upsert({
    where: { jobId_agentId: { jobId, agentId: agent.id } },
    create: { jobId, agentId: agent.id, amount, estimatedDuration, message },
    update: { amount, estimatedDuration, message },
  });

  const durationMs = Date.now() - startTime;
  await logAction(agentId, 'ACCEPT', {
    jobId,
    success: true,
    reasoning: `Recorded autonomous bid intent for job "${job.title}" (budget: ${job.budgetAmount} ${job.budgetToken}); client acceptance is still required`,
    inputHash: crypto.createHash('sha256').update(JSON.stringify({ jobId, title: job.title, budget: job.budgetAmount, amount })).digest('hex'),
    durationMs,
  });

  res.status(202).json({
    status: 'BID_RECORDED',
    nextAction: 'client must accept this bid before the job can move to IN_PROGRESS',
    bid,
  });
});

// ─── Submit Deliverable ──────────────────────────────────────────

router.post('/jobs/:id/submit', requireAgentApiKey, async (req: AgentApiRequest, res: Response): Promise<void> => {
  const startTime = Date.now();
  const agentId = req.agentApiAuth!.agentId;
  const jobId = paramId(req);
  const { deliverableHash, notes } = req.body;

  if (!deliverableHash) {
    await logAction(agentId, 'SUBMIT', {
      jobId,
      success: false,
      errorMessage: 'deliverableHash required',
      reasoning: 'Submission rejected: missing deliverableHash field',
      durationMs: Date.now() - startTime,
    });
    res.status(400).json({ error: 'deliverableHash required' });
    return;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.agentId !== agentId) {
    await logAction(agentId, 'SUBMIT', {
      jobId,
      success: false,
      errorMessage: 'Not assigned to this job',
      reasoning: `Agent attempted to submit deliverable for job ${jobId} but is not the assigned agent`,
      durationMs: Date.now() - startTime,
    });
    res.status(403).json({ error: 'Not assigned to this job' });
    return;
  }
  let directWalletStatusProjection: string | undefined;
  if (isPaidDirectWalletRail(job)) {
    const lifecycle = await loadEscrowLifecycleEvidence(job.id, job);
    if (lifecycle.finalityStatus !== 'FINAL' || lifecycle.canonicalState !== 'DELIVERED_ONCHAIN') {
      const details = lifecycle.missingEvidence.length > 0 ? ` (${lifecycle.missingEvidence.join('; ')})` : '';
      await logAction(agentId, 'SUBMIT', {
        jobId,
        success: false,
        errorMessage: 'Missing indexed on-chain deliverable evidence',
        reasoning: `Paid direct-wallet submission rejected until DeliverableSubmitted is indexed and final${details}`,
        durationMs: Date.now() - startTime,
      });
      res.status(409).json({ error: `Paid direct-wallet deliverable submission requires finalized indexed DeliverableSubmitted evidence${details}` });
      return;
    }
    directWalletStatusProjection = lifecycle.jobStatusProjection;
  } else if (job.status !== 'IN_PROGRESS') {
    await logAction(agentId, 'SUBMIT', {
      jobId,
      success: false,
      errorMessage: 'Job not in progress',
      reasoning: `Submission rejected: job status is ${job.status}, expected IN_PROGRESS`,
      durationMs: Date.now() - startTime,
    });
    res.status(400).json({ error: 'Job not in progress' });
    return;
  }

  const existingSubmission = directWalletStatusProjection
    ? await prisma.submission.findFirst({ where: { jobId, deliverableHash } })
    : null;
  if (existingSubmission) {
    res.json(existingSubmission);
    return;
  }

  const [submission] = await Promise.all([
    prisma.submission.create({ data: { jobId, deliverableHash, notes } }),
    prisma.job.update({ where: { id: jobId }, data: { status: directWalletStatusProjection || 'PENDING_REVIEW' } }),
  ]);

  const durationMs = Date.now() - startTime;
  await logAction(agentId, 'SUBMIT', {
    jobId,
    success: true,
    reasoning: `Submitted deliverable for job "${job.title}"`,
    outputHash: deliverableHash,
    inputHash: crypto.createHash('sha256').update(JSON.stringify({ jobId, notes: notes || '' })).digest('hex'),
    durationMs,
  });

  res.status(201).json(submission);
});

// ─── Agent Status ────────────────────────────────────────────────

router.get('/status', requireAgentApiKey, async (req: AgentApiRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.agentApiAuth!.agentId },
    include: {
      acceptedJobs: {
        where: { status: { in: ['IN_PROGRESS', 'PENDING_REVIEW'] } },
        select: { id: true, title: true, status: true, budgetAmount: true, deadline: true },
      },
      _count: { select: { acceptedJobs: true, ratings: true } },
    },
  });

  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const completedJobs = await prisma.job.aggregate({
    where: { agentId: agent.id, status: 'COMPLETED' },
    _sum: { budgetAmount: true },
    _count: true,
  });

  res.json({
    id: agent.id,
    name: agent.name,
    active: agent.active,
    currentJobs: agent.acceptedJobs,
    stats: {
      completed: completedJobs._count,
      totalEarnings: (completedJobs._sum.budgetAmount || 0) * NET_MULTIPLIER,
      avgRating: agent.avgRating,
    },
  });
});

export default router;
