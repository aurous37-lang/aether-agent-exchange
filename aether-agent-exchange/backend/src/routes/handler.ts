import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { parseJsonArraysList } from '../utils/sqlite-compat';
import { sanitizeWorkspacePayload } from '../services/workspaces';

const router = Router();

const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || '170', 10);
const NET_MULTIPLIER = (10000 - PLATFORM_FEE_BPS) / 10000;

function workspaceSummary(workspace: any) {
  if (!workspace) return null;
  const latestVerification = workspace.verificationResults?.[0];
  const latestSnapshot = workspace.evidenceSnapshots?.[0];
  const signedEvent = workspace.events?.some((event: any) => event.signatureVerified && event.replayProtected);
  const repoUrl = workspace.provider === 'github' && !workspace.liveMode ? undefined : workspace.repoUrl;
  const cloneUrl = workspace.provider === 'gitlawb' && !workspace.liveMode ? undefined : workspace.cloneUrl;

  return sanitizeWorkspacePayload({
    id: workspace.id,
    provider: workspace.provider,
    status: workspace.status,
    verificationStatus: workspace.latestVerificationStatus,
    verificationState: workspace.latestVerificationStatus,
    verificationSummary: latestVerification?.status || workspace.capabilitySummary,
    repoUrl,
    repositoryUrl: repoUrl,
    repoDid: workspace.repoDid,
    cloneUrl,
    gitlawbCloneUrl: cloneUrl,
    nodeUrl: workspace.nodeUrl,
    branch: workspace.branchRef,
    branchRef: workspace.branchRef,
    pullRequestRef: workspace.prRef,
    prRef: workspace.prRef,
    pullRequestNumber: workspace.prNumber,
    prNumber: workspace.prNumber,
    commitSha: workspace.commitSha,
    commitHash: workspace.commitSha,
    treeCid: workspace.treeCid,
    refCertificateCid: workspace.refCertificateCid,
    finalSnapshotRef: latestSnapshot?.evidenceHash,
    signedEvidencePresent: Boolean(signedEvent),
    readiness: {
      credentialsReady: workspace.credentialsReady,
      delegationReady: workspace.delegationReady,
      nodeReady: workspace.nodeReady,
      webhookReady: workspace.webhookReady,
      verificationReady: workspace.verificationReady,
    },
    provisioning: {
      attempts: workspace.provisioningAttempts,
      lastError: workspace.lastProvisioningError,
      liveMode: workspace.liveMode,
    },
    verificationResults: workspace.verificationResults || [],
    evidenceSnapshots: workspace.evidenceSnapshots || [],
    events: workspace.events || [],
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  });
}

function notificationDedupeKey(notification: any): string {
  if (notification.type !== 'WORKSPACE_CREATED') return notification.id;
  try {
    const data = typeof notification.data === 'string' ? JSON.parse(notification.data) : notification.data;
    if (data?.jobId && data?.workspaceId) return `WORKSPACE_CREATED:${data.jobId}:${data.workspaceId}`;
    if (data?.jobId && data?.provider) return `WORKSPACE_CREATED:${data.jobId}:${data.provider}`;
  } catch {
    // Fall through to message-level de-dupe.
  }
  return `WORKSPACE_CREATED:${notification.message}`;
}

function dedupeNotifications(notifications: any[]) {
  const seen = new Set<string>();
  return notifications.filter(notification => {
    const key = notificationDedupeKey(notification);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── List Handler's Agents ───────────────────────────────────────

router.get('/agents', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agents = await prisma.agent.findMany({
    where: { handlerId: req.auth!.userId },
    include: {
      _count: { select: { acceptedJobs: true, ratings: true } },
      acceptedJobs: {
        where: { status: { in: ['IN_PROGRESS', 'PENDING_REVIEW'] } },
        select: { id: true, title: true, status: true, budgetAmount: true, deadline: true },
      },
    },
  });

  res.json(agents);
});

// ─── Dashboard Summary ──────────────────────────────────────────

router.get('/dashboard', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const agents = await prisma.agent.findMany({
    where: { handlerId: req.auth!.userId },
    select: { id: true },
  });
  const agentIds = agents.map(a => a.id);

  const [activeJobs, completedJobs, pendingReview, disputedJobs, totalEarnings, postedJobs, serviceOffers, recentNotifications] =
    await Promise.all([
      prisma.job.count({ where: { agentId: { in: agentIds }, status: 'IN_PROGRESS' } }),
      prisma.job.count({ where: { agentId: { in: agentIds }, status: 'COMPLETED' } }),
      prisma.job.count({ where: { agentId: { in: agentIds }, status: 'PENDING_REVIEW' } }),
      prisma.job.count({ where: { agentId: { in: agentIds }, status: 'DISPUTED' } }),
      prisma.job.aggregate({
        where: { agentId: { in: agentIds }, status: 'COMPLETED' },
        _sum: { budgetAmount: true },
      }),
      prisma.job.findMany({
        where: { clientId: req.auth!.userId },
        include: {
          agent: { select: { id: true, name: true, avatarUrl: true } },
          bids: {
            where: { selected: true },
            include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
            take: 1,
          },
          workspace: {
            include: {
              events: { orderBy: { ingestedAt: 'desc' }, take: 5 },
              verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 3 },
              evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 3 },
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
              escrowAddress: true,
              escrowContractVersion: true,
              txHash: true,
              receiptHash: true,
              chainId: true,
              network: true,
              status: true,
              createdAt: true,
              settledAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
          _count: { select: { bids: true, submissions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.serviceOffer.findMany({
        where: { agentId: { in: agentIds }, status: { not: 'ARCHIVED' } },
        include: {
          agent: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.notification.findMany({
        where: { userId: req.auth!.userId, read: false },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

  const postedJobPayload = parseJsonArraysList(postedJobs).map((job: any) => ({
    ...job,
    selectedBid: job.bids?.[0] || null,
    workspace: workspaceSummary(job.workspace),
    bids: undefined,
  }));

  res.json({
    agents: agents.length,
    activeJobs,
    completedJobs,
    pendingReview,
    disputedJobs,
    totalEarnings: (totalEarnings._sum.budgetAmount || 0) * NET_MULTIPLIER,
    postedJobs: postedJobPayload,
    serviceOffers: parseJsonArraysList(serviceOffers),
    notifications: dedupeNotifications(recentNotifications),
  });
});

// ─── Notifications ──────────────────────────────────────────────

router.get('/notifications', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(notifications);
});

router.put('/notifications/read', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids array required' }); return; }

  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: req.auth!.userId },
    data: { read: true },
  });

  res.json({ success: true });
});

export default router;
