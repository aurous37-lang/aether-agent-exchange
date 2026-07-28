import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { AuthRequest } from '../types';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createJobSchema, updateJobSchema, bidSchema,
  submitDeliverableSchema, settlementReceiptSchema, disputeSchema, ratingSchema,
  approveJobSchema,
  paginationSchema,
} from '../utils/validation';
import { wsService } from '../services/websocket';
import { auditLog } from '../services/audit';
import { requireConsent } from '../middleware/consent';
import { paramId } from '../utils/params';
import { parseJsonArrays, parseJsonArraysList, serializeArrays } from '../utils/sqlite-compat';
import { CHAINS, chainEnvValue, getActiveChain } from '../config/chains';
import { PAID_CHAIN_RAILS, amountToUnits, assertJobCanComplete, assertSettlementInputMatchesJob, normalizeAddress, normalizeHash, normalizeReceiptHash, SettlementError } from '../services/settlement';
import { verifyAndRecordSettlementReceipt } from '../services/settlementVerifier';
import { createOrLinkWorkspace, sanitizeWorkspacePayload } from '../services/workspaces';
import { assertStablecoinProviderCanQuote } from '../services/stablecoinProviders';
import { isPaidDirectWalletRail, loadEscrowLifecycleEvidence, type CanonicalEscrowState, type EscrowLifecycleEvidence } from '../services/escrowLifecycle';

const router = Router();
const DIRECT_WALLET_ESCROW_RAILS = new Set(['standard', 'erc8183']);
const DIRECT_WALLET_ACCEPTANCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FACTORY_BINDING_VERIFIED = 'FACTORY_EVENT_VERIFIED';
const DIRECT_WALLET_CURRENT_EVENT_TYPES: Record<CanonicalEscrowState, string[]> = {
  UNFUNDED: ['ESCROW_CREATED'],
  FUNDED_OPEN: ['FUNDED'],
  ACCEPTED_ONCHAIN: ['STARTED'],
  DELIVERED_ONCHAIN: ['DELIVERED'],
  RELEASED_ONCHAIN: ['RELEASED', 'AUTO_RELEASED'],
  REFUNDED_ONCHAIN: ['REFUNDED', 'CANCELLED'],
  DISPUTED_ONCHAIN: ['DISPUTED'],
  RESOLVED_ONCHAIN: ['RESOLVED'],
  REORGED: [],
  FAILED: [],
  UNKNOWN: [],
};

function jobUrlPath(jobId: string): string {
  return `/jobs/${jobId}`;
}

function isDirectWalletEscrowRail(rail?: string | null): boolean {
  return DIRECT_WALLET_ESCROW_RAILS.has(rail || 'offchain');
}

function expectedDirectWalletEscrowVersion(job: { settlementRail?: string | null; escrowContractVersion?: string | null }): string {
  if (job.settlementRail === 'erc8183') return 'erc8183';
  return job.escrowContractVersion || 'legacy';
}

function lifecycleBindingError(job: any, lifecycle: EscrowLifecycleEvidence): string | null {
  const state = lifecycle.state;
  if (!state) return null;

  if (state.jobId && state.jobId !== job.id) {
    return `indexed lifecycle state is bound to job ${state.jobId}, not ${job.id}`;
  }
  if (job.chainId && state.chainId && Number(state.chainId) !== Number(job.chainId)) {
    return `indexed chainId ${state.chainId} does not match job chainId ${job.chainId}`;
  }
  if (job.network && state.chainKey && state.chainKey !== job.network) {
    return `indexed network ${state.chainKey} does not match job network ${job.network}`;
  }

  const jobEscrow = normalizeAddress(job.escrowAddress);
  const indexedEscrow = normalizeAddress(state.escrowAddress);
  if (jobEscrow && !indexedEscrow) return 'indexed lifecycle state is missing escrowAddress';
  if (jobEscrow && indexedEscrow && indexedEscrow !== jobEscrow) {
    return `indexed escrowAddress ${indexedEscrow} does not match job escrowAddress ${jobEscrow}`;
  }

  const jobOnchainId = normalizeHash(job.onchainJobId);
  const indexedOnchainId = normalizeHash(state.onchainJobId);
  if (jobOnchainId && !indexedOnchainId) return 'indexed lifecycle state is missing onchainJobId';
  if (jobOnchainId && indexedOnchainId && indexedOnchainId !== jobOnchainId) {
    return 'indexed onchainJobId does not match job onchainJobId';
  }

  const jobToken = normalizeAddress(job.tokenAddress);
  const indexedToken = normalizeAddress(state.tokenAddress);
  if (jobToken && indexedToken && indexedToken !== jobToken) {
    return 'indexed tokenAddress does not match job tokenAddress';
  }
  if (state.tokenSymbol && job.budgetToken && state.tokenSymbol !== job.budgetToken) {
    return `indexed token ${state.tokenSymbol} does not match job budget token ${job.budgetToken}`;
  }
  if (state.escrowContractVersion && job.escrowContractVersion && state.escrowContractVersion !== job.escrowContractVersion) {
    return 'indexed escrow contract version does not match job metadata';
  }

  return null;
}

function normalizeLifecycleType(event: any): string {
  return String(event?.lifecycleType || event?.eventName || '').toUpperCase();
}

function finalizedIndexedEvent(event: any): boolean {
  return event?.finalityStatus === 'FINAL' && !event?.removedAt;
}

function eventMatchesJobBinding(event: any, job: any, escrowAddress: string, onchainJobId: string): boolean {
  if (!finalizedIndexedEvent(event)) return false;
  if (event.jobId && event.jobId !== job.id) return false;
  if (Number(event.chainId) !== Number(job.chainId)) return false;
  if (normalizeAddress(event.escrowAddress) !== escrowAddress) return false;
  if (normalizeHash(event.onchainJobId) !== onchainJobId) return false;
  return true;
}

function isVerifiedFactoryBinding(value: any): boolean {
  return value?.factoryBound === true && value?.factoryBindingStatus === FACTORY_BINDING_VERIFIED;
}

function hasLifecycleType(event: any, lifecycleTypes: string[]): boolean {
  const eventType = normalizeLifecycleType(event);
  return lifecycleTypes.includes(eventType);
}

function amountBindingError(job: any, evidence: Array<{ label: string; amount?: string | null }>): string | null {
  const expected = amountToUnits(job.budgetAmount, job.budgetToken).toString();
  const missing = evidence.find(item => item.amount === undefined || item.amount === null || String(item.amount).length === 0);
  if (missing) return `${missing.label} is missing escrow amount binding`;
  const mismatch = evidence.find(item => String(item.amount) !== expected);
  return mismatch ? `${mismatch.label} amount ${mismatch.amount} does not match job budget ${expected}` : null;
}

async function lifecycleIndexedBindingError(job: any, lifecycle: EscrowLifecycleEvidence): Promise<string | null> {
  const state = lifecycle.state;
  const expectedVersion = expectedDirectWalletEscrowVersion(job);
  const factoryCreationEventName = expectedVersion === 'erc8183' ? 'JobCreated' : 'EscrowCreated';
  if (!state) return 'no indexed escrow lifecycle state';
  if (!isVerifiedFactoryBinding(state)) {
    return `indexed lifecycle state is missing verified factory-bound ${factoryCreationEventName} evidence`;
  }

  const jobEscrow = normalizeAddress(job.escrowAddress);
  const indexedEscrow = normalizeAddress(state.escrowAddress);
  const escrowAddress = jobEscrow || indexedEscrow;
  if (!jobEscrow) return 'job is missing escrowAddress until the indexer binds escrow creation evidence';
  if (!indexedEscrow) return 'indexed lifecycle state is missing escrowAddress';
  if (!escrowAddress || jobEscrow !== indexedEscrow) return 'indexed escrowAddress does not match job escrowAddress';

  const jobOnchainId = normalizeHash(job.onchainJobId);
  const indexedOnchainId = normalizeHash(state.onchainJobId);
  const onchainJobId = jobOnchainId || indexedOnchainId;
  if (!jobOnchainId) return 'job is missing onchainJobId until the indexer binds escrow creation evidence';
  if (!indexedOnchainId) return 'indexed lifecycle state is missing onchainJobId';
  if (!onchainJobId || jobOnchainId !== indexedOnchainId) return 'indexed onchainJobId does not match job onchainJobId';

  if (!job.chainId || !state.chainId || Number(job.chainId) !== Number(state.chainId)) {
    return 'indexed lifecycle chainId does not match job chainId';
  }

  const indexedTokenSymbol = typeof state.tokenSymbol === 'string' ? state.tokenSymbol : null;
  if (!indexedTokenSymbol) return 'indexed lifecycle state is missing token symbol binding';
  if (indexedTokenSymbol !== job.budgetToken) {
    return `indexed token ${indexedTokenSymbol} does not match job budget token ${job.budgetToken}`;
  }

  const indexedTokenAddress = normalizeAddress(state.tokenAddress);
  const jobTokenAddress = normalizeAddress(job.tokenAddress);
  if (jobTokenAddress && !indexedTokenAddress) {
    return 'indexed lifecycle state is missing ERC20 tokenAddress binding';
  }
  if (indexedTokenAddress && jobTokenAddress && indexedTokenAddress !== jobTokenAddress) {
    return 'indexed tokenAddress does not match job tokenAddress';
  }
  if (indexedTokenAddress && !jobTokenAddress) {
    return 'indexed ERC20 tokenAddress is present but job is configured as native-token escrow';
  }

  if (state.escrowContractVersion !== expectedVersion) {
    return `indexed lifecycle escrow contract version ${state.escrowContractVersion || 'missing'} does not match expected ${expectedVersion}`;
  }

  let indexedEvents: any[];
  try {
    indexedEvents = await (prisma as any).indexedChainEvent.findMany({
      where: {
        chainId: Number(job.chainId),
        escrowAddress,
        finalityStatus: 'FINAL',
        OR: [
          { jobId: job.id },
          { onchainJobId },
        ],
      },
      take: 100,
    });
  } catch {
    return 'indexed chain event table is unavailable';
  }

  const conflicting = indexedEvents.find(event => event.jobId && event.jobId !== job.id);
  if (conflicting) {
    return `indexed escrow event ${conflicting.txHash || conflicting.id} is bound to another job`;
  }

  const matchingEvents = indexedEvents.filter(event => eventMatchesJobBinding(event, job, escrowAddress, onchainJobId));
  const creationEvent = matchingEvents.find(event => hasLifecycleType(event, ['ESCROW_CREATED']));
  if (!creationEvent) return `missing finalized factory-bound ${factoryCreationEventName} evidence for this job escrow`;
  if (!isVerifiedFactoryBinding(creationEvent)) {
    return `${factoryCreationEventName} evidence is not verified against the configured factory and escrow contract`;
  }
  if (!normalizeAddress(creationEvent.factoryAddress)) {
    return `factory-bound ${factoryCreationEventName} evidence is missing factoryAddress`;
  }
  if (creationEvent.escrowContractVersion !== expectedVersion) {
    return `factory ${factoryCreationEventName} escrow contract version ${creationEvent.escrowContractVersion || 'missing'} does not match expected ${expectedVersion}`;
  }

  const currentTypes = DIRECT_WALLET_CURRENT_EVENT_TYPES[lifecycle.canonicalState] || [];
  const currentEvent = matchingEvents.find(event => hasLifecycleType(event, currentTypes));
  if (!currentEvent) {
    return `missing finalized indexed ${currentTypes.join('/')} evidence for current escrow state`;
  }

  const latestTxHash = normalizeHash(state.latestTxHash);
  if (latestTxHash && normalizeHash(currentEvent.txHash) !== latestTxHash) {
    return 'indexed lifecycle latest txHash is not backed by the matching finalized event';
  }
  if (currentEvent.escrowContractVersion && currentEvent.escrowContractVersion !== expectedVersion) {
    return `current indexed lifecycle escrow contract version ${currentEvent.escrowContractVersion} does not match expected ${expectedVersion}`;
  }

  const currentEventType = normalizeLifecycleType(currentEvent);
  const currentEventCarriesGrossAmount = ['ESCROW_CREATED', 'BUDGET_SET', 'FUNDED', 'REFUNDED', 'CANCELLED'].includes(currentEventType);
  const amountError = amountBindingError(job, [
    { label: 'indexed lifecycle state', amount: state.amountGross },
    {
      label: state.escrowContractVersion === 'erc8183' ? 'ERC-8183 amount-bearing lifecycle event' : 'factory EscrowCreated event',
      amount: state.escrowContractVersion === 'erc8183'
        ? matchingEvents.find(event => hasLifecycleType(event, ['BUDGET_SET', 'FUNDED']) && event.amountGross)?.amountGross
        : creationEvent.amountGross,
    },
    ...(currentEvent.amountGross && currentEventCarriesGrossAmount ? [{ label: 'current lifecycle event', amount: currentEvent.amountGross }] : []),
  ]);
  if (amountError) return amountError;

  return null;
}

async function requireDirectWalletLifecycle(
  job: any,
  allowedStates: CanonicalEscrowState[],
  errorMessage: string,
): Promise<EscrowLifecycleEvidence | null> {
  if (!isPaidDirectWalletRail(job)) return null;

  const lifecycle = await loadEscrowLifecycleEvidence(job.id, job);
  const bindingError = lifecycleBindingError(job, lifecycle);
  if (bindingError) {
    throw new SettlementError(`${errorMessage} (${bindingError})`, 409);
  }

  const final = lifecycle.finalityStatus === 'FINAL';
  if (!final || !allowedStates.includes(lifecycle.canonicalState)) {
    const details = lifecycle.missingEvidence.length > 0 ? ` (${lifecycle.missingEvidence.join('; ')})` : '';
    throw new SettlementError(`${errorMessage}${details}`, 409);
  }

  const indexedBindingError = await lifecycleIndexedBindingError(job, lifecycle);
  if (indexedBindingError) {
    throw new SettlementError(`${errorMessage} (${indexedBindingError})`, 409);
  }

  return lifecycle;
}

async function requireDirectWalletReleaseLedger(job: any, lifecycle: EscrowLifecycleEvidence, refs?: { txHash?: string; receiptHash?: string; ledgerId?: string } | null) {
  const releaseTxHash = normalizeHash(lifecycle.state?.latestTxHash);
  if (!releaseTxHash || !/^0x[a-f0-9]{64}$/.test(releaseTxHash)) {
    throw new SettlementError('Paid direct-wallet approval requires finalized indexed release txHash evidence', 409);
  }

  const requestedTxHash = normalizeHash(refs?.txHash);
  if (requestedTxHash && requestedTxHash !== releaseTxHash) {
    throw new SettlementError('Paid direct-wallet approval txHash does not match finalized indexed release evidence', 409);
  }

  const ledger = await prisma.paymentLedger.findUnique({ where: { txHash: releaseTxHash } });
  if (!ledger) {
    throw new SettlementError('Paid direct-wallet approval requires a verified settled PaymentLedger for the finalized indexed release tx', 409);
  }

  if (refs?.ledgerId && refs.ledgerId !== ledger.id) {
    throw new SettlementError('Paid direct-wallet approval ledgerId does not match finalized indexed release evidence', 409);
  }
  const requestedReceiptHash = normalizeReceiptHash(refs?.receiptHash);
  if (requestedReceiptHash && normalizeReceiptHash(ledger.receiptHash) !== requestedReceiptHash) {
    throw new SettlementError('Paid direct-wallet approval receiptHash does not match finalized indexed release evidence', 409);
  }

  const completionReceipt = await assertJobCanComplete(job, { ledgerId: ledger.id });
  if (!completionReceipt) {
    throw new SettlementError('Paid direct-wallet approval requires a verified settled PaymentLedger for the finalized indexed release tx', 409);
  }
  const releaseVerification = await (prisma as any).settlementReceiptVerification.findFirst({
    where: {
      paymentLedgerId: completionReceipt.id,
      status: 'PASSED',
      txHash: releaseTxHash,
      chainId: job.chainId || undefined,
      network: job.network || undefined,
      condition: { in: ['release', 'payment'] },
    },
    select: { id: true },
  });
  if (!releaseVerification) {
    throw new SettlementError('Paid direct-wallet approval requires release/payment settlement verification for the finalized indexed release tx', 409);
  }

  return completionReceipt;
}

function resolveDirectWalletDeadline(input: { settlementRail?: string | null; deadline?: string | null }, now = new Date()): { deadline?: Date | null; expiredAt?: Date | null; error?: string } {
  if (!isDirectWalletEscrowRail(input.settlementRail)) {
    const deadline = input.deadline ? new Date(input.deadline) : null;
    return { deadline, expiredAt: null };
  }

  const maxDeadline = new Date(now.getTime() + DIRECT_WALLET_ACCEPTANCE_WINDOW_MS);
  const deadline = input.deadline ? new Date(input.deadline) : maxDeadline;
  if (Number.isNaN(deadline.getTime())) return { error: 'Invalid direct wallet acceptance deadline' };
  if (deadline <= now) return { error: 'Direct wallet escrow deadline must be in the future' };
  if (deadline > maxDeadline) {
    return { error: 'Direct wallet escrow jobs must be accepted within 7 days of posting' };
  }

  return { deadline, expiredAt: deadline };
}

export function validateSettlementConfig(input: { network?: string; chainId?: number; settlementRail?: string; budgetAmount?: number | string; budgetToken?: string; tokenAddress?: string | null; escrowContractVersion?: string | null }): string | null {
  const chain = input.network ? CHAINS[input.network as keyof typeof CHAINS] : undefined;
  if (!chain) return `Unsupported network: ${input.network}`;
  if (input.chainId !== chain.chainId) return `chainId ${input.chainId} does not match ${chain.key}`;

  const rail = input.settlementRail || 'offchain';
  if (!chain.settlementRails.includes(rail) && rail !== 'offchain') {
    return `Settlement rail ${rail} is not supported on ${chain.key}`;
  }

  if (chain.key === 'base' && (rail === 'x402' || rail === 'px402') && process.env.AAE_ENABLE_X402_MAINNET !== 'true') {
    return 'Base mainnet paid rails require AAE_ENABLE_X402_MAINNET=true and a separately approved mainnet exercise';
  }

  if (chain.key === 'base' && (rail === 'x402' || rail === 'px402') && process.env.AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE !== 'true') {
    return 'Base mainnet paid rails require AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE=true and a separately approved mainnet exercise';
  }

  if (chain.paidRailsEnabledEnvFlag && rail !== 'offchain' && process.env[chain.paidRailsEnabledEnvFlag] !== 'true') {
    return `${chain.name} paid rails require ${chain.paidRailsEnabledEnvFlag}=true, caps, and a separately approved mainnet exercise`;
  }

  if ((rail === 'x402' || rail === 'px402') && !['base', 'base-sepolia', 'monad'].includes(chain.key)) {
    return `Settlement rail ${rail} is only supported on explicitly configured mainnet/testnet paid networks`;
  }

  if ((rail === 'x402' || rail === 'px402') && chain.key === 'monad') {
    const allowedNetworks = (process.env.X402_ALLOWED_NETWORKS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const cap = Number(process.env.X402_MAX_PAYMENT_USD || '0');
    if (!allowedNetworks.includes('eip155:143') || !Number.isFinite(cap) || cap <= 0) {
      return 'Monad x402/px402 rails require X402_ALLOWED_NETWORKS to include eip155:143 and X402_MAX_PAYMENT_USD to be set';
    }
  }

  if ((rail === 'x402' || rail === 'px402') && input.budgetToken && input.budgetToken !== 'USDC') {
    return `Settlement rail ${rail} requires USDC-denominated payment`;
  }

  if (rail === 'x402' || rail === 'px402') {
    try {
      assertStablecoinProviderCanQuote({
        providerId: 'x402',
        rail,
        network: chain.key,
        tokenSymbol: input.budgetToken || 'USDC',
        amountUsd: input.budgetAmount || '0',
        resource: 'job-posting',
      });
    } catch (error: any) {
      return error.message || `Settlement rail ${rail} is not enabled`;
    }
  }

  if (PAID_CHAIN_RAILS.has(rail) && input.budgetToken && !chain.supportedTokens.includes(input.budgetToken)) {
    return `Token ${input.budgetToken} is not supported for paid settlement on ${chain.key}`;
  }

  const nativeSymbol = chain.nativeCurrency.symbol;
  if (['standard', 'erc8183'].includes(rail) && input.budgetToken === nativeSymbol && input.tokenAddress) {
    return `Native ${nativeSymbol} paid settlement must not include tokenAddress; wrapped/ERC20 ${nativeSymbol}-like tokens need an explicit ERC20 token path`;
  }

  if (['standard', 'erc8183'].includes(rail) && input.budgetToken === nativeSymbol && input.escrowContractVersion !== 'native-eth') {
    return `Native ${nativeSymbol} paid settlement requires escrowContractVersion native-eth; legacy/ERC8183 paths are ERC20-only`;
  }

  if (['standard', 'erc8183'].includes(rail) && input.budgetToken === nativeSymbol && !chainEnvValue(chain, 'NATIVE_ETH_ESCROW_FACTORY_ADDRESS')) {
    return `Native ${nativeSymbol} direct wallet settlement is not configured on ${chain.key}`;
  }

  if (rail === 'erc8183' && input.escrowContractVersion !== 'erc8183') {
    return 'ERC-8183 direct wallet settlement requires escrowContractVersion erc8183';
  }

  if (rail === 'standard' && input.budgetToken !== nativeSymbol && input.escrowContractVersion && input.escrowContractVersion !== 'legacy') {
    return 'Standard ERC20 direct wallet settlement requires escrowContractVersion legacy';
  }

  if (['standard', 'erc8183'].includes(rail) && input.budgetToken && input.budgetToken !== nativeSymbol) {
    const configuredToken = chainEnvValue(chain, `${input.budgetToken.toUpperCase()}_TOKEN_ADDRESS`);
    if (!configuredToken) {
      return `${input.budgetToken} direct wallet settlement is not configured on ${chain.key}`;
    }
    if (!input.tokenAddress || input.tokenAddress.toLowerCase() !== configuredToken.toLowerCase()) {
      return `${input.budgetToken} direct wallet settlement must use the configured token address on ${chain.key}`;
    }
  }

  return null;
}

function parseWorkspaceJsonArray(value: unknown): unknown[] {
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

function normalizeJobWorkspace(workspace: any) {
  if (!workspace) return null;
  const latestVerification = workspace.verificationResults?.[0];
  const latestSnapshot = workspace.evidenceSnapshots?.[0];
  const actorDids = parseWorkspaceJsonArray(workspace.actorDids).filter((item): item is string => typeof item === 'string');
  const delegationRefs = parseWorkspaceJsonArray(workspace.ucanDelegationRefs)
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  const firstDelegation = delegationRefs[0] || {};
  const normalizedEvents = Array.isArray(workspace.events)
    ? workspace.events.map((event: any) => {
      if (!event.normalizedData || typeof event.normalizedData !== 'string') return null;
      try { return JSON.parse(event.normalizedData); } catch { return null; }
    }).filter(Boolean)
    : [];
  const latestReview = normalizedEvents.find((event: any) => event.reviewStatus)?.reviewStatus;
  const latestCi = normalizedEvents.find((event: any) => event.ciStatus)?.ciStatus;
  const signedEvidencePresent = Array.isArray(workspace.events)
    ? workspace.events.some((event: any) => event.signatureVerified && event.replayProtected)
    : false;
  return sanitizeWorkspacePayload({
    ...workspace,
    actorDids,
    actorDid: actorDids[0],
    ucanDelegationRefs: delegationRefs,
    ucanDelegationRef: typeof firstDelegation.ref === 'string' ? firstDelegation.ref : typeof firstDelegation.id === 'string' ? firstDelegation.id : undefined,
    branch: workspace.branchRef,
    repositoryUrl: workspace.repoUrl,
    gitlawbCloneUrl: workspace.cloneUrl,
    pullRequestRef: workspace.prRef,
    pullRequestNumber: workspace.prNumber,
    verificationStatus: workspace.latestVerificationStatus,
    verificationState: workspace.latestVerificationStatus,
    verificationSummary: latestVerification ? latestVerification.status : workspace.capabilitySummary,
    reviewStatus: latestReview || workspace.reviewStatus,
    ciStatus: latestCi || workspace.ciStatus,
    commitHash: workspace.commitSha,
    finalSnapshotRef: latestSnapshot?.evidenceHash,
    signedEvidencePresent,
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
  });
}

// ─── Trust Score (spec §6.2) ────────────────────────────────────

export function calculateTrustScore(agent: { avgRating: number; createdAt: Date }, jobsCompleted: number, disputesLost: number): number {
  const ageDays = (Date.now() - new Date(agent.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const raw = (jobsCompleted * 10) + (agent.avgRating * 20) - (disputesLost * 50) + (ageDays * 0.1);
  return Math.max(0, Math.min(1, raw / 100));
}

// ─── List Jobs ──────────────────────────────────────────────────

router.get('/', validate(paginationSchema, 'query'), async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit } = (req as any).validatedQuery;
  const { category, status, minBudget, maxBudget, search, includeAssigned } = req.query;

  const where: Prisma.JobWhereInput = {};
  if (category) where.category = category as any;
  if (status) where.status = status as any;
  else where.status = { in: ['OPEN', 'FUNDED'] };
  if (includeAssigned !== 'true') where.agentId = null;

  if (minBudget || maxBudget) {
    where.budgetAmount = {};
    if (minBudget) where.budgetAmount.gte = Number(minBudget);
    if (maxBudget) where.budgetAmount.lte = Number(maxBudget);
  }

  if (search && typeof search === 'string') {
    where.OR = [
      { title: { contains: search, } },
      { description: { contains: search, } },
    ];
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      include: {
        client: { select: { id: true, displayName: true, walletAddress: true } },
        agent: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { bids: true, submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.job.count({ where }),
  ]);

  res.json({ jobs: parseJsonArraysList(jobs), total, page, limit, pages: Math.ceil(total / limit) });
});

// ─── Get Job Detail ──────────────────────────────────────────────

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({
    where: { id: paramId(req) },
    include: {
      client: { select: { id: true, displayName: true, walletAddress: true } },
      agent: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          walletAddress: true,
          capabilities: true,
          avgRating: true,
          paymentPrivacyMode: true,
          px402Supported: true,
          probeMethod: true,
          probePriceUsd: true,
          probeDescription: true,
        },
      },
      bids: {
        include: { agent: { select: { id: true, name: true, avatarUrl: true, avgRating: true } } },
        orderBy: { createdAt: 'desc' },
      },
      submissions: { orderBy: { createdAt: 'desc' } },
      dispute: true,
      ratings: true,
      paymentLedger: {
        select: {
          id: true,
          rail: true,
          mode: true,
          amount: true,
          token: true,
          tokenSymbol: true,
          wallet: true,
          walletAddress: true,
          endpoint: true,
          escrowAddress: true,
          escrowContractVersion: true,
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
        orderBy: { createdAt: 'desc' },
      },
      workspace: {
        include: {
          events: { orderBy: { ingestedAt: 'desc' }, take: 10 },
          verificationResults: { orderBy: { verifiedAt: 'desc' }, take: 5 },
          evidenceSnapshots: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      },
    },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const parsed = parseJsonArrays(job);
  const escrowLifecycle = await loadEscrowLifecycleEvidence(job.id, parsed);
  res.json({
    ...parsed,
    workspace: normalizeJobWorkspace((parsed as any).workspace),
    escrowLifecycle,
  });
});

// ─── Create Job ──────────────────────────────────────────────────

router.post('/', requireAuth, requireConsent, validate(createJobSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const activeChain = getActiveChain();
  const network = req.body.network || activeChain.key;
  const chainId = req.body.chainId || activeChain.chainId;
  const configError = validateSettlementConfig({
    network,
    chainId,
    settlementRail: req.body.settlementRail,
    budgetAmount: req.body.budgetAmount,
    budgetToken: req.body.budgetToken,
    tokenAddress: req.body.tokenAddress,
    escrowContractVersion: req.body.escrowContractVersion,
  });
  if (configError) {
    res.status(400).json({ error: configError });
    return;
  }

  const lifecycle = resolveDirectWalletDeadline({
    settlementRail: req.body.settlementRail,
    deadline: req.body.deadline,
  });
  if (lifecycle.error) {
    res.status(400).json({ error: lifecycle.error });
    return;
  }

  const job = await prisma.job.create({
    data: {
      ...serializeArrays(req.body),
      clientId: req.auth!.userId,
      deadline: lifecycle.deadline ?? null,
      expiredAt: lifecycle.expiredAt ?? (req.body.expiredAt ? new Date(req.body.expiredAt) : null),
      network,
      chainId,
    },
    include: {
      client: { select: { id: true, displayName: true, walletAddress: true } },
    },
  });

  auditLog(req.auth!.walletAddress, 'JOB_CREATED', 'JOB', job.id, { category: job.category, budgetToken: job.budgetToken });
  wsService.broadcastAll('job:created', { id: job.id, title: job.title, category: job.category, budgetAmount: job.budgetAmount });
  wsService.broadcast('jobs', 'job:created', { id: job.id, title: job.title, category: job.category, budgetAmount: job.budgetAmount });
  res.status(201).json(job);
});

// ─── Record Settlement Receipt ───────────────────────────────────

router.post('/:id/settlement-receipts', requireAuth, requireConsent, validate(settlementReceiptSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({ where: { id: paramId(req) } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Not the client' }); return; }
  const body = req.body;
  try {
    assertSettlementInputMatchesJob(job, body);
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message });
    return;
  }

  let receipt;
  try {
    receipt = await verifyAndRecordSettlementReceipt(job.id, body);
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message });
    return;
  }
  const updatedJob = await prisma.job.update({
    where: { id: job.id },
    data: { settlementStatus: 'SETTLED' },
  });

  auditLog(req.auth!.walletAddress, 'SETTLEMENT_RECEIPT_RECORDED', 'JOB', job.id, {
    receiptHash: receipt.receiptHash,
    rail: receipt.rail,
    chainId: receipt.chainId,
  });

  res.status(201).json({
    id: receipt.id,
    receiptHash: receipt.receiptHash,
    status: receipt.status,
    settlementStatus: updatedJob.settlementStatus,
  });
});

// ─── Update Job ──────────────────────────────────────────────────

router.put('/:id', requireAuth, requireConsent, validate(updateJobSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.job.findUnique({ where: { id: paramId(req) } });
  if (!existing) { res.status(404).json({ error: 'Job not found' }); return; }
  if (existing.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Not your job' }); return; }
  if (existing.status !== 'OPEN') { res.status(400).json({ error: 'Can only update open jobs' }); return; }

  const configError = validateSettlementConfig({
    network: req.body.network || existing.network,
    chainId: req.body.chainId || existing.chainId,
    settlementRail: req.body.settlementRail || existing.settlementRail,
    budgetAmount: req.body.budgetAmount || existing.budgetAmount,
    budgetToken: existing.budgetToken,
    tokenAddress: req.body.tokenAddress || existing.tokenAddress,
    escrowContractVersion: req.body.escrowContractVersion || existing.escrowContractVersion,
  });
  if (configError) {
    res.status(400).json({ error: configError });
    return;
  }

  const updatedRail = req.body.settlementRail || existing.settlementRail;
  const updatedDeadline = req.body.deadline === undefined
    ? existing.deadline?.toISOString()
    : req.body.deadline;
  const lifecycle = resolveDirectWalletDeadline(
    { settlementRail: updatedRail, deadline: updatedDeadline },
    existing.createdAt,
  );
  if (lifecycle.error) {
    res.status(400).json({ error: lifecycle.error });
    return;
  }

  const job = await prisma.job.update({
    where: { id: paramId(req) },
    data: {
      ...serializeArrays(req.body),
      deadline: req.body.deadline === undefined ? undefined : lifecycle.deadline ?? null,
      expiredAt: isDirectWalletEscrowRail(updatedRail) ? lifecycle.expiredAt ?? null : undefined,
    },
  });
  res.json(job);
});

// ─── Cancel Job ──────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.job.findUnique({ where: { id: paramId(req) } });
  if (!existing) { res.status(404).json({ error: 'Job not found' }); return; }
  if (existing.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Not your job' }); return; }
  if (existing.status !== 'OPEN') { res.status(400).json({ error: 'Can only cancel open jobs' }); return; }
  if (isDirectWalletEscrowRail(existing.settlementRail) && (existing.escrowAddress || existing.onchainJobId)) {
    res.status(409).json({ error: 'Escrow-backed direct wallet jobs require wallet refund/cancel evidence before closure' });
    return;
  }

  const job = await prisma.job.update({
    where: { id: paramId(req) },
    data: { status: 'CANCELLED' },
  });

  auditLog(req.auth!.walletAddress, 'JOB_CANCELLED', 'JOB', job.id);
  wsService.broadcast(`job:${job.id}`, 'job:cancelled', { id: job.id });
  res.json(job);
});

// ─── Accept Job ──────────────────────────────────────────────────

router.post('/:id/accept', requireAuth, requireConsent, async (req: AuthRequest, res: Response): Promise<void> => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId required' }); return; }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const job = await prisma.job.findUnique({ where: { id: paramId(req) } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  const directWalletJob = isPaidDirectWalletRail(job);
  if ((!directWalletJob && job.status !== 'OPEN') || (directWalletJob && !['OPEN', 'FUNDED'].includes(job.status))) {
    res.status(400).json({ error: 'Job not open' });
    return;
  }
  if (job.agentId) {
    res.status(400).json({ error: 'Job already has an accepted agent' });
    return;
  }
  if (job.clientId !== req.auth!.userId) {
    res.status(403).json({ error: 'Only the job client can accept a bid' });
    return;
  }
  if (job.deadline && new Date(job.deadline) < new Date()) {
    res.status(400).json({ error: 'Job deadline has passed' });
    return;
  }

  // C1 fix: Verify the agent actually placed a bid on this job
  const bid = await prisma.bid.findFirst({
    where: { jobId: job.id, agentId },
  });
  if (!bid) {
    res.status(400).json({ error: 'Agent has not placed a bid on this job' });
    return;
  }

  if (req.body.workspaceProvider && !['github', 'gitlawb'].includes(req.body.workspaceProvider)) {
    res.status(400).json({ error: 'Unsupported workspace provider' });
    return;
  }

  let directWalletLifecycle: EscrowLifecycleEvidence | null = null;
  try {
    directWalletLifecycle = await requireDirectWalletLifecycle(
      job,
      ['FUNDED_OPEN'],
      'Paid direct-wallet bid acceptance requires finalized indexed funded escrow state',
    );
  } catch (error: any) {
    res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
    return;
  }

  const updated = await prisma.job.update({
    where: { id: paramId(req) },
    data: {
      status: directWalletLifecycle ? 'FUNDED' : 'IN_PROGRESS',
      settlementStatus: directWalletLifecycle ? 'FUNDED' : job.settlementStatus,
      agentId,
      acceptedAt: new Date(),
      workspaceProvider: req.body.workspaceProvider || job.workspaceProvider,
    },
    include: { agent: { select: { id: true, name: true } } },
  });

  await prisma.bid.updateMany({
    where: { jobId: job.id },
    data: { selected: false },
  });
  await prisma.bid.update({
    where: { jobId_agentId: { jobId: job.id, agentId } },
    data: { selected: true },
  });

  if (req.body.workspaceProvider && !directWalletLifecycle) {
    try {
      await createOrLinkWorkspace(
        {
          ...updated,
          agent: { handlerId: agent.handlerId, walletAddress: agent.walletAddress },
        },
        { userId: req.auth!.userId, walletAddress: req.auth!.walletAddress },
        {
          provider: req.body.workspaceProvider,
          mode: 'create',
          nodeUrl: req.body.workspaceNodeUrl,
          actorDids: [],
          ucanDelegationRefs: [],
        },
      );
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message || 'Workspace creation failed' });
      return;
    }
  }

  auditLog(req.auth!.walletAddress, 'BID_ACCEPTED', 'JOB', job.id, { agentId });
  await prisma.notification.create({
    data: {
      userId: agent.handlerId,
      type: 'JOB_ACCEPTED',
      title: 'Job accepted',
      message: `Your agent ${updated.agent?.name || 'agent'} was accepted for "${job.title}".`,
      data: JSON.stringify({ jobId: job.id, agentId, href: jobUrlPath(job.id) }),
    },
  });
  wsService.broadcast(`job:${job.id}`, 'job:accepted', { id: job.id, agentId, agentName: updated.agent?.name });
  wsService.broadcastAll('job:accepted', { id: job.id, agentId, agentName: updated.agent?.name });
  wsService.sendToUser(agent.handlerId, 'notification', {
    type: 'JOB_ACCEPTED',
    title: 'Job accepted',
    message: `Your agent ${updated.agent?.name || 'agent'} was accepted for "${job.title}".`,
    jobId: job.id,
    href: jobUrlPath(job.id),
  });
  res.json(updated);
});

// ─── Submit Bid ──────────────────────────────────────────────────

router.post('/:id/bid', requireAuth, requireConsent, validate(bidSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const { agentId } = req.body;
  if (!agentId) { res.status(400).json({ error: 'agentId required in body' }); return; }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.handlerId !== req.auth!.userId) {
    res.status(403).json({ error: 'Not authorized for this agent' });
    return;
  }

  const job = await prisma.job.findUnique({ where: { id: paramId(req) } });
  const directWalletBidOpen = job && isPaidDirectWalletRail(job) && !job.agentId && ['OPEN', 'FUNDED'].includes(job.status);
  if (!job || (job.status !== 'OPEN' && !directWalletBidOpen)) {
    res.status(400).json({ error: 'Job not available for bidding' });
    return;
  }
  if (job.clientId === req.auth!.userId) {
    res.status(403).json({ error: 'Cannot bid on your own job' });
    return;
  }
  if (job.deadline && new Date(job.deadline) < new Date()) {
    res.status(400).json({ error: 'Job deadline has passed' });
    return;
  }

  const existingBid = await prisma.bid.findUnique({
    where: { jobId_agentId: { jobId: paramId(req), agentId } },
  });
  if (existingBid) {
    res.status(409).json({ error: 'Bid already placed for this agent on this job' });
    return;
  }

  const bid = await prisma.bid.create({
    data: { jobId: paramId(req), agentId, ...req.body },
    include: { agent: { select: { id: true, name: true, avatarUrl: true } } },
  });

  auditLog(req.auth!.walletAddress, 'BID_PLACED', 'BID', bid.id, { jobId: job.id, agentId: bid.agentId });
  await prisma.notification.create({
    data: {
      userId: job.clientId,
      type: 'BID_RECEIVED',
      title: 'New bid received',
      message: `${bid.agent.name} placed a bid on "${job.title}".`,
      data: JSON.stringify({ jobId: job.id, bidId: bid.id, agentId: bid.agentId, href: jobUrlPath(job.id) }),
    },
  });
  wsService.sendToUser(job.clientId, 'notification', {
    type: 'BID_RECEIVED',
    title: 'New bid received',
    message: `${bid.agent.name} placed a bid on "${job.title}".`,
    jobId: job.id,
    bidId: bid.id,
    agentName: bid.agent.name,
    href: jobUrlPath(job.id),
  });
  res.status(201).json(bid);
});

// ─── Submit Deliverable ──────────────────────────────────────────

router.post('/:id/submit', requireAuth, requireConsent, validate(submitDeliverableSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({ where: { id: paramId(req) }, include: { agent: true } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (!job.agent || (job.agent.handlerId !== req.auth!.userId && job.agent.walletAddress.toLowerCase() !== req.auth!.walletAddress)) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }
  if (job.deadline && new Date(job.deadline) < new Date()) {
    res.status(400).json({ error: 'Job deadline has passed' });
    return;
  }

  let directWalletLifecycle: EscrowLifecycleEvidence | null = null;
  if (isPaidDirectWalletRail(job)) {
    const deliverableEvidenceEventName = expectedDirectWalletEscrowVersion(job) === 'erc8183'
      ? 'JobSubmitted'
      : 'DeliverableSubmitted';
    try {
      directWalletLifecycle = await requireDirectWalletLifecycle(
        job,
        ['DELIVERED_ONCHAIN'],
        `Paid direct-wallet deliverable submission requires finalized indexed ${deliverableEvidenceEventName} evidence`,
      );
    } catch (error: any) {
      res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
      return;
    }
  } else if (job.status !== 'IN_PROGRESS') {
    res.status(400).json({ error: 'Job not in progress' });
    return;
  }

  const existingSubmission = directWalletLifecycle
    ? await prisma.submission.findFirst({ where: { jobId: job.id, deliverableHash: req.body.deliverableHash } })
    : null;
  if (existingSubmission) {
    res.json(existingSubmission);
    return;
  }

  const [submission] = await Promise.all([
    prisma.submission.create({
      data: { jobId: paramId(req), deliverableHash: req.body.deliverableHash, notes: req.body.notes },
    }),
    prisma.job.update({
      where: { id: paramId(req) },
      data: { status: directWalletLifecycle?.jobStatusProjection || 'PENDING_REVIEW' },
    }),
  ]);

  auditLog(req.auth!.walletAddress, 'DELIVERABLE_SUBMITTED', 'JOB', job.id);
  wsService.broadcast(`job:${job.id}`, 'job:submitted', { id: job.id, deliverableHash: req.body.deliverableHash });
  wsService.sendToUser(job.clientId, 'notification', { type: 'JOB_SUBMITTED', jobId: job.id });
  res.status(201).json(submission);
});

// ─── Approve Deliverable ─────────────────────────────────────────

router.post('/:id/approve', requireAuth, requireConsent, validate(approveJobSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({ where: { id: paramId(req) }, include: { agent: true } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
  if (job.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Not the client' }); return; }

  if (!job.agentId || !job.agent) {
    res.status(400).json({ error: 'No agent assigned to this job' });
    return;
  }

  let directWalletLifecycle: EscrowLifecycleEvidence | null = null;
  if (isPaidDirectWalletRail(job)) {
    try {
      const lifecycle = await requireDirectWalletLifecycle(
        job,
        ['RELEASED_ONCHAIN', 'RESOLVED_ONCHAIN'],
        'Paid direct-wallet approval requires finalized indexed release or dispute-resolution evidence',
      );
      if (!lifecycle) {
        throw new SettlementError('Paid direct-wallet approval requires finalized indexed release or dispute-resolution evidence', 409);
      }
      directWalletLifecycle = lifecycle;
      await requireDirectWalletReleaseLedger(job, lifecycle, req.body || {});
    } catch (error: any) {
      res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
      return;
    }
  } else {
    if (job.status !== 'PENDING_REVIEW') { res.status(400).json({ error: 'Job not pending review' }); return; }
    try {
      await assertJobCanComplete(job, req.body || {});
    } catch (error: any) {
      res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
      return;
    }
  }

  const updated = await prisma.job.update({
    where: { id: paramId(req) },
    data: {
      status: directWalletLifecycle?.jobStatusProjection === 'RESOLVED' ? 'RESOLVED' : 'COMPLETED',
      settlementStatus: 'SETTLED',
      evaluatorWallet: req.auth!.walletAddress,
      completedByEvaluatorAt: new Date(),
    },
  });

  auditLog(req.auth!.walletAddress, 'JOB_APPROVED', 'JOB', job.id, { agentId: job.agentId });
  if (job.agent) {
    wsService.sendToUser(job.agent.handlerId, 'notification', { type: 'JOB_APPROVED', jobId: job.id });
  }
  wsService.broadcast(`job:${job.id}`, 'job:approved', { id: job.id });
  res.json(updated);
});

// ─── Open Dispute ────────────────────────────────────────────────

router.post('/:id/dispute', requireAuth, requireConsent, validate(disputeSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({ where: { id: paramId(req) }, include: { agent: true } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  if (isPaidDirectWalletRail(job)) {
    try {
      await requireDirectWalletLifecycle(
        job,
        ['DISPUTED_ONCHAIN'],
        'Paid direct-wallet dispute creation requires finalized indexed DisputeOpened evidence',
      );
    } catch (error: any) {
      res.status(error instanceof SettlementError ? error.statusCode : 409).json({ error: error.message });
      return;
    }
  } else if (!['IN_PROGRESS', 'PENDING_REVIEW'].includes(job.status)) {
    res.status(400).json({ error: 'Cannot dispute in current state' });
    return;
  }

  const isClient = job.clientId === req.auth!.userId;
  const isAgentSide = job.agent?.handlerId === req.auth!.userId;
  if (!isClient && !isAgentSide) { res.status(403).json({ error: 'Not authorized' }); return; }

  const existingDispute = await prisma.dispute.findUnique({ where: { jobId: job.id } });
  const [dispute] = await Promise.all([
    existingDispute
      ? prisma.dispute.update({
          where: { id: existingDispute.id },
          data: { reason: req.body.reason || existingDispute.reason },
        })
      : prisma.dispute.create({
          data: { jobId: paramId(req), reason: req.body.reason, openedBy: req.auth!.walletAddress },
        }),
    prisma.job.update({
      where: { id: paramId(req) },
      data: { status: 'DISPUTED' },
    }),
  ]);

  auditLog(req.auth!.walletAddress, 'DISPUTE_OPENED', 'DISPUTE', dispute.id, { jobId: job.id });
  wsService.broadcast(`job:${job.id}`, 'job:disputed', { id: job.id });
  res.status(201).json(dispute);
});

// ─── Rate Job ────────────────────────────────────────────────────

router.post('/:id/rate', requireAuth, requireConsent, validate(ratingSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const job = await prisma.job.findUnique({ where: { id: paramId(req) } });
  if (!job || job.status !== 'COMPLETED') {
    res.status(400).json({ error: 'Can only rate completed jobs' });
    return;
  }
  if (job.clientId !== req.auth!.userId) { res.status(403).json({ error: 'Only client can rate' }); return; }
  if (!job.agentId) { res.status(400).json({ error: 'No agent assigned' }); return; }

  const existingRating = await prisma.rating.findUnique({
    where: { jobId_userId: { jobId: paramId(req), userId: req.auth!.userId } },
  });
  if (existingRating) {
    res.status(409).json({ error: 'You have already rated this job' });
    return;
  }

  const rating = await prisma.rating.create({
    data: { jobId: paramId(req), agentId: job.agentId, userId: req.auth!.userId, score: req.body.score, comment: req.body.comment },
  });

  // Update agent average rating + trust score
  const agg = await prisma.rating.aggregate({ where: { agentId: job.agentId }, _avg: { score: true } });
  if (agg._avg.score !== null) {
    const agent = await prisma.agent.findUnique({ where: { id: job.agentId } });
    if (agent) {
      const jobsCompleted = await prisma.job.count({ where: { agentId: job.agentId, status: 'COMPLETED' } });
      const disputesLost = await prisma.dispute.count({
        where: {
          job: { agentId: job.agentId },
          status: 'RESOLVED',
          agentBps: 0,
        },
      });
      const trustScore = calculateTrustScore(
        { avgRating: agg._avg.score, createdAt: agent.createdAt },
        jobsCompleted,
        disputesLost,
      );
      await prisma.agent.update({
        where: { id: job.agentId },
        data: { avgRating: agg._avg.score, trustScore },
      });
    }
  }

  auditLog(req.auth!.walletAddress, 'AGENT_RATED', 'JOB', job.id, { agentId: job.agentId, score: req.body.score });
  res.json(rating);
});

export default router;
