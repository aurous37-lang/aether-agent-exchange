import crypto from 'crypto';
import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { requireConsent } from '../middleware/consent';
import { validate } from '../middleware/validate';
import { paramId } from '../utils/params';
import {
  createOrLinkWorkspaceSchema,
  ingestWorkspaceEventSchema,
  snapshotWorkspaceEvidenceSchema,
  verifyWorkspaceSubmissionSchema,
} from '../utils/validation';
import {
  createOrLinkWorkspace,
  ingestWorkspaceEvent,
  reconcileWorkspace,
  revokeWorkspaceAccess,
  rotateWorkspaceAccess,
  sanitizeWorkspacePayload,
  snapshotWorkspaceEvidence,
  verifyWorkspaceSubmission,
} from '../services/workspaces';
import { getGitLawbWebhookSecret, getWorkspaceProviderProfiles } from '../services/workspaces/adapters';
import { wsService } from '../services/websocket';

const router = Router();

type WorkspaceProvider = 'github' | 'gitlawb';

function parseJsonArray(value: unknown): unknown[] {
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

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function normalizeCreateBody(body: any, fallbackProvider?: string) {
  const provider = (body.provider || fallbackProvider || 'github') as WorkspaceProvider;
  const repository = body.repository || {};
  const pullRequest = body.pullRequest || {};
  const providerIdentity = typeof body.providerIdentity === 'string'
    ? body.providerIdentity
    : firstString(body.providerIdentity?.login, body.providerIdentity?.id, body.providerIdentity?.did);
  const delegation = body.delegation || {};
  const branchRef = firstString(body.branchRef, body.branch, repository.workingBranch, repository.branch);

  return {
    provider,
    mode: body.mode === 'create' || body.mode === 'created' ? 'create' : 'link',
    idempotencyKey: firstString(body.idempotencyKey, body.provisioningIdempotencyKey),
    repoUrl: firstString(body.repoUrl, repository.url, provider === 'gitlawb' ? body.cloneUrl : undefined),
    repoOwner: firstString(body.repoOwner, repository.owner),
    repoName: firstString(body.repoName, repository.name),
    providerIdentity,
    nodeUrl: firstString(body.nodeUrl),
    repoDid: firstString(body.repoDid),
    cloneUrl: firstString(body.cloneUrl, provider === 'gitlawb' ? body.repoUrl : undefined),
    defaultBranch: firstString(body.defaultBranch, repository.defaultBranch, pullRequest.targetBranch),
    branchRef,
    prRef: firstString(body.prRef, pullRequest.ref),
    prNumber: body.prNumber || pullRequest.number,
    commitSha: firstString(body.commitSha),
    treeCid: firstString(body.treeCid),
    refCertificateCid: firstString(body.refCertificateCid),
    actorDids: [
      ...parseJsonArray(body.actorDids).filter((item): item is string => typeof item === 'string'),
      ...[body.actorDid].filter((item): item is string => typeof item === 'string'),
    ],
    ucanDelegationRefs: [
      ...parseJsonArray(body.ucanDelegationRefs),
      ...(delegation.reference ? [{
        ref: delegation.reference,
        audienceDid: delegation.audienceDid,
        scope: [
          '*',
          ...(Array.isArray(delegation.capabilities) ? delegation.capabilities : []),
          ...(branchRef ? [`branch:${branchRef}`, `push:${branchRef}`] : []),
        ],
        expiresAt: delegation.expiresAt,
      }] : []),
    ],
    capabilitySummary: firstString(body.capabilitySummary),
    participants: Array.isArray(body.participants) ? body.participants : [],
  };
}

function normalizeEventBody(body: any, security: Record<string, unknown> = {}) {
  const payload = body.payload || {};
  const pullRequest = payload.pullRequest || payload.pull_request || {};
  const repository = payload.repository || {};
  const branchRef = firstString(body.branchRef, body.branch, payload.branchRef, payload.branch, payload.ref, repository.workingBranch);

  return {
    eventType: body.eventType,
    providerEventId: firstString(body.providerEventId, body.eventId, body.deliveryId),
    deliverySignature: firstString(body.deliverySignature),
    deliverySignatureHash: firstString(body.deliverySignatureHash),
    deliveryTimestamp: firstString(body.deliveryTimestamp, body.occurredAt),
    replayWindowSeconds: body.replayWindowSeconds,
    signatureVerified: body.signatureVerified,
    replayProtected: body.replayProtected,
    actor: firstString(body.actor, payload.actor?.login, payload.sender?.login),
    actorDid: firstString(body.actorDid, payload.actorDid, payload.signerDid),
    actorProviderId: firstString(body.actorProviderId, payload.actor?.id, payload.sender?.id),
    branchRef,
    prRef: firstString(body.prRef, payload.prRef, pullRequest.ref),
    prNumber: body.prNumber || payload.prNumber || payload.pullRequestNumber || pullRequest.number,
    commitSha: firstString(body.commitSha, payload.commitSha, payload.commitHash, payload.after, payload.commits?.[0]?.sha),
    treeCid: firstString(body.treeCid, payload.treeCid),
    refCertificateCid: firstString(body.refCertificateCid, payload.refCertificateCid),
    payload,
    normalizedData: {
      action: body.action || payload.action,
      repository,
      pullRequest,
      targetBranch: firstString(body.targetBranch, payload.targetBranch, pullRequest.targetBranch, pullRequest.base?.ref),
      reviewStatus: firstString(payload.reviewStatus, payload.review?.state, payload.state),
      ciStatus: firstString(payload.ciStatus, payload.conclusion, payload.status),
      merged: Boolean(body.merged || payload.merged || pullRequest.merged),
      security,
    },
  };
}

function normalizeVerificationBody(body: any) {
  const submission = typeof body.submissionRef === 'object' ? body.submissionRef : {};
  const verification = body.verification || {};

  return {
    submissionRef: typeof body.submissionRef === 'string'
      ? body.submissionRef
      : firstString(submission.prRef, submission.branchRef, submission.commitSha, submission.commitHash, body.prRef, body.commitSha) || 'workspace-submission',
    branchRef: firstString(body.branchRef, submission.branchRef),
    prRef: firstString(body.prRef, submission.prRef),
    prNumber: body.prNumber || submission.prNumber,
    commitSha: firstString(body.commitSha, submission.commitSha, submission.commitHash),
    treeCid: firstString(body.treeCid, submission.treeCid),
    refCertificateCid: firstString(body.refCertificateCid, submission.refCertificateCid),
    signerDid: firstString(body.signerDid, verification.signerDid),
    actorProviderId: firstString(body.actorProviderId, verification.actorProviderId),
    targetBranch: firstString(body.targetBranch, verification.targetBranch, submission.targetBranch),
    repoOwner: firstString(body.repoOwner, verification.repoOwner, submission.repoOwner),
    repoName: firstString(body.repoName, verification.repoName, submission.repoName),
    repoDid: firstString(body.repoDid, verification.repoDid, submission.repoDid),
    nodeUrl: firstString(body.nodeUrl, verification.nodeUrl, submission.nodeUrl),
    deliverablePaths: Array.isArray(body.deliverablePaths)
      ? body.deliverablePaths
      : Array.isArray(submission.deliverablePaths)
        ? submission.deliverablePaths
        : [],
    checks: Array.isArray(body.checks) ? body.checks : [],
    evidence: sanitizeWorkspacePayload({ ...body.evidence, verification }),
  };
}

async function getJobForWorkspace(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    include: { agent: { select: { handlerId: true, walletAddress: true } } },
  });
}

function actor(req: AuthRequest) {
  return { userId: req.auth!.userId, walletAddress: req.auth!.walletAddress };
}

function respondError(res: Response, error: any) {
  res.status(error.statusCode || 400).json({ error: error.message || 'Workspace request failed' });
}

function normalizeWorkspace(workspace: any): Record<string, unknown> | null {
  if (!workspace) return null;
  const latestVerification = workspace.verificationResults?.[0];
  const latestSnapshot = workspace.evidenceSnapshots?.[0];
  const repoUrl = workspace.provider === 'github' && !workspace.liveMode ? undefined : workspace.repoUrl;
  const cloneUrl = workspace.provider === 'gitlawb' && !workspace.liveMode ? undefined : workspace.cloneUrl;
  const actorDids = parseJsonArray(workspace.actorDids).filter((item): item is string => typeof item === 'string');
  const delegationRefs = parseJsonArray(workspace.ucanDelegationRefs).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const normalizedEvents = Array.isArray(workspace.events)
    ? workspace.events.map((event: any) => parseJsonObject(event.normalizedData)).filter(Boolean)
    : [];
  const latestReview = normalizedEvents.find((event: any) => event.reviewStatus)?.reviewStatus;
  const latestCi = normalizedEvents.find((event: any) => event.ciStatus)?.ciStatus;

  return sanitizeWorkspacePayload({
    ...workspace,
    actorDids,
    actorDid: actorDids[0],
    ucanDelegationRefs: delegationRefs,
    ucanDelegationRef: firstString(delegationRefs[0]?.ref, delegationRefs[0]?.id, delegationRefs[0]?.referenceUri),
    repoUrl,
    cloneUrl,
    branch: workspace.branchRef,
    pullRequestRef: workspace.prRef,
    pullRequestNumber: workspace.prNumber,
    repositoryUrl: repoUrl,
    gitlawbCloneUrl: cloneUrl,
    verificationStatus: workspace.latestVerificationStatus,
    verificationState: workspace.latestVerificationStatus,
    verificationSummary: latestVerification
      ? `${latestVerification.status}: ${parseJsonArray(latestVerification.failureReasons).join('; ') || 'workspace evidence recorded'}`
      : workspace.capabilitySummary,
    readiness: {
      credentialsReady: workspace.credentialsReady,
      delegationReady: workspace.delegationReady,
      nodeReady: workspace.nodeReady,
      webhookReady: workspace.webhookReady,
      verificationReady: workspace.verificationReady,
    },
    provisioning: {
      idempotencyKey: workspace.provisioningIdempotencyKey,
      attempts: workspace.provisioningAttempts,
      lastError: workspace.lastProvisioningError,
      liveMode: workspace.liveMode,
    },
    reviewStatus: latestReview || workspace.reviewStatus,
    ciStatus: latestCi || workspace.ciStatus,
    commitHash: workspace.commitSha,
    finalSnapshot: latestSnapshot ? parseJsonObject(latestSnapshot.evidence) : undefined,
    finalSnapshotRef: latestSnapshot?.evidenceHash,
    events: Array.isArray(workspace.events) ? workspace.events.map(normalizeEvent) : [],
  }) as Record<string, unknown>;
}

function jobUrlPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

function workspaceHref(workspace: any): string {
  if (!workspace) return '';
  if (workspace.provider === 'github' && workspace.liveMode && workspace.repoUrl) return workspace.repoUrl;
  if (workspace.provider === 'gitlawb' && workspace.liveMode && workspace.cloneUrl) return workspace.cloneUrl;
  return jobUrlPath(workspace.jobId || '');
}

function normalizeEvent(event: any): Record<string, unknown> {
  return sanitizeWorkspacePayload({
    ...event,
    normalizedData: parseJsonObject(event.normalizedData),
    payload: parseJsonObject(event.payload),
    signatureVerified: event.signatureVerified,
    replayProtected: event.replayProtected,
  }) as Record<string, unknown>;
}

function normalizeVerification(result: any): Record<string, unknown> {
  return sanitizeWorkspacePayload({
    ...result,
    status: result.status === 'PASSED' ? 'VERIFIED' : result.status,
    verificationStatus: result.status === 'PASSED' ? 'VERIFIED' : result.status,
    deliverablePaths: parseJsonArray(result.deliverablePaths),
    checks: parseJsonArray(result.checks),
    failureReasons: parseJsonArray(result.failureReasons),
    evidence: parseJsonObject(result.evidence),
  }) as Record<string, unknown>;
}

async function sendProviderProfiles(_req: any, res: Response) {
  const profiles = await getWorkspaceProviderProfiles();
  res.json({
    providers: profiles.map((profile) => ({
      id: profile.provider,
      ...profile,
    })),
  });
}

function hmacSha256(secret: string, payload: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function timingSafeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(provider: WorkspaceProvider, body: any, signature?: string): { verified: boolean; signatureHash?: string; error?: string } {
  const secret = provider === 'github' ? process.env.GITHUB_WEBHOOK_SECRET : getGitLawbWebhookSecret();
  if (!secret) return { verified: false, error: `${provider} webhook secret is not configured` };
  if (!signature) return { verified: false, error: `${provider} webhook signature is missing` };
  const raw = JSON.stringify(body || {});
  const expected = hmacSha256(secret, raw);
  if (!timingSafeEqualText(signature, expected)) return { verified: false, error: `${provider} webhook signature is invalid` };
  return { verified: true, signatureHash: crypto.createHash('sha256').update(signature).digest('hex') };
}

function githubWebhookBody(body: any, headers: any) {
  return normalizeEventBody({
    providerEventId: firstString(headers['x-github-delivery'], body.deliveryId),
    eventType: firstString(headers['x-github-event'], body.eventType) || 'github.webhook',
    action: body.action,
    payload: body,
  }, { source: 'github-webhook' });
}

function gitlawbWebhookBody(body: any, headers: any) {
  return normalizeEventBody({
    providerEventId: firstString(headers['x-gitlawb-delivery'], body.deliveryId, body.eventId),
    eventType: body.eventType || 'gitlawb.webhook',
    action: body.action,
    payload: body,
    actorDid: body.actorDid || body.signerDid,
    branchRef: body.branchRef,
    prRef: body.prRef,
    commitSha: body.commitSha || body.commitHash,
    treeCid: body.treeCid,
    refCertificateCid: body.refCertificateCid,
  }, { source: 'gitlawb-webhook' });
}

async function findWorkspaceForProviderWebhook(provider: WorkspaceProvider, body: any) {
  if (provider === 'github') {
    const repository = body.repository || {};
    const owner = firstString(repository.owner?.login, repository.owner?.name);
    const name = firstString(repository.name);
    if (owner && name) {
      return prisma.contractWorkspace.findFirst({
        where: { provider, repoOwner: owner, repoName: name },
        include: { job: { include: { agent: { select: { handlerId: true, walletAddress: true } } } } },
      });
    }
  }

  const repoDid = firstString(body.repoDid, body.repository?.repoDid);
  if (repoDid) {
    return prisma.contractWorkspace.findFirst({
      where: { provider, repoDid },
      include: { job: { include: { agent: { select: { handlerId: true, walletAddress: true } } } } },
    });
  }

  const repoName = firstString(body.repoName, body.repository?.name, body.repo, body.repository);
  if (repoName) {
    return prisma.contractWorkspace.findFirst({
      where: {
        provider,
        OR: [
          { providerWorkspaceId: repoName },
          { repoName },
          { repoDid: repoName },
          { cloneUrl: `gitlawb://${repoName}` },
        ],
      },
      include: { job: { include: { agent: { select: { handlerId: true, walletAddress: true } } } } },
    });
  }

  const jobId = firstString(body.jobId);
  if (jobId) {
    return prisma.contractWorkspace.findUnique({
      where: { jobId },
      include: { job: { include: { agent: { select: { handlerId: true, walletAddress: true } } } } },
    });
  }

  return null;
}

router.get('/providers', sendProviderProfiles);
router.get('/workspaces/providers', sendProviderProfiles);

router.post('/workspaces/webhooks/:provider', async (req: AuthRequest, res: Response): Promise<void> => {
  const provider = req.params.provider as WorkspaceProvider;
  if (provider !== 'github' && provider !== 'gitlawb') {
    res.status(400).json({ error: 'Unsupported workspace provider' });
    return;
  }

  const signature = provider === 'github'
    ? firstString(req.headers['x-hub-signature-256'])
    : firstString(req.headers['x-gitlawb-signature-256'], req.headers['x-gitlawb-signature']);
  const verified = verifyWebhookSignature(provider, req.body, signature);
  if (!verified.verified) {
    res.status(401).json({ error: verified.error });
    return;
  }

  const workspace = await findWorkspaceForProviderWebhook(provider, req.body);
  if (!workspace?.job) {
    res.status(404).json({ error: 'Workspace not found for webhook payload' });
    return;
  }

  const normalized = provider === 'github'
    ? githubWebhookBody(req.body, req.headers)
    : gitlawbWebhookBody(req.body, req.headers);
  normalized.deliverySignatureHash = verified.signatureHash;
  normalized.deliveryTimestamp = new Date().toISOString();
  normalized.replayWindowSeconds = 300;
  normalized.signatureVerified = true;
  normalized.replayProtected = true;

  const parsed = ingestWorkspaceEventSchema.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid workspace webhook event' });
    return;
  }

  try {
    const { event, idempotent } = await ingestWorkspaceEvent(
      workspace.job as any,
      { userId: 'system:webhook', walletAddress: 'SYSTEM' },
      parsed.data,
      { trustedProviderWebhook: true },
    );
    res.status(idempotent ? 200 : 202).json({ ...normalizeEvent(event), idempotent, duplicate: idempotent });
  } catch (error: any) {
    respondError(res, error);
  }
});

router.get('/jobs/:id/workspace', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const workspace = await prisma.contractWorkspace.findUnique({
    where: { jobId: paramId(req) },
    include: {
      events: { orderBy: { ingestedAt: 'desc' }, take: 10 },
      verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
      evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!workspace) { res.status(404).json({ error: 'Workspace not found for job' }); return; }
  res.json(normalizeWorkspace(workspace));
});

router.post('/jobs/:id/workspace', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const normalized = normalizeCreateBody(req.body, job.workspaceProvider);
  const parsed = createOrLinkWorkspaceSchema.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid workspace request' });
    return;
  }

  try {
    const existingWorkspace = await prisma.contractWorkspace.findUnique({
      where: { jobId: job.id },
      select: { id: true, status: true },
    });
    const workspace = await createOrLinkWorkspace(job, actor(req), parsed.data);
    const reloaded = await prisma.contractWorkspace.findUnique({
      where: { id: workspace.id },
      include: {
        events: { orderBy: { ingestedAt: 'desc' }, take: 10 },
        verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
        evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    const href = workspaceHref(reloaded);
    const jobHref = jobUrlPath(job.id);
    const shouldNotifyWorkspaceReady = !existingWorkspace || (
      existingWorkspace.status === 'FAILED' &&
      reloaded?.status &&
      reloaded.status !== 'FAILED'
    );
    if (shouldNotifyWorkspaceReady) {
      const notificationUsers = [...new Set([job.clientId, job.agent?.handlerId].filter((id): id is string => Boolean(id)))];
      await Promise.all(notificationUsers.map(userId => prisma.notification.create({
        data: {
          userId,
          type: 'WORKSPACE_CREATED',
          title: 'Workspace created',
          message: `${reloaded?.provider === 'gitlawb' ? 'GitLawb' : 'GitHub'} workspace is ready for "${job.title}".`,
          data: JSON.stringify({ jobId: job.id, workspaceId: reloaded?.id, provider: reloaded?.provider, href, jobHref }),
        },
      })));
      notificationUsers.forEach(userId => wsService.sendToUser(userId, 'notification', {
        type: 'WORKSPACE_CREATED',
        title: 'Workspace created',
        message: `${reloaded?.provider === 'gitlawb' ? 'GitLawb' : 'GitHub'} workspace is ready for "${job.title}".`,
        jobId: job.id,
        workspaceId: reloaded?.id,
        provider: reloaded?.provider,
        href,
        jobHref,
      }));
    }
    res.status(201).json(normalizeWorkspace(reloaded));
  } catch (error: any) {
    respondError(res, error);
  }
});

router.get('/jobs/:id/workspace/events', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const events = await prisma.workspaceEvent.findMany({
    where: { jobId: paramId(req) },
    orderBy: { ingestedAt: 'desc' },
  });
  res.json({ events: events.map(normalizeEvent) });
});

router.post('/jobs/:id/workspace/events', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const normalized = normalizeEventBody(req.body);
  const parsed = ingestWorkspaceEventSchema.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid workspace event' });
    return;
  }

  try {
    const { event, idempotent } = await ingestWorkspaceEvent(job, actor(req), parsed.data);
    res.status(idempotent ? 200 : 201).json({ ...normalizeEvent(event), idempotent, duplicate: idempotent });
  } catch (error: any) {
    respondError(res, error);
  }
});

router.post('/jobs/:id/workspace/reconcile', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  try {
    const workspace = await reconcileWorkspace(job, actor(req), req.body || {});
    const reloaded = await prisma.contractWorkspace.findUnique({
      where: { id: workspace.id },
      include: {
        events: { orderBy: { ingestedAt: 'desc' }, take: 10 },
        verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
        evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    res.json(normalizeWorkspace(reloaded));
  } catch (error: any) {
    respondError(res, error);
  }
});

router.post('/jobs/:id/workspace/access/rotate', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  try {
    const workspace = await rotateWorkspaceAccess(job, actor(req), req.body || {});
    res.json(normalizeWorkspace({ ...workspace, events: [], verificationResults: [], evidenceSnapshots: [] }));
  } catch (error: any) {
    respondError(res, error);
  }
});

router.post('/jobs/:id/workspace/access/revoke', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  try {
    const workspace = await revokeWorkspaceAccess(job, actor(req), req.body || {});
    res.json(normalizeWorkspace({ ...workspace, events: [], verificationResults: [], evidenceSnapshots: [] }));
  } catch (error: any) {
    respondError(res, error);
  }
});

router.post('/jobs/:id/workspace/verify-submission', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const normalized = normalizeVerificationBody(req.body);
  const parsed = verifyWorkspaceSubmissionSchema.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid workspace verification' });
    return;
  }

  try {
    const result = await verifyWorkspaceSubmission(job, actor(req), parsed.data);
    const normalizedResult = normalizeVerification(result);
    const failed = normalizedResult.status === 'FAILED';
    res.status(failed ? 422 : 201).json(normalizedResult);
  } catch (error: any) {
    respondError(res, error);
  }
});

router.get('/jobs/:id/workspace/evidence-snapshot', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const workspace = await prisma.contractWorkspace.findUnique({
    where: { jobId: paramId(req) },
    include: {
      events: { orderBy: { ingestedAt: 'desc' }, take: 25 },
      verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
      evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
  if (!workspace) { res.status(404).json({ error: 'Workspace not found for job' }); return; }
  res.json(normalizeWorkspace(workspace));
});

router.post('/jobs/:id/workspace/evidence-snapshot', requireAuth, requireConsent, validate(snapshotWorkspaceEvidenceSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await getJobForWorkspace(paramId(req));
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  try {
    const snapshot = await snapshotWorkspaceEvidence(job, actor(req), req.body);
    res.status(201).json(sanitizeWorkspacePayload({
      ...snapshot,
      evidence: parseJsonObject(snapshot.evidence),
    }));
  } catch (error: any) {
    respondError(res, error);
  }
});

export default router;
