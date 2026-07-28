import crypto from 'crypto';
import prisma from '../lib/prisma';
import { auditLog } from './audit';
import { provisionWorkspaceWithAdapter } from './workspaces/adapters';

const DEFAULT_GITLAWB_PUBLIC_NODE_URL = process.env.GITLAWB_PUBLIC_NODE_URL || 'https://node.gitlawb.com';
const WORKSPACE_ALLOWED_STATUSES = new Set(['FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW', 'DISPUTED']);
const WORKSPACE_LIFECYCLE_STATUSES = new Set(['PROVISIONING', 'READY', 'SUBMITTED', 'VERIFIED', 'DISPUTED', 'ARCHIVED', 'FAILED']);
const SUCCESS_CHECK_STATUSES = new Set(['passed', 'success', 'neutral', 'skipped']);
const FAILING_CHECK_STATUSES = new Set(['failed', 'failure', 'cancelled', 'timed_out', 'action_required']);

const SENSITIVE_KEY_PATTERNS = [
  /private.*key/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /payment.*header/i,
  /x-payment/i,
  /prxvt/i,
  /note.*material/i,
  /raw.*ucan/i,
  /ucan.*secret/i,
  /signature/i,
];

type AuthActor = {
  userId: string;
  walletAddress: string;
};

type JobWithAgent = {
  id: string;
  status: string;
  clientId: string;
  agentId: string | null;
  acceptedAt: Date | null;
  title: string;
  agent?: {
    handlerId: string;
    walletAddress: string;
  } | null;
};

function stringify(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function parseArray(value: unknown): any[] {
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

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isSensitiveKey(key: string): boolean {
  if (['signatureVerified', 'replayProtected'].includes(key)) return false;
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

export function sanitizeWorkspacePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeWorkspacePayload);
  if (typeof value === 'string' && /(X-PAYMENT|Bearer\s+|raw-(x-payment|prxvt|ucan|wallet|private)|should-not-persist)/i.test(value)) {
    return '[REDACTED]';
  }
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) continue;
    output[key] = sanitizeWorkspacePayload(entry);
  }
  return output;
}

function hashEvidence(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashString(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function workspaceProvisioningKey(jobId: string, provider: string, explicit?: string): string {
  return explicit || `job:${jobId}:workspace:${provider}`;
}

function normalizeProvider(provider: string): 'github' | 'gitlawb' {
  if (provider !== 'github' && provider !== 'gitlawb') {
    throw Object.assign(new Error('Unsupported workspace provider'), { statusCode: 400 });
  }
  return provider;
}

function githubRepoUrl(input: any, job: JobWithAgent): string | undefined {
  if (input.repoUrl) return input.repoUrl;
  const owner = input.repoOwner || input.providerIdentity || 'aae-local';
  const repo = input.repoName || `aae-job-${job.id.slice(0, 8)}`;
  return `https://github.com/${owner}/${repo}`;
}

function nonPlaceholderGitHubOwner(owner?: string | null): string | undefined {
  return owner && owner !== 'aae-local' ? owner : undefined;
}

function gitlawbCloneUrl(input: any, job: JobWithAgent): string {
  return input.cloneUrl || input.repoUrl || `gitlawb://${input.repoDid || `repo:aae:${job.id}`}`;
}

function normalizeLifecycleStatus(value?: string): string {
  const status = (value || 'READY').toUpperCase();
  return WORKSPACE_LIFECYCLE_STATUSES.has(status) ? status : 'READY';
}

export function assertWorkspaceStartable(job: JobWithAgent): void {
  if (!job.acceptedAt || !job.agentId || !WORKSPACE_ALLOWED_STATUSES.has(job.status)) {
    throw Object.assign(new Error('Workspace can only be bound after the job is accepted'), { statusCode: 400 });
  }
}

export function assertClient(job: JobWithAgent, actor: AuthActor): void {
  if (job.clientId !== actor.userId) {
    throw Object.assign(new Error('Only the job client can perform this workspace action'), { statusCode: 403 });
  }
}

export function assertParticipant(job: JobWithAgent, actor: AuthActor): void {
  const isClient = job.clientId === actor.userId;
  const isAgentHandler = job.agent?.handlerId === actor.userId;
  const isAgentWallet = job.agent?.walletAddress?.toLowerCase() === actor.walletAddress.toLowerCase();
  if (!isClient && !isAgentHandler && !isAgentWallet) {
    throw Object.assign(new Error('Only job participants can perform this workspace action'), { statusCode: 403 });
  }
}

export async function createOrLinkWorkspace(job: JobWithAgent, actor: AuthActor, input: any) {
  assertWorkspaceStartable(job);
  assertClient(job, actor);

  const provider = normalizeProvider(input.provider);
  const idempotencyKey = workspaceProvisioningKey(job.id, provider, input.idempotencyKey);
  const existing = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (existing) {
    if (existing.provisioningIdempotencyKey === idempotencyKey) {
      if (existing.status === 'FAILED' && input.mode === 'create') {
        const retryRepoOwner = provider === 'github'
          ? (input.repoOwner || input.providerIdentity || nonPlaceholderGitHubOwner(existing.repoOwner))
          : (input.repoOwner || existing.repoOwner);
        const retryRepoName = provider === 'github'
          ? (input.repoName || existing.repoName || `aae-job-${job.id.slice(0, 8)}`)
          : (input.repoName || existing.repoName || undefined);
        const retryDefaultBranch = input.defaultBranch || existing.defaultBranch || 'main';
        const retryBranchRef = input.branchRef || existing.branchRef || `aae/job-${job.id.slice(0, 8)}`;
        const retryRepoUrl = provider === 'github'
          ? (input.repoUrl || (retryRepoOwner && retryRepoName ? `https://github.com/${retryRepoOwner}/${retryRepoName}` : undefined))
          : input.repoUrl;
        const retryCloneUrl = provider === 'gitlawb'
          ? (input.cloneUrl || input.repoUrl || existing.cloneUrl || gitlawbCloneUrl(input, job))
          : (input.cloneUrl || existing.cloneUrl);
        const retryNodeUrl = provider === 'gitlawb'
          ? (input.nodeUrl || existing.nodeUrl || DEFAULT_GITLAWB_PUBLIC_NODE_URL)
          : (input.nodeUrl || existing.nodeUrl);

        const provisioned = await provisionWorkspaceWithAdapter({
          jobId: job.id,
          title: job.title,
          provider,
          mode: 'create',
          repoOwner: retryRepoOwner,
          repoName: retryRepoName,
          repoUrl: retryRepoUrl,
          defaultBranch: retryDefaultBranch,
          branchRef: retryBranchRef,
          prRef: input.prRef || existing.prRef || undefined,
          prNumber: input.prNumber || existing.prNumber || undefined,
          cloneUrl: retryCloneUrl || undefined,
          nodeUrl: retryNodeUrl || undefined,
          repoDid: input.repoDid || existing.repoDid || undefined,
          actorDids: input.actorDids || parseArray(existing.actorDids),
          ucanDelegationRefs: sanitizeWorkspacePayload(input.ucanDelegationRefs || parseArray(existing.ucanDelegationRefs)) as any[],
          providerIdentity: input.providerIdentity || existing.providerIdentity || undefined,
          participants: input.participants || [],
        }).catch((error: any) => ({
          status: 'FAILED' as const,
          liveMode: false,
          providerWorkspaceId: existing.providerWorkspaceId || undefined,
          repoUrl: retryRepoUrl || existing.repoUrl || undefined,
          repoOwner: retryRepoOwner || existing.repoOwner || undefined,
          repoName: retryRepoName || existing.repoName || undefined,
          cloneUrl: retryCloneUrl || undefined,
          nodeUrl: retryNodeUrl || undefined,
          repoDid: input.repoDid || existing.repoDid || undefined,
          defaultBranch: retryDefaultBranch,
          branchRef: retryBranchRef,
          prRef: input.prRef || existing.prRef || undefined,
          prNumber: input.prNumber || existing.prNumber || undefined,
          actorDids: input.actorDids || parseArray(existing.actorDids),
          ucanDelegationRefs: sanitizeWorkspacePayload(input.ucanDelegationRefs || parseArray(existing.ucanDelegationRefs)) as any[],
          capabilitySummary: `Workspace provisioning failed: ${error.message}`,
          readiness: {
            credentialsReady: false,
            delegationReady: false,
            nodeReady: provider === 'github',
            webhookReady: false,
            verificationReady: false,
          },
          warnings: [error.message],
        }));

        const updated = await prisma.contractWorkspace.update({
          where: { id: existing.id },
          data: {
            status: normalizeLifecycleStatus(provisioned.status),
            liveMode: provisioned.liveMode,
            providerWorkspaceId: provisioned.providerWorkspaceId || existing.providerWorkspaceId,
            repoUrl: provisioned.repoUrl || retryRepoUrl || existing.repoUrl,
            repoOwner: provisioned.repoOwner || retryRepoOwner || existing.repoOwner,
            repoName: provisioned.repoName || retryRepoName || existing.repoName,
            providerIdentity: input.providerIdentity || existing.providerIdentity,
            nodeUrl: provisioned.nodeUrl || retryNodeUrl,
            repoDid: provisioned.repoDid || input.repoDid || existing.repoDid,
            cloneUrl: provisioned.cloneUrl || retryCloneUrl,
            defaultBranch: provisioned.defaultBranch || retryDefaultBranch,
            branchRef: provisioned.branchRef || retryBranchRef,
            prRef: provisioned.prRef || input.prRef || existing.prRef,
            prNumber: provisioned.prNumber || input.prNumber || existing.prNumber,
            actorDids: stringify(provisioned.actorDids || input.actorDids || parseArray(existing.actorDids)),
            ucanDelegationRefs: stringify(sanitizeWorkspacePayload(provisioned.ucanDelegationRefs || input.ucanDelegationRefs || parseArray(existing.ucanDelegationRefs))),
            capabilitySummary: input.capabilitySummary || provisioned.capabilitySummary,
            credentialsReady: provisioned.readiness.credentialsReady,
            delegationReady: provisioned.readiness.delegationReady,
            nodeReady: provisioned.readiness.nodeReady,
            webhookReady: provisioned.readiness.webhookReady,
            verificationReady: provisioned.readiness.verificationReady,
            provisioningAttempts: { increment: 1 },
            lastProvisioningError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : null,
            updatedBy: actor.walletAddress,
          },
          include: {
            events: true,
            verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
            evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        });

        await prisma.workspaceProvisioningJob.upsert({
          where: { idempotencyKey },
          update: {
            workspaceId: existing.id,
            status: provisioned.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
            attempts: { increment: 1 },
            lastError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : null,
            lockedAt: null,
            completedAt: new Date(),
          },
          create: {
            workspaceId: existing.id,
            jobId: job.id,
            provider,
            idempotencyKey,
            status: provisioned.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
            attempts: updated.provisioningAttempts,
            lastError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : null,
            completedAt: new Date(),
            createdBy: actor.walletAddress,
          },
        });

        await prisma.workspaceEvent.create({
          data: {
            workspaceId: existing.id,
            jobId: job.id,
            provider,
            eventType: provisioned.status === 'FAILED'
              ? 'workspace.provisioning.retry_failed'
              : 'workspace.provisioning.retry_succeeded',
            actor: actor.walletAddress,
            branchRef: provisioned.branchRef || retryBranchRef,
            prRef: updated.prRef,
            prNumber: updated.prNumber,
            commitSha: updated.commitSha,
            treeCid: updated.treeCid,
            refCertificateCid: updated.refCertificateCid,
            normalizedData: JSON.stringify(sanitizeWorkspacePayload({
              provider,
              mode: 'created',
              retry: true,
              status: updated.status,
              liveMode: provisioned.liveMode,
              repoUrl: provisioned.repoUrl || retryRepoUrl,
              cloneUrl: provisioned.cloneUrl || retryCloneUrl,
              repoDid: provisioned.repoDid || input.repoDid || existing.repoDid,
              readiness: provisioned.readiness,
              warnings: provisioned.warnings,
            })),
            ingestedBy: actor.walletAddress,
          },
        });

        auditLog(actor.walletAddress, provisioned.status === 'FAILED' ? 'WORKSPACE_REPROVISION_FAILED' : 'WORKSPACE_REPROVISIONED', 'JOB', job.id, {
          provider,
          workspaceId: existing.id,
          liveMode: provisioned.liveMode,
          status: updated.status,
        });

        return updated;
      }

      await prisma.workspaceProvisioningJob.upsert({
        where: { idempotencyKey },
        update: { workspaceId: existing.id },
        create: {
          workspaceId: existing.id,
          jobId: job.id,
          provider,
          idempotencyKey,
          status: existing.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
          attempts: existing.provisioningAttempts,
          createdBy: actor.walletAddress,
        },
      });
      return existing;
    }
    throw Object.assign(new Error('Job already has a bound workspace'), { statusCode: 409 });
  }

  const mode = input.mode === 'create' ? 'created' : 'linked';
  const repoUrl = provider === 'github' ? githubRepoUrl(input, job) : undefined;
  const cloneUrl = provider === 'gitlawb' ? gitlawbCloneUrl(input, job) : input.cloneUrl;
  const repoOwner = provider === 'github' ? (input.repoOwner || input.providerIdentity || 'aae-local') : input.repoOwner;
  const repoName = provider === 'github' ? (input.repoName || `aae-job-${job.id.slice(0, 8)}`) : input.repoName;
  const defaultBranch = input.defaultBranch || 'main';
  const branchRef = input.branchRef || `aae/job-${job.id.slice(0, 8)}`;
  const nodeUrl = provider === 'gitlawb' ? (input.nodeUrl || DEFAULT_GITLAWB_PUBLIC_NODE_URL) : input.nodeUrl;

  const provisioned = await provisionWorkspaceWithAdapter({
    jobId: job.id,
    title: job.title,
    provider,
    mode: input.mode === 'create' ? 'create' : 'link',
    repoOwner,
    repoName,
    repoUrl,
    defaultBranch,
    branchRef,
    prRef: input.prRef,
    prNumber: input.prNumber,
    cloneUrl,
    nodeUrl,
    repoDid: input.repoDid,
    actorDids: input.actorDids || [],
    ucanDelegationRefs: sanitizeWorkspacePayload(input.ucanDelegationRefs || []) as any[],
    providerIdentity: input.providerIdentity,
    participants: input.participants || [],
  }).catch((error: any) => ({
    status: 'FAILED' as const,
    liveMode: false,
    providerWorkspaceId: undefined,
    repoUrl,
    repoOwner,
    repoName,
    cloneUrl,
    nodeUrl,
    repoDid: input.repoDid,
    defaultBranch,
    branchRef,
    prRef: input.prRef,
    prNumber: input.prNumber,
    actorDids: input.actorDids || [],
    ucanDelegationRefs: sanitizeWorkspacePayload(input.ucanDelegationRefs || []) as any[],
    capabilitySummary: `Workspace provisioning failed: ${error.message}`,
    readiness: {
      credentialsReady: false,
      delegationReady: false,
      nodeReady: provider === 'github',
      webhookReady: false,
      verificationReady: false,
    },
    warnings: [error.message],
  }));

  const workspace = await prisma.contractWorkspace.create({
    data: {
      jobId: job.id,
      provider,
      mode,
      status: normalizeLifecycleStatus(provisioned.status),
      liveMode: provisioned.liveMode,
      provisioningIdempotencyKey: idempotencyKey,
      providerWorkspaceId: provisioned.providerWorkspaceId,
      repoUrl: provisioned.repoUrl || repoUrl,
      repoOwner: provisioned.repoOwner || repoOwner,
      repoName: provisioned.repoName || repoName,
      providerIdentity: input.providerIdentity,
      nodeUrl: provisioned.nodeUrl || nodeUrl,
      repoDid: provisioned.repoDid || input.repoDid,
      cloneUrl: provisioned.cloneUrl || cloneUrl,
      defaultBranch: provisioned.defaultBranch || defaultBranch,
      branchRef: provisioned.branchRef || branchRef,
      prRef: provisioned.prRef || input.prRef,
      prNumber: provisioned.prNumber || input.prNumber,
      commitSha: input.commitSha,
      treeCid: input.treeCid,
      refCertificateCid: input.refCertificateCid,
      actorDids: stringify(provisioned.actorDids || input.actorDids || []),
      ucanDelegationRefs: stringify(sanitizeWorkspacePayload(provisioned.ucanDelegationRefs || input.ucanDelegationRefs || [])),
      capabilitySummary: input.capabilitySummary || provisioned.capabilitySummary,
      latestVerificationStatus: 'UNVERIFIED',
      credentialsReady: provisioned.readiness.credentialsReady,
      delegationReady: provisioned.readiness.delegationReady,
      nodeReady: provisioned.readiness.nodeReady,
      webhookReady: provisioned.readiness.webhookReady,
      verificationReady: provisioned.readiness.verificationReady,
      provisioningAttempts: 1,
      lastProvisioningError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : undefined,
      createdBy: actor.walletAddress,
    },
    include: {
      events: true,
      verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
      evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });

  await prisma.workspaceProvisioningJob.upsert({
    where: { idempotencyKey },
    update: {
      workspaceId: workspace.id,
      status: provisioned.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
      attempts: { increment: 1 },
      lastError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : null,
      completedAt: new Date(),
    },
    create: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider,
      idempotencyKey,
      status: provisioned.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
      attempts: 1,
      lastError: provisioned.status === 'FAILED' ? provisioned.warnings.join('; ') : null,
      completedAt: new Date(),
      createdBy: actor.walletAddress,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider,
      eventType: provisioned.status === 'FAILED'
        ? 'workspace.provisioning.failed'
        : mode === 'created'
          ? 'workspace.created'
          : 'workspace.linked',
      actor: actor.walletAddress,
      branchRef: provisioned.branchRef || branchRef,
      prRef: workspace.prRef,
      prNumber: workspace.prNumber,
      commitSha: workspace.commitSha,
      treeCid: workspace.treeCid,
      refCertificateCid: workspace.refCertificateCid,
      normalizedData: JSON.stringify(sanitizeWorkspacePayload({
        provider,
        mode,
        status: workspace.status,
        liveMode: provisioned.liveMode,
        repoUrl: provisioned.repoUrl || repoUrl,
        cloneUrl: provisioned.cloneUrl || cloneUrl,
        repoDid: provisioned.repoDid || input.repoDid,
        readiness: provisioned.readiness,
        warnings: provisioned.warnings,
      })),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, provisioned.status === 'FAILED' ? 'WORKSPACE_PROVISION_FAILED' : 'WORKSPACE_PROVISIONED', 'JOB', job.id, {
    provider,
    workspaceId: workspace.id,
    liveMode: provisioned.liveMode,
    status: workspace.status,
  });

  return workspace;
}

export async function ingestWorkspaceEvent(job: JobWithAgent, actor: AuthActor, input: any, options: { trustedProviderWebhook?: boolean } = {}) {
  if (!options.trustedProviderWebhook) assertParticipant(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  const deliverySignatureHash = input.deliverySignatureHash || (input.deliverySignature ? hashString(input.deliverySignature) : undefined);
  const replayWindowSeconds = input.replayWindowSeconds || 300;
  if (input.deliveryTimestamp) {
    const deliveryTime = new Date(input.deliveryTimestamp).getTime();
    const ageMs = Math.abs(Date.now() - deliveryTime);
    if (ageMs > replayWindowSeconds * 1000) {
      throw Object.assign(new Error('Workspace event delivery is outside the replay window'), { statusCode: 409 });
    }
  }

  if (deliverySignatureHash) {
    const existingBySignature = await prisma.workspaceEvent.findUnique({
      where: { workspaceId_deliverySignatureHash: { workspaceId: workspace.id, deliverySignatureHash } },
    });
    if (existingBySignature) return { event: existingBySignature, idempotent: true };
  }

  if (input.providerEventId) {
    const existing = await prisma.workspaceEvent.findUnique({
      where: { workspaceId_providerEventId: { workspaceId: workspace.id, providerEventId: input.providerEventId } },
    });
    if (existing) return { event: existing, idempotent: true };
  }

  const sanitizedPayload = input.payload ? sanitizeWorkspacePayload(input.payload) : undefined;
  const sanitizedNormalized = input.normalizedData ? sanitizeWorkspacePayload(input.normalizedData) : undefined;
  const evidenceSummary = [
    workspace.capabilitySummary,
    input.eventType,
    sanitizedNormalized && typeof sanitizedNormalized === 'object' ? (sanitizedNormalized as any).reviewStatus : undefined,
    sanitizedNormalized && typeof sanitizedNormalized === 'object' ? (sanitizedNormalized as any).ciStatus : undefined,
    sanitizedNormalized && typeof sanitizedNormalized === 'object' ? (sanitizedNormalized as any).action : undefined,
  ].filter(Boolean).join(' ');
  const event = await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: input.eventType,
      providerEventId: input.providerEventId,
      actor: input.actor,
      actorDid: input.actorDid,
      actorProviderId: input.actorProviderId,
      branchRef: input.branchRef,
      prRef: input.prRef,
      prNumber: input.prNumber,
      commitSha: input.commitSha,
      treeCid: input.treeCid,
      refCertificateCid: input.refCertificateCid,
      payload: sanitizedPayload ? JSON.stringify(sanitizedPayload) : undefined,
      normalizedData: sanitizedNormalized ? JSON.stringify(sanitizedNormalized) : undefined,
      deliverySignatureHash,
      deliveryTimestamp: input.deliveryTimestamp ? new Date(input.deliveryTimestamp) : undefined,
      replayWindowSeconds,
      signatureVerified: Boolean(input.signatureVerified),
      replayProtected: Boolean(deliverySignatureHash || input.providerEventId || input.replayProtected),
      ingestedBy: actor.walletAddress,
    },
  });

  const nextStatus = input.eventType === 'workspace.archived'
    ? 'ARCHIVED'
    : input.eventType === 'workspace.provisioning.failed'
      ? 'FAILED'
      : input.eventType.includes('dispute')
        ? 'DISPUTED'
        : (input.eventType.includes('submitted') || input.eventType.includes('pull_request') || input.eventType.includes('pr.') || input.prRef)
          ? 'SUBMITTED'
          : workspace.status;

  await prisma.contractWorkspace.update({
    where: { id: workspace.id },
    data: {
      updatedBy: actor.walletAddress,
      status: normalizeLifecycleStatus(nextStatus),
      branchRef: input.branchRef || workspace.branchRef,
      prRef: input.prRef || workspace.prRef,
      prNumber: input.prNumber || workspace.prNumber,
      commitSha: input.commitSha || workspace.commitSha,
      treeCid: input.treeCid || workspace.treeCid,
      refCertificateCid: input.refCertificateCid || workspace.refCertificateCid,
      capabilitySummary: evidenceSummary || workspace.capabilitySummary,
      webhookReady: input.signatureVerified ? true : workspace.webhookReady,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_EVENT_INGESTED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
    eventType: input.eventType,
    providerEventId: input.providerEventId,
    signatureVerified: Boolean(input.signatureVerified),
    replayProtected: Boolean(deliverySignatureHash || input.providerEventId || input.replayProtected),
  });

  return { event, idempotent: false };
}

function activeDelegationCovers(workspace: any, signerDid: string | undefined, branchRef: string | undefined): boolean {
  if (!signerDid) return false;
  const refs = parseArray(workspace.ucanDelegationRefs);
  const now = Date.now();
  return refs.some((ref: any) => {
    if (!ref || typeof ref !== 'object') return false;
    if (ref.audienceDid && ref.audienceDid !== signerDid) return false;
    if (ref.expiresAt && new Date(ref.expiresAt).getTime() <= now) return false;
    const scopes = Array.isArray(ref.scope) ? ref.scope : [];
    return scopes.some((scope: string) =>
      scope === '*' ||
      scope === 'repo:*' ||
      scope === `repo:${workspace.repoDid}` ||
      scope === 'workspace:write' ||
      (branchRef && (scope === `branch:${branchRef}` || scope === `push:${branchRef}`))
    );
  });
}

function stringList(value: unknown): string[] {
  return parseArray(value).filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function evidenceObject(input: any): Record<string, any> {
  return input?.evidence && typeof input.evidence === 'object' ? input.evidence : {};
}

function checkValue(input: any, ...names: string[]): string | undefined {
  const evidence = evidenceObject(input);
  for (const name of names) {
    const fromInput = input[name];
    const fromEvidence = evidence[name];
    if (typeof fromInput === 'string' && fromInput.length > 0) return fromInput;
    if (typeof fromEvidence === 'string' && fromEvidence.length > 0) return fromEvidence;
  }
  return undefined;
}

function hasPositiveReview(input: any): boolean {
  const reviewStatus = (checkValue(input, 'reviewStatus', 'reviewState') || '').toLowerCase();
  if (['approved', 'changes_approved', 'accepted'].includes(reviewStatus)) return true;
  return (input.checks || []).some((check: any) =>
    /review/i.test(check.name || '') &&
    SUCCESS_CHECK_STATUSES.has(String(check.status || check.conclusion || '').toLowerCase())
  );
}

function hasSuccessfulCi(input: any): boolean {
  const ciStatus = (checkValue(input, 'ciStatus', 'ciConclusion', 'conclusion') || '').toLowerCase();
  if (['success', 'passed', 'neutral', 'skipped'].includes(ciStatus)) return true;
  return (input.checks || []).some((check: any) =>
    /(ci|check|test|workflow)/i.test(check.name || '') &&
    SUCCESS_CHECK_STATUSES.has(String(check.status || check.conclusion || '').toLowerCase())
  );
}

function hasPassingProviderCheck(input: any): boolean {
  return (input.checks || []).some((check: any) =>
    SUCCESS_CHECK_STATUSES.has(String(check.status || check.conclusion || '').toLowerCase())
  );
}

function checksHaveFailure(input: any): boolean {
  return (input.checks || []).some((check: any) =>
    FAILING_CHECK_STATUSES.has(String(check.status || check.conclusion || '').toLowerCase())
  );
}

function deliverablePathsAllowed(workspace: any, input: any): boolean {
  const expected = stringList(workspace.deliverablePaths);
  if (expected.length === 0) return true;
  return input.deliverablePaths.every((path: string) => expected.some(expectedPath => path === expectedPath || path.startsWith(`${expectedPath}/`)));
}

function verifySubmissionAgainstWorkspace(workspace: any, input: any): { status: 'PASSED' | 'FAILED'; failureReasons: string[] } {
  const failureReasons: string[] = [];
  if (checksHaveFailure(input)) failureReasons.push('One or more submitted checks failed');
  if (!input.deliverablePaths?.length) failureReasons.push('At least one deliverable path is required');
  if (!deliverablePathsAllowed(workspace, input)) failureReasons.push('Submitted deliverable paths are outside the accepted workspace path scope');

  if (workspace.provider === 'github') {
    if (input.repoOwner && workspace.repoOwner && input.repoOwner !== workspace.repoOwner) failureReasons.push('GitHub repo owner does not match workspace');
    if (input.repoName && workspace.repoName && input.repoName !== workspace.repoName) failureReasons.push('GitHub repo name does not match workspace');
    if (input.branchRef && workspace.branchRef && input.branchRef !== workspace.branchRef) failureReasons.push('GitHub branch does not match workspace branch');
    if (workspace.defaultBranch && input.targetBranch && workspace.defaultBranch !== input.targetBranch) {
      failureReasons.push('GitHub PR target branch does not match workspace default branch');
    }
    if (!input.commitSha && !workspace.commitSha) failureReasons.push('GitHub verification requires a commit SHA');
    if (!input.prRef && !input.prNumber && !workspace.prRef && !workspace.prNumber) failureReasons.push('GitHub verification requires a PR reference or PR number');
    if (!hasPositiveReview(input)) failureReasons.push('GitHub verification requires an approved review state');
    if (!hasSuccessfulCi(input)) failureReasons.push('GitHub verification requires a successful CI/check conclusion');
  }

  if (workspace.provider === 'gitlawb') {
    const actorDids = parseArray(workspace.actorDids);
    if (!input.signerDid) failureReasons.push('GitLawb verification requires signerDid');
    if (input.signerDid && actorDids.length > 0 && !actorDids.includes(input.signerDid)) {
      failureReasons.push('Signer DID is not bound to this workspace');
    }
    if (!activeDelegationCovers(workspace, input.signerDid, input.branchRef || workspace.branchRef)) {
      failureReasons.push('No active UCAN delegation covers the submitted branch');
    }
    if (input.nodeUrl && workspace.nodeUrl && input.nodeUrl !== workspace.nodeUrl) failureReasons.push('GitLawb node URL does not match workspace');
    if (input.repoDid && workspace.repoDid && input.repoDid !== workspace.repoDid) failureReasons.push('GitLawb repo DID does not match workspace');
    if (input.branchRef && workspace.branchRef && input.branchRef !== workspace.branchRef) failureReasons.push('GitLawb branch does not match workspace branch');
    if (input.prRef && workspace.prRef && input.prRef !== workspace.prRef) failureReasons.push('GitLawb PR ref does not match workspace PR ref');
    if (workspace.defaultBranch && input.targetBranch && workspace.defaultBranch !== input.targetBranch) {
      failureReasons.push('PR target branch does not match workspace default branch');
    }
    if (!input.commitSha && !input.treeCid && !workspace.commitSha && !workspace.treeCid) {
      failureReasons.push('GitLawb verification requires commit or tree CID evidence');
    }
    if (!input.refCertificateCid && !workspace.refCertificateCid) {
      failureReasons.push('GitLawb verification requires ref certificate evidence');
    }
    if (!hasPassingProviderCheck(input)) failureReasons.push('GitLawb verification requires a passing ref/check result');
  }

  return { status: failureReasons.length === 0 ? 'PASSED' : 'FAILED', failureReasons };
}

export async function verifyWorkspaceSubmission(job: JobWithAgent, actor: AuthActor, input: any) {
  assertParticipant(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  const sanitizedEvidence = input.evidence ? sanitizeWorkspacePayload(input.evidence) : undefined;
  const result = verifySubmissionAgainstWorkspace(workspace, input);
  const verification = await prisma.workspaceVerificationResult.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      status: result.status,
      submissionRef: input.submissionRef,
      branchRef: input.branchRef,
      prRef: input.prRef,
      prNumber: input.prNumber,
      commitSha: input.commitSha,
      treeCid: input.treeCid,
      refCertificateCid: input.refCertificateCid,
      signerDid: input.signerDid,
      actorProviderId: input.actorProviderId,
      targetBranch: input.targetBranch,
      deliverablePaths: stringify(input.deliverablePaths || []),
      checks: stringify(input.checks || []),
      failureReasons: stringify(result.failureReasons),
      evidence: sanitizedEvidence ? JSON.stringify(sanitizedEvidence) : undefined,
      verifiedBy: actor.walletAddress,
    },
  });

  await prisma.contractWorkspace.update({
    where: { id: workspace.id },
    data: {
      status: result.status === 'PASSED' ? 'VERIFIED' : 'SUBMITTED',
      latestVerificationStatus: result.status,
      verificationReady: true,
      updatedBy: actor.walletAddress,
      branchRef: input.branchRef || workspace.branchRef,
      prRef: input.prRef || workspace.prRef,
      prNumber: input.prNumber || workspace.prNumber,
      commitSha: input.commitSha || workspace.commitSha,
      treeCid: input.treeCid || workspace.treeCid,
      refCertificateCid: input.refCertificateCid || workspace.refCertificateCid,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: 'workspace.submission.verified',
      actor: actor.walletAddress,
      branchRef: input.branchRef,
      prRef: input.prRef,
      prNumber: input.prNumber,
      commitSha: input.commitSha,
      treeCid: input.treeCid,
      refCertificateCid: input.refCertificateCid,
      normalizedData: JSON.stringify({ status: result.status, verificationResultId: verification.id }),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_SUBMISSION_VERIFIED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
    verificationResultId: verification.id,
    status: result.status,
  });

  return verification;
}

export async function snapshotWorkspaceEvidence(job: JobWithAgent, actor: AuthActor, input: any) {
  assertParticipant(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({
    where: { jobId: job.id },
    include: {
      events: { orderBy: { ingestedAt: 'desc' }, take: 25 },
      verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
    },
  });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  let verification = workspace.verificationResults[0];
  if (input.verificationResultId) {
    verification = await prisma.workspaceVerificationResult.findFirst({
      where: { id: input.verificationResultId, workspaceId: workspace.id },
    }) as any;
    if (!verification) {
      throw Object.assign(new Error('Verification result not found for workspace'), { statusCode: 404 });
    }
  }

  if ((input.snapshotType || 'final') === 'final') {
    if (!verification) {
      throw Object.assign(new Error('Final workspace evidence snapshots require a provider verification result'), { statusCode: 409 });
    }
    if (verification.status !== 'PASSED') {
      throw Object.assign(new Error('Final workspace evidence snapshots require passing provider verification'), { statusCode: 409 });
    }
  }

  const evidence = sanitizeWorkspacePayload({
    provider: workspace.provider,
    workspaceId: workspace.id,
    jobId: job.id,
    repoUrl: workspace.repoUrl,
    cloneUrl: workspace.cloneUrl,
    repoDid: workspace.repoDid,
    nodeUrl: workspace.nodeUrl,
    branchRef: workspace.branchRef,
    prRef: workspace.prRef,
    prNumber: workspace.prNumber,
    commitSha: workspace.commitSha,
    treeCid: workspace.treeCid,
    refCertificateCid: workspace.refCertificateCid,
    latestVerificationStatus: workspace.latestVerificationStatus,
    verificationResultId: verification?.id,
    eventCount: workspace.events.length,
    events: workspace.events.map(event => ({
      eventType: event.eventType,
      providerEventId: event.providerEventId,
      actor: event.actor,
      actorDid: event.actorDid,
      branchRef: event.branchRef,
      prRef: event.prRef,
      prNumber: event.prNumber,
      commitSha: event.commitSha,
      treeCid: event.treeCid,
      refCertificateCid: event.refCertificateCid,
      payload: event.payload ? safeJson(event.payload) : undefined,
      normalizedData: event.normalizedData ? safeJson(event.normalizedData) : undefined,
      ingestedAt: event.ingestedAt,
    })),
    suppliedEvidence: input.evidence || {},
  });
  const evidenceHash = hashEvidence(evidence);

  const snapshot = await prisma.workspaceEvidenceSnapshot.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      snapshotType: input.snapshotType || 'final',
      repoUrl: workspace.repoUrl,
      cloneUrl: workspace.cloneUrl,
      branchRef: workspace.branchRef,
      prRef: workspace.prRef,
      prNumber: workspace.prNumber,
      commitSha: workspace.commitSha,
      treeCid: workspace.treeCid,
      refCertificateCid: workspace.refCertificateCid,
      verificationResultId: verification?.id,
      evidence: JSON.stringify(evidence),
      evidenceHash,
      createdBy: actor.walletAddress,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: 'workspace.evidence.snapshotted',
      actor: actor.walletAddress,
      branchRef: workspace.branchRef,
      prRef: workspace.prRef,
      prNumber: workspace.prNumber,
      commitSha: workspace.commitSha,
      treeCid: workspace.treeCid,
      refCertificateCid: workspace.refCertificateCid,
      normalizedData: JSON.stringify({ snapshotId: snapshot.id, evidenceHash }),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_EVIDENCE_SNAPSHOT_CREATED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
    snapshotId: snapshot.id,
    snapshotType: snapshot.snapshotType,
    evidenceHash,
  });

  return snapshot;
}

export async function rotateWorkspaceAccess(job: JobWithAgent, actor: AuthActor, input: any) {
  assertClient(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  const sanitizedRefs = sanitizeWorkspacePayload(input.ucanDelegationRefs || []) as any[];
  const hasDelegation = workspace.provider === 'gitlawb' ? sanitizedRefs.length > 0 : true;
  const updated = await prisma.contractWorkspace.update({
    where: { id: workspace.id },
    data: {
      ucanDelegationRefs: sanitizedRefs.length > 0 ? stringify(sanitizedRefs) : workspace.ucanDelegationRefs,
      credentialsReady: Boolean(input.credentialsReady ?? workspace.credentialsReady),
      delegationReady: hasDelegation,
      webhookReady: Boolean(input.webhookReady ?? workspace.webhookReady),
      updatedBy: actor.walletAddress,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: 'workspace.access.rotated',
      actor: actor.walletAddress,
      normalizedData: JSON.stringify(sanitizeWorkspacePayload({
        provider: workspace.provider,
        rotatedAt: new Date().toISOString(),
        credentialRef: input.credentialRef,
        delegationRefs: sanitizedRefs,
      })),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_ACCESS_ROTATED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
  });

  return updated;
}

export async function revokeWorkspaceAccess(job: JobWithAgent, actor: AuthActor, input: any) {
  assertClient(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  const updated = await prisma.contractWorkspace.update({
    where: { id: workspace.id },
    data: {
      ucanDelegationRefs: workspace.provider === 'gitlawb' ? stringify([]) : workspace.ucanDelegationRefs,
      delegationReady: workspace.provider === 'github',
      credentialsReady: input.revokeCredentials ? false : workspace.credentialsReady,
      webhookReady: input.revokeWebhook ? false : workspace.webhookReady,
      updatedBy: actor.walletAddress,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: 'workspace.access.revoked',
      actor: actor.walletAddress,
      normalizedData: JSON.stringify(sanitizeWorkspacePayload({
        provider: workspace.provider,
        revokedAt: new Date().toISOString(),
        reason: input.reason,
        revokeCredentials: Boolean(input.revokeCredentials),
        revokeWebhook: Boolean(input.revokeWebhook),
      })),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_ACCESS_REVOKED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
    revokeCredentials: Boolean(input.revokeCredentials),
    revokeWebhook: Boolean(input.revokeWebhook),
  });

  return updated;
}

export async function reconcileWorkspace(job: JobWithAgent, actor: AuthActor, input: any = {}) {
  if (!actor.userId.startsWith('system:')) assertParticipant(job, actor);
  const workspace = await prisma.contractWorkspace.findUnique({ where: { jobId: job.id } });
  if (!workspace) {
    throw Object.assign(new Error('Workspace not found for job'), { statusCode: 404 });
  }

  const now = new Date();
  const updated = await prisma.contractWorkspace.update({
    where: { id: workspace.id },
    data: {
      lastReconciledAt: now,
      updatedBy: actor.walletAddress,
    },
  });

  await prisma.workspaceEvent.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      provider: workspace.provider,
      eventType: 'workspace.reconciled',
      actor: actor.walletAddress,
      normalizedData: JSON.stringify(sanitizeWorkspacePayload({
        provider: workspace.provider,
        reconciledAt: now.toISOString(),
        source: input.source || 'manual',
      })),
      ingestedBy: actor.walletAddress,
    },
  });

  auditLog(actor.walletAddress, 'WORKSPACE_RECONCILED', 'JOB', job.id, {
    provider: workspace.provider,
    workspaceId: workspace.id,
    source: input.source || 'manual',
  });

  return updated;
}

export async function reconcileDueWorkspaces(limit = 25) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const workspaces = await prisma.contractWorkspace.findMany({
    where: {
      status: { in: ['READY', 'SUBMITTED', 'VERIFIED'] },
      OR: [{ lastReconciledAt: null }, { lastReconciledAt: { lt: cutoff } }],
    },
    include: { job: { include: { agent: { select: { handlerId: true, walletAddress: true } } } } },
    take: limit,
    orderBy: { updatedAt: 'asc' },
  });

  for (const workspace of workspaces) {
    await reconcileWorkspace(
      workspace.job as any,
      { userId: 'system:reconciler', walletAddress: 'SYSTEM' },
      { source: 'background' },
    ).catch((error) => {
      console.warn(`[Workspace] Reconciliation failed for ${workspace.id}: ${error.message}`);
    });
  }
}
