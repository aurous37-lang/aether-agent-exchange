import prisma from '../lib/prisma';
import { normalizeAddress } from './settlement';

export type CanonicalEscrowState =
  | 'UNFUNDED'
  | 'FUNDED_OPEN'
  | 'ACCEPTED_ONCHAIN'
  | 'DELIVERED_ONCHAIN'
  | 'RELEASED_ONCHAIN'
  | 'REFUNDED_ONCHAIN'
  | 'DISPUTED_ONCHAIN'
  | 'RESOLVED_ONCHAIN'
  | 'REORGED'
  | 'FAILED'
  | 'UNKNOWN';

export type NextRequiredActor = 'client' | 'agent' | 'arbiter' | 'indexer' | 'none';
export type NextAction =
  | 'FUND_ESCROW'
  | 'ACCEPT_BID_BACKEND'
  | 'START_WORK_ONCHAIN'
  | 'SUBMIT_DELIVERABLE_ONCHAIN'
  | 'WAIT_INDEXER'
  | 'APPROVE_RELEASE_ONCHAIN'
  | 'OPEN_DISPUTE_ONCHAIN'
  | 'RESOLVE_DISPUTE_ONCHAIN'
  | 'CLAIM_REFUND_ONCHAIN'
  | 'FINALIZED';

const DIRECT_WALLET_ESCROW_RAILS = new Set(['standard', 'erc8183']);

export interface EscrowLifecycleEvidence {
  indexerSchemaReady: boolean;
  state: any | null;
  events: any[];
  canonicalState: CanonicalEscrowState;
  jobStatusProjection?: string;
  nextRequiredActor: NextRequiredActor;
  nextAction: NextAction;
  actionAvailability: Record<string, { enabled: boolean; reason?: string }>;
  requiredConfirmations: number;
  currentConfirmations: number;
  finalityStatus: string;
  missingEvidence: string[];
}

function isPaidDirectWalletJob(job: any): boolean {
  return Number(job?.budgetAmount || 0) > 0 && DIRECT_WALLET_ESCROW_RAILS.has(job?.settlementRail || '');
}

function canonicalStateFromIndexed(state?: any | null): CanonicalEscrowState {
  if (!state) return 'UNKNOWN';
  if (state.finalityStatus === 'REORGED') return 'REORGED';
  if (state.finalityStatus === 'FAILED') return 'FAILED';

  switch (state.state) {
    case 'UNFUNDED': return 'UNFUNDED';
    case 'FUNDED': return 'FUNDED_OPEN';
    case 'IN_PROGRESS': return 'ACCEPTED_ONCHAIN';
    case 'PENDING_REVIEW': return 'DELIVERED_ONCHAIN';
    case 'COMPLETED': return 'RELEASED_ONCHAIN';
    case 'CANCELLED': return 'REFUNDED_ONCHAIN';
    case 'DISPUTED': return 'DISPUTED_ONCHAIN';
    case 'RESOLVED': return 'RESOLVED_ONCHAIN';
    default: return 'UNKNOWN';
  }
}

function projectionForState(canonicalState: CanonicalEscrowState): string | undefined {
  switch (canonicalState) {
    case 'FUNDED_OPEN': return 'FUNDED';
    case 'ACCEPTED_ONCHAIN': return 'IN_PROGRESS';
    case 'DELIVERED_ONCHAIN': return 'PENDING_REVIEW';
    case 'RELEASED_ONCHAIN': return 'COMPLETED';
    case 'REFUNDED_ONCHAIN': return 'CANCELLED';
    case 'DISPUTED_ONCHAIN': return 'DISPUTED';
    case 'RESOLVED_ONCHAIN': return 'RESOLVED';
    default: return undefined;
  }
}

function isErc8183Lifecycle(job: any, state?: any | null): boolean {
  return job?.settlementRail === 'erc8183' || job?.escrowContractVersion === 'erc8183' || state?.escrowContractVersion === 'erc8183';
}

function actionForState(job: any, canonicalState: CanonicalEscrowState, indexerReady: boolean): { actor: NextRequiredActor; action: NextAction } {
  if (!isPaidDirectWalletJob(job)) return { actor: 'none', action: 'FINALIZED' };
  if (!indexerReady) return { actor: 'indexer', action: 'WAIT_INDEXER' };

  switch (canonicalState) {
    case 'UNKNOWN':
    case 'UNFUNDED':
      return { actor: 'client', action: 'FUND_ESCROW' };
    case 'FUNDED_OPEN':
      if (!job.agentId) return { actor: 'client', action: 'ACCEPT_BID_BACKEND' };
      return isErc8183Lifecycle(job)
        ? { actor: 'agent', action: 'SUBMIT_DELIVERABLE_ONCHAIN' }
        : { actor: 'agent', action: 'START_WORK_ONCHAIN' };
    case 'ACCEPTED_ONCHAIN':
      return { actor: 'agent', action: 'SUBMIT_DELIVERABLE_ONCHAIN' };
    case 'DELIVERED_ONCHAIN':
      return { actor: 'client', action: 'APPROVE_RELEASE_ONCHAIN' };
    case 'DISPUTED_ONCHAIN':
      return { actor: 'arbiter', action: 'RESOLVE_DISPUTE_ONCHAIN' };
    case 'REORGED':
    case 'FAILED':
      return { actor: 'indexer', action: 'WAIT_INDEXER' };
    case 'RELEASED_ONCHAIN':
    case 'REFUNDED_ONCHAIN':
    case 'RESOLVED_ONCHAIN':
      return { actor: 'none', action: 'FINALIZED' };
    default:
      return { actor: 'indexer', action: 'WAIT_INDEXER' };
  }
}

function enabledAction(nextAction: NextAction, action: NextAction, reason: string) {
  return nextAction === action ? { enabled: true } : { enabled: false, reason };
}

export function deriveEscrowLifecycleContract(job: any, lifecycle: { indexerSchemaReady: boolean; state: any | null; events: any[] }): EscrowLifecycleEvidence {
  const canonicalState = canonicalStateFromIndexed(lifecycle.state);
  const finalityStatus = lifecycle.state?.finalityStatus || (lifecycle.indexerSchemaReady ? 'PENDING' : 'UNAVAILABLE');
  const currentConfirmations = lifecycle.state?.confirmations || 0;
  const requiredConfirmations = lifecycle.events[0]?.requiredConfirmations || 0;
  const { actor, action } = actionForState(job, canonicalState, lifecycle.indexerSchemaReady);
  const erc8183Lifecycle = isErc8183Lifecycle(job, lifecycle.state);
  const missingEvidence: string[] = [];

  if (isPaidDirectWalletJob(job)) {
    if (!lifecycle.indexerSchemaReady) missingEvidence.push('indexer schema is not migrated');
    if (!lifecycle.state) missingEvidence.push('no indexed escrow lifecycle state');
    if (finalityStatus !== 'FINAL' && lifecycle.state) missingEvidence.push(`latest lifecycle state is ${finalityStatus}`);
  }

  return {
    indexerSchemaReady: lifecycle.indexerSchemaReady,
    state: lifecycle.state,
    events: lifecycle.events,
    canonicalState,
    jobStatusProjection: projectionForState(canonicalState),
    nextRequiredActor: actor,
    nextAction: action,
    actionAvailability: {
      acceptBidBackend: enabledAction(action, 'ACCEPT_BID_BACKEND', 'requires finalized funded escrow state and no accepted agent'),
      startWorkOnchain: enabledAction(action, 'START_WORK_ONCHAIN', erc8183Lifecycle
        ? 'ERC-8183 has no separate work-start transaction; submit the deliverable on-chain after backend bid acceptance'
        : 'requires backend bid acceptance and finalized funded escrow state'),
      submitDeliverableOnchain: enabledAction(action, 'SUBMIT_DELIVERABLE_ONCHAIN', erc8183Lifecycle
        ? 'requires backend bid acceptance and finalized funded ERC-8183 escrow state'
        : 'requires finalized on-chain work start'),
      approveReleaseOnchain: enabledAction(action, 'APPROVE_RELEASE_ONCHAIN', 'requires finalized on-chain deliverable submission'),
      openDisputeOnchain: ['ACCEPTED_ONCHAIN', 'DELIVERED_ONCHAIN'].includes(canonicalState)
        ? { enabled: true }
        : { enabled: false, reason: 'requires finalized in-progress or pending-review escrow state' },
      resolveDisputeOnchain: enabledAction(action, 'RESOLVE_DISPUTE_ONCHAIN', 'requires finalized on-chain dispute'),
      claimRefundOnchain: enabledAction(action, 'CLAIM_REFUND_ONCHAIN', 'requires refundable funded escrow state'),
    },
    requiredConfirmations,
    currentConfirmations,
    finalityStatus,
    missingEvidence,
  };
}

export async function loadEscrowLifecycleEvidence(jobId: string, job?: any): Promise<EscrowLifecycleEvidence> {
  try {
    const stateByJob = await (prisma as any).escrowLifecycleState.findUnique({ where: { jobId } });
    const escrowAddress = normalizeAddress(job?.escrowAddress || stateByJob?.escrowAddress);
    const chainId = Number(job?.chainId || stateByJob?.chainId || 0);
    const state = stateByJob || (escrowAddress && chainId
      ? await (prisma as any).escrowLifecycleState.findUnique({
          where: { chainId_escrowAddress: { chainId, escrowAddress } },
        })
      : null);
    const eventWhere = escrowAddress && chainId
      ? {
          OR: [
            { jobId },
            { chainId, escrowAddress },
          ],
        }
      : { jobId };
    const rawEvents = await (prisma as any).indexedChainEvent.findMany({
      where: eventWhere,
      take: 100,
    });
    const events = rawEvents.sort((a: any, b: any) => {
      const blockDiff = BigInt(a.blockNumber || '0') - BigInt(b.blockNumber || '0');
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;
      const txDiff = Number(a.transactionIndex ?? 0) - Number(b.transactionIndex ?? 0);
      if (txDiff !== 0) return txDiff;
      return Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
    });
    return deriveEscrowLifecycleContract(job || { id: jobId }, {
      indexerSchemaReady: true,
      state,
      events,
    });
  } catch {
    return deriveEscrowLifecycleContract(job || { id: jobId }, {
      indexerSchemaReady: false,
      state: null,
      events: [],
    });
  }
}

export function isPaidDirectWalletRail(job: any): boolean {
  return isPaidDirectWalletJob(job);
}
