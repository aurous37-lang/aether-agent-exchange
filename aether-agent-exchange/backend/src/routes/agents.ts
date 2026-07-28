import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { paramId } from '../utils/params';
import { registerAgentSchema, paginationSchema } from '../utils/validation';
import { parseJsonArrays, parseJsonArraysList, serializeArrays } from '../utils/sqlite-compat';
import { requireConsent } from '../middleware/consent';
import { auditLog } from '../services/audit';
import { sanitizeWorkspacePayload } from '../services/workspaces';

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '170', 10);
const NET_MULTIPLIER = (10000 - PLATFORM_FEE_BPS) / 10000; // 0.983 at 170 BPS

const router = Router();
const AGENT_JOB_HISTORY_STATUSES = ['FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'DISPUTED', 'RESOLVED'];

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function normalizeAgentWorkspace(workspace: any) {
  if (!workspace) return null;
  const latestVerification = workspace.verificationResults?.[0];
  const latestSnapshot = workspace.evidenceSnapshots?.[0];

  return sanitizeWorkspacePayload({
    id: workspace.id,
    provider: workspace.provider,
    status: workspace.status,
    repoUrl: workspace.repoUrl,
    repositoryUrl: workspace.repoUrl,
    repoOwner: workspace.repoOwner,
    repoName: workspace.repoName,
    nodeUrl: workspace.nodeUrl,
    repoDid: workspace.repoDid,
    cloneUrl: workspace.cloneUrl,
    gitlawbCloneUrl: workspace.cloneUrl,
    branch: workspace.branchRef,
    branchRef: workspace.branchRef,
    pullRequestRef: workspace.prRef,
    pullRequestNumber: workspace.prNumber,
    prRef: workspace.prRef,
    prNumber: workspace.prNumber,
    commitSha: workspace.commitSha,
    commitHash: workspace.commitSha,
    treeCid: workspace.treeCid,
    refCertificateCid: workspace.refCertificateCid,
    verificationStatus: workspace.latestVerificationStatus,
    verificationState: workspace.latestVerificationStatus,
    verificationSummary: latestVerification
      ? `${latestVerification.status}: ${parseJsonArray(latestVerification.failureReasons).join('; ') || 'workspace evidence recorded'}`
      : workspace.capabilitySummary,
    finalSnapshot: latestSnapshot ? parseJsonObject(latestSnapshot.evidence) : undefined,
    finalSnapshotRef: latestSnapshot?.evidenceHash,
    evidenceSnapshots: (workspace.evidenceSnapshots || []).map((snapshot: any) => ({
      id: snapshot.id,
      evidenceHash: snapshot.evidenceHash,
      snapshotType: snapshot.snapshotType,
      repoUrl: snapshot.repoUrl,
      cloneUrl: snapshot.cloneUrl,
      branchRef: snapshot.branchRef,
      prRef: snapshot.prRef,
      prNumber: snapshot.prNumber,
      commitSha: snapshot.commitSha,
      treeCid: snapshot.treeCid,
      refCertificateCid: snapshot.refCertificateCid,
      createdAt: snapshot.createdAt,
    })),
    verificationResults: (workspace.verificationResults || []).map((result: any) => ({
      id: result.id,
      status: result.status,
      failureReasons: parseJsonArray(result.failureReasons),
      checks: parseJsonArray(result.checks),
      deliverablePaths: parseJsonArray(result.deliverablePaths),
      verifiedAt: result.verifiedAt,
    })),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  });
}

function normalizeAgentJobHistory(job: any) {
  return {
    ...job,
    workspace: normalizeAgentWorkspace(job.workspace),
    paymentLedger: job.paymentLedger || [],
  };
}

const agentJobHistorySelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  budgetAmount: true,
  budgetToken: true,
  settlementRail: true,
  settlementStatus: true,
  network: true,
  chainId: true,
  createdAt: true,
  acceptedAt: true,
  completedByEvaluatorAt: true,
  workspace: {
    select: {
      id: true,
      provider: true,
      status: true,
      repoUrl: true,
      repoOwner: true,
      repoName: true,
      nodeUrl: true,
      repoDid: true,
      cloneUrl: true,
      branchRef: true,
      prRef: true,
      prNumber: true,
      commitSha: true,
      treeCid: true,
      refCertificateCid: true,
      capabilitySummary: true,
      latestVerificationStatus: true,
      createdAt: true,
      updatedAt: true,
      verificationResults: {
        select: { id: true, status: true, failureReasons: true, checks: true, deliverablePaths: true, verifiedAt: true },
        orderBy: { verifiedAt: 'desc' as const },
        take: 3,
      },
      evidenceSnapshots: {
        select: {
          id: true,
          evidenceHash: true,
          snapshotType: true,
          repoUrl: true,
          cloneUrl: true,
          branchRef: true,
          prRef: true,
          prNumber: true,
          commitSha: true,
          treeCid: true,
          refCertificateCid: true,
          evidence: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' as const },
        take: 5,
      },
    },
  },
  paymentLedger: {
    select: {
      id: true,
      rail: true,
      mode: true,
      amount: true,
      token: true,
      tokenSymbol: true,
      endpoint: true,
      escrowAddress: true,
      txHash: true,
      receiptHash: true,
      chainId: true,
      network: true,
      status: true,
      redactedReference: true,
      redactedReferenceHash: true,
      redactedReferenceType: true,
      redactedPaymentReference: true,
      createdAt: true,
      settledAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 5,
  },
} satisfies Prisma.JobSelect;

function redactAgentForPublic(agent: unknown) {
  const parsed = parseJsonArrays(agent as any) as any;
  const modelDetailsRedacted = parsed.modelDisclosureMode === 'private';
  const configDetailsRedacted = parsed.configDisclosureMode !== 'public';
  if (modelDetailsRedacted) {
    parsed.models = [];
  }
  return {
    ...parsed,
    modelDetailsRedacted,
    configDetailsRedacted,
  };
}

// ─── List Agents ─────────────────────────────────────────────────

router.get('/', validate(paginationSchema, 'query'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = (req as any).validatedQuery;
  const { capability, search, sortBy } = req.query;

  const where: Prisma.AgentWhereInput = { active: true };

  if (capability && typeof capability === 'string') {
    where.capabilities = { contains: capability };
  }

  if (search && typeof search === 'string') {
    where.OR = [
      { name: { contains: search, } },
      { description: { contains: search, } },
    ];
  }

  let orderBy: Prisma.AgentOrderByWithRelationInput = { createdAt: 'desc' };
  if (sortBy === 'rating') orderBy = { avgRating: 'desc' };
  if (sortBy === 'trustScore') orderBy = { trustScore: 'desc' };
  if (sortBy === 'name') orderBy = { name: 'asc' };

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: {
        handler: { select: { id: true, displayName: true } },
        _count: { select: { acceptedJobs: true, ratings: true } },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.agent.count({ where }),
  ]);

  res.json({ agents: parseJsonArraysList(agents).map(redactAgentForPublic), total, page, limit, pages: Math.ceil(total / limit) });
});

// ─── Get Agent Detail ────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({
    where: { id: paramId(req) },
    include: {
      handler: { select: { id: true, displayName: true } },
      acceptedJobs: {
        where: { status: { in: AGENT_JOB_HISTORY_STATUSES } },
        select: agentJobHistorySelect,
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      ratings: {
        select: { score: true, comment: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: { select: { acceptedJobs: true, ratings: true } },
    },
  });

  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(redactAgentForPublic({
    ...agent,
    acceptedJobs: agent.acceptedJobs.map(normalizeAgentJobHistory),
  }));
});

// ─── Register Agent ──────────────────────────────────────────────

router.post('/', requireAuth, requireConsent, validate(registerAgentSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const data = req.body;
  const walletAddress = data.agentWallet || req.auth!.walletAddress;

  // Enforce: 1 agent per handler wallet
  const handlerAgent = await prisma.agent.findFirst({ where: { handlerId: req.auth!.userId } });
  if (handlerAgent) { res.status(409).json({ error: 'You already have a registered agent. Each wallet is limited to one agent.' }); return; }

  // Check agent wallet not already registered
  const existing = await prisma.agent.findUnique({ where: { walletAddress: walletAddress.toLowerCase() } });
  if (existing) { res.status(409).json({ error: 'Agent wallet already registered' }); return; }

  // Compute on-chain agentId (keccak256 of wallet)
  const { ethers } = await import('ethers');
  const agentId = ethers.keccak256(ethers.solidityPacked(['address'], [walletAddress.toLowerCase()]));

  const agent = await prisma.agent.create({
    data: {
      agentId,
      walletAddress: walletAddress.toLowerCase(),
      handlerId: req.auth!.userId,
      name: data.name,
      description: data.description,
      capabilities: Array.isArray(data.capabilities) ? JSON.stringify(data.capabilities) : data.capabilities,
      models: Array.isArray(data.models) ? JSON.stringify(data.models) : data.models,
      metadataURI: data.metadataURI,
      avatarUrl: data.avatarUrl,
      availability: data.availability,
      responseTime: data.responseTime,
      paymentPrivacyMode: data.paymentPrivacyMode,
      configDisclosureMode: data.configDisclosureMode,
      modelDisclosureMode: data.modelDisclosureMode,
      apiCallDisclosureMode: data.apiCallDisclosureMode,
      publicConfigSummary: data.publicConfigSummary,
      x402EndpointUrl: data.x402EndpointUrl,
      px402Supported: data.px402Supported,
      probePriceUsd: data.probePriceUsd,
      probeDescription: data.probeDescription,
      probeMethod: data.probeMethod,
      probeSchemaHash: data.probeSchemaHash,
    },
    include: {
      handler: { select: { id: true, displayName: true } },
    },
  });

  // Ensure user has HANDLER role
  await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { role: 'HANDLER' },
  });

  auditLog(req.auth!.walletAddress, 'AGENT_REGISTERED', 'AGENT', agent.id, { name: agent.name });
  res.status(201).json(agent);
});

// ─── Update Agent ────────────────────────────────────────────────

router.put('/:id', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  const {
    name,
    description,
    capabilities,
    models,
    metadataURI,
    avatarUrl,
    availability,
    responseTime,
    autonomousAccept,
    active,
    paymentPrivacyMode,
    configDisclosureMode,
    modelDisclosureMode,
    apiCallDisclosureMode,
    publicConfigSummary,
    x402EndpointUrl,
    px402Supported,
    probePriceUsd,
    probeDescription,
    probeMethod,
    probeSchemaHash,
  } = req.body;

  const updated = await prisma.agent.update({
    where: { id: paramId(req) },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(capabilities !== undefined && { capabilities: Array.isArray(capabilities) ? JSON.stringify(capabilities) : capabilities }),
      ...(models !== undefined && { models: Array.isArray(models) ? JSON.stringify(models) : models }),
      ...(metadataURI !== undefined && { metadataURI }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(availability !== undefined && { availability }),
      ...(responseTime !== undefined && { responseTime }),
      ...(autonomousAccept !== undefined && { autonomousAccept }),
      ...(active !== undefined && { active }),
      ...(paymentPrivacyMode !== undefined && { paymentPrivacyMode }),
      ...(configDisclosureMode !== undefined && { configDisclosureMode }),
      ...(modelDisclosureMode !== undefined && { modelDisclosureMode }),
      ...(apiCallDisclosureMode !== undefined && { apiCallDisclosureMode }),
      ...(publicConfigSummary !== undefined && { publicConfigSummary }),
      ...(x402EndpointUrl !== undefined && { x402EndpointUrl }),
      ...(px402Supported !== undefined && { px402Supported }),
      ...(probePriceUsd !== undefined && { probePriceUsd }),
      ...(probeDescription !== undefined && { probeDescription }),
      ...(probeMethod !== undefined && { probeMethod }),
      ...(probeSchemaHash !== undefined && { probeSchemaHash }),
    },
  });

  res.json(updated);
});

// ─── Delete Agent ───────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  // Prevent deletion if agent has active jobs
  const activeJobs = await prisma.job.count({
    where: { agentId: agent.id, status: { in: ['IN_PROGRESS', 'PENDING_REVIEW', 'DISPUTED'] } },
  });
  if (activeJobs > 0) {
    res.status(409).json({ error: `Cannot delete agent with ${activeJobs} active job(s). Complete or cancel them first.` });
    return;
  }

  // Delete related records then agent
  await prisma.$transaction([
    prisma.agentActionLog.deleteMany({ where: { agentId: agent.id } }),
    prisma.agentApiKey.deleteMany({ where: { agentId: agent.id } }),
    prisma.bid.deleteMany({ where: { agentId: agent.id } }),
    prisma.rating.deleteMany({ where: { agentId: agent.id } }),
    prisma.agent.delete({ where: { id: agent.id } }),
  ]);

  auditLog(req.auth!.walletAddress, 'AGENT_DELETED', 'AGENT', agent.id, { name: agent.name });
  res.json({ success: true, message: 'Agent deleted' });
});

// ─── Agent Job History ───────────────────────────────────────────

router.get('/:id/jobs', validate(paginationSchema, 'query'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = (req as any).validatedQuery;

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where: { agentId: paramId(req), status: { in: AGENT_JOB_HISTORY_STATUSES } },
      select: agentJobHistorySelect,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where: { agentId: paramId(req), status: { in: AGENT_JOB_HISTORY_STATUSES } } }),
  ]);

  res.json({ jobs: jobs.map(normalizeAgentJobHistory), total, page, limit, pages: Math.ceil(total / limit) });
});

// ─── Generate API Key ────────────────────────────────────────

router.post('/:id/api-keys', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  const { label } = req.body;
  if (!label || typeof label !== 'string') { res.status(400).json({ error: 'label is required' }); return; }

  // Generate a cryptographically secure random key
  const secretKey = crypto.randomBytes(32).toString('hex');
  const keyHash = await bcrypt.hash(secretKey, 10);

  const apiKeyRecord = await prisma.agentApiKey.create({
    data: {
      agentId: agent.id,
      keyHash,
      label,
    },
  });

  // Return the full API key only once — it cannot be recovered
  const fullApiKey = `${agent.id}:${secretKey}`;

  res.status(201).json({
    id: apiKeyRecord.id,
    label: apiKeyRecord.label,
    apiKey: fullApiKey,
    createdAt: apiKeyRecord.createdAt,
    warning: 'Store this API key securely. It will not be shown again.',
  });
});

// ─── Revoke API Key ──────────────────────────────────────────

router.delete('/:id/api-keys/:keyId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  const keyId = typeof req.params.keyId === 'string' ? req.params.keyId : (req.params.keyId as string[])[0];

  const key = await prisma.agentApiKey.findUnique({ where: { id: keyId } });
  if (!key || key.agentId !== agent.id) { res.status(404).json({ error: 'API key not found' }); return; }

  await prisma.agentApiKey.update({ where: { id: keyId }, data: { active: false } });
  res.json({ success: true, message: 'API key revoked' });
});

// ─── List API Keys (metadata only) ──────────────────────────

router.get('/:id/api-keys', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  const keys = await prisma.agentApiKey.findMany({
    where: { agentId: agent.id },
    select: { id: true, label: true, active: true, lastUsed: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  res.json(keys);
});

// ─── Agent Action Log (XAI audit trail) ─────────────────────────

router.get('/:id/action-log', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  if (agent.handlerId !== req.auth!.userId) { res.status(403).json({ error: 'Not the handler' }); return; }

  const limitParam = req.query.limit;
  const limit = Math.min(Math.max(parseInt(typeof limitParam === 'string' ? limitParam : '50', 10) || 50, 1), 200);

  const actionTypeFilter = req.query.actionType;
  const where: any = { agentId: agent.id };
  if (actionTypeFilter && typeof actionTypeFilter === 'string') {
    where.actionType = actionTypeFilter;
  }

  const logs = await prisma.agentActionLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  res.json({ logs, count: logs.length, agentId: agent.id });
});

// ─── Agent Earnings ──────────────────────────────────────────────

router.get('/:id/earnings', async (req: AuthRequest, res: Response): Promise<void> => {
  const agent = await prisma.agent.findUnique({ where: { id: paramId(req) } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const completedJobs = await prisma.job.findMany({
    where: { agentId: paramId(req), status: 'COMPLETED' },
    select: { budgetAmount: true, budgetToken: true, createdAt: true },
  });

  const totalUSDC = completedJobs
    .filter(j => j.budgetToken === 'USDC')
    .reduce((sum, j) => sum + j.budgetAmount, 0);

  const totalMON = completedJobs
    .filter(j => j.budgetToken === 'MON')
    .reduce((sum, j) => sum + j.budgetAmount, 0);

  const totalETH = completedJobs
    .filter(j => j.budgetToken === 'ETH')
    .reduce((sum, j) => sum + j.budgetAmount, 0);

  res.json({
    totalJobs: completedJobs.length,
    earnings: { USDC: totalUSDC * NET_MULTIPLIER, MON: totalMON * NET_MULTIPLIER, ETH: totalETH * NET_MULTIPLIER },
    platformFeeBps: PLATFORM_FEE_BPS,
    gross: { USDC: totalUSDC, MON: totalMON, ETH: totalETH },
  });
});

export default router;
