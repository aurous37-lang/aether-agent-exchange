import { createHash } from 'crypto';
import { Interface, JsonRpcProvider, type Log } from 'ethers';
import prisma from '../lib/prisma';
import {
  CHAINS,
  chainEnvValue,
  rpcUrlsForChain,
  type ChainConfig,
  type ChainKey,
} from '../config/chains';
import { normalizeAddress, normalizeHash } from './settlement';
import { wsService } from './websocket';

const FACTORY_ABI = [
  'event EscrowCreated(bytes32 indexed jobId, address escrow, address indexed client, uint256 amount)',
] as const;

const ERC8183_FACTORY_ABI = [
  'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)',
  'event ProviderSet(uint256 indexed jobId, address indexed provider)',
  'event BudgetSet(uint256 indexed jobId, uint256 amount)',
  'event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)',
  'event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)',
  'event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)',
  'event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason)',
  'event JobExpired(uint256 indexed jobId)',
  'event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)',
  'event Refunded(uint256 indexed jobId, address indexed client, uint256 amount)',
  'event PlatformFeePaid(uint256 indexed jobId, address indexed feeCollector, uint256 amount)',
  'function getEscrow(uint256 jobId) view returns (address)',
  'function paymentToken() view returns (address)',
] as const;

const ESCROW_ABI = [
  'event EscrowFunded(bytes32 indexed jobId, address indexed client, uint256 amount)',
  'event WorkStarted(bytes32 indexed jobId, bytes32 indexed agentId)',
  'event DeliverableSubmitted(bytes32 indexed jobId, bytes32 deliverableHash)',
  'event JobApproved(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee)',
  'event JobAutoReleased(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee)',
  'event DisputeOpened(bytes32 indexed jobId, address indexed disputedBy, string reason)',
  'event DisputeResolved(bytes32 indexed jobId, address indexed recipient, uint256 recipientAmount, uint256 otherAmount)',
  'event JobCancelled(bytes32 indexed jobId)',
  'event AcceptanceTimeoutRefunded(bytes32 indexed jobId, address indexed client, uint256 amount)',
  'event NativeFeePaid(bytes32 indexed jobId, address indexed feeCollector, uint256 amount)',
] as const;

const ESCROW_DETAILS_ABI = [
  'function getDetails() view returns (bytes32 jobId, address client, address paymentToken, uint256 escrowAmount, uint8 state, bytes32 agentId, address agentWallet, bytes32 deliverableHash, uint256 reviewDeadline)',
] as const;

const ERC8183_ESCROW_ABI = [
  'function jobId() view returns (uint256)',
  'function factory() view returns (address)',
  'function paymentToken() view returns (address)',
] as const;

const factoryInterface = new Interface([...FACTORY_ABI]);
const erc8183FactoryInterface = new Interface([...ERC8183_FACTORY_ABI]);
const escrowInterface = new Interface([...ESCROW_ABI]);
const escrowDetailsInterface = new Interface([...ESCROW_DETAILS_ABI]);
const erc8183EscrowInterface = new Interface([...ERC8183_ESCROW_ABI]);
const DEFAULT_BATCH_BLOCKS = Number(process.env.AAE_CHAIN_INDEXER_BATCH_BLOCKS || '2000');
const DEFAULT_INTERVAL_MS = Number(process.env.AAE_CHAIN_INDEXER_INTERVAL_MS || '30000');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const FACTORY_BINDING_VERIFIED = 'FACTORY_EVENT_VERIFIED';
const FACTORY_BINDING_UNVERIFIED = 'FACTORY_EVENT_UNVERIFIED';
const FACTORY_BINDING_UNBOUND = 'UNBOUND';

export type EscrowLifecycleEventInput = {
  chainKey: ChainKey;
  chainId: number;
  caip2Network: string;
  txHash: string;
  logIndex: number;
  blockNumber: string | number;
  blockHash: string;
  transactionIndex?: number | null;
  contractAddress: string;
  factoryAddress?: string | null;
  escrowAddress?: string | null;
  eventName: string;
  lifecycleType?: string | null;
  onchainJobId?: string | null;
  actorAddress?: string | null;
  clientAddress?: string | null;
  agentAddress?: string | null;
  recipientAddress?: string | null;
  amountGross?: string | null;
  agentPayout?: string | null;
  platformFee?: string | null;
  tokenAddress?: string | null;
  tokenSymbol?: string | null;
  escrowContractVersion?: string | null;
  factoryBound?: boolean;
  factoryBindingStatus?: string | null;
  decodedArgs?: Record<string, unknown>;
  finalityStatus?: 'PENDING' | 'FINAL' | 'REORGED' | 'FAILED';
  confirmations?: number;
};

export type ChainIndexerRunSummary = {
  chainKey: ChainKey;
  indexedEvents: number;
  reorgedEvents?: number;
  recomputedEscrows?: number;
  fromBlock?: number;
  toBlock?: number;
  skipped?: string;
  error?: string;
};

type ChainIndexerScanKind = 'forward' | 'reorg';

export type ChainIndexerScanRange = {
  kind: ChainIndexerScanKind;
  fromBlock: number;
  toBlock: number;
};

export type ChainIndexerScanPlan = {
  ranges: ChainIndexerScanRange[];
  nextLastIndexedBlock: number;
  nextReorgScanBlock?: number;
};

export function planChainIndexerRanges(input: {
  lastIndexedBlock: number;
  finalizedBlock: number;
  startBlock: number;
  reorgDepth: number;
  maxBlocks: number;
  reorgScanBlock?: number | null;
}): ChainIndexerScanPlan {
  const maxBlocks = Math.max(1, Math.floor(input.maxBlocks || 1));
  const startBlock = Math.max(0, Math.floor(input.startBlock || 0));
  const finalizedBlock = Math.max(0, Math.floor(input.finalizedBlock || 0));
  const lastIndexedBlock = Math.max(0, Math.floor(input.lastIndexedBlock || 0));
  const reorgDepth = Math.max(0, Math.floor(input.reorgDepth || 0));
  const ranges: ChainIndexerScanRange[] = [];
  let nextLastIndexedBlock = lastIndexedBlock;

  const forwardFrom = Math.max(startBlock, lastIndexedBlock + 1);
  if (forwardFrom <= finalizedBlock) {
    const forwardTo = Math.min(finalizedBlock, forwardFrom + maxBlocks - 1);
    ranges.push({ kind: 'forward', fromBlock: forwardFrom, toBlock: forwardTo });
    nextLastIndexedBlock = Math.max(nextLastIndexedBlock, forwardTo);
  }

  let nextReorgScanBlock: number | undefined;
  if (reorgDepth > 0 && nextLastIndexedBlock >= startBlock) {
    const reorgWindowStart = Math.max(startBlock, nextLastIndexedBlock - reorgDepth + 1);
    const reorgWindowEnd = nextLastIndexedBlock;
    if (reorgWindowStart <= reorgWindowEnd) {
      const parsedReorgScanBlock = Number(input.reorgScanBlock);
      let reorgFrom = Number.isFinite(parsedReorgScanBlock)
        ? Math.floor(parsedReorgScanBlock)
        : reorgWindowStart;
      if (reorgFrom < reorgWindowStart || reorgFrom > reorgWindowEnd) {
        reorgFrom = reorgWindowStart;
      }
      const reorgTo = Math.min(reorgWindowEnd, reorgFrom + maxBlocks - 1);
      ranges.push({ kind: 'reorg', fromBlock: reorgFrom, toBlock: reorgTo });
      nextReorgScanBlock = reorgTo >= reorgWindowEnd ? reorgWindowStart : reorgTo + 1;
    }
  }

  return { ranges, nextLastIndexedBlock, nextReorgScanBlock };
}

function eventTopic(eventInterface: Interface, name: string): string {
  const event = eventInterface.getEvent(name);
  if (!event) throw new Error(`Unknown event ${name}`);
  return event.topicHash;
}

function bigintString(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function hexString(value: unknown): string | undefined {
  if (typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)) return value.toLowerCase();
  return undefined;
}

function uintToBytes32(value: unknown): string | undefined {
  const raw = bigintString(value);
  if (!raw) return undefined;
  try {
    const hex = BigInt(raw).toString(16);
    if (hex.length > 64) return undefined;
    return `0x${hex.padStart(64, '0')}`;
  } catch {
    return undefined;
  }
}

function proofHash(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function normalizedAddress(value?: string | null): string | null {
  const normalized = normalizeAddress(value);
  return normalized && /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

type FactoryKind = 'legacy' | 'native-eth' | 'erc8183';

function configuredFactoryKind(chain: ChainConfig, factoryAddress?: string | null): FactoryKind | null {
  const normalizedFactory = normalizedAddress(factoryAddress);
  if (!normalizedFactory) return null;

  const legacyFactory = normalizedAddress(chainEnvValue(chain, 'ESCROW_FACTORY_ADDRESS'));
  if (legacyFactory && normalizedFactory === legacyFactory) return 'legacy';

  const nativeFactory = normalizedAddress(chainEnvValue(chain, 'NATIVE_ETH_ESCROW_FACTORY_ADDRESS'));
  if (nativeFactory && normalizedFactory === nativeFactory) return 'native-eth';

  const erc8183Factory = normalizedAddress(chainEnvValue(chain, 'ERC8183_FACTORY_ADDRESS'));
  if (erc8183Factory && normalizedFactory === erc8183Factory) return 'erc8183';

  return null;
}

function tokenSymbolForAddress(chain: ChainConfig, tokenAddress?: string | null): string | undefined {
  const normalizedToken = normalizedAddress(tokenAddress);
  if (!normalizedToken || normalizedToken === ZERO_ADDRESS) return chain.nativeCurrency.symbol;

  for (const symbol of chain.supportedTokens) {
    const configuredToken = normalizedAddress(chainEnvValue(chain, `${symbol.toUpperCase()}_TOKEN_ADDRESS`));
    if (configuredToken && configuredToken === normalizedToken) return symbol.toUpperCase();
  }

  return undefined;
}

function factoryTokenDefaults(chain: ChainConfig, kind: FactoryKind): { tokenAddress?: string | null; tokenSymbol?: string; escrowContractVersion: string } {
  if (kind === 'native-eth') {
    return {
      tokenAddress: null,
      tokenSymbol: chain.nativeCurrency.symbol,
      escrowContractVersion: 'native-eth',
    };
  }

  if (kind === 'erc8183') {
    return { escrowContractVersion: 'erc8183' };
  }

  return { escrowContractVersion: 'legacy' };
}

function isFactoryCreationEvent(eventName: string): boolean {
  return eventName === 'EscrowCreated' || eventName === 'JobCreated';
}

function factoryBindingStatus(input: EscrowLifecycleEventInput): string {
  if (!isFactoryCreationEvent(input.eventName)) return FACTORY_BINDING_UNBOUND;
  return input.factoryBindingStatus || (input.factoryBound ? FACTORY_BINDING_VERIFIED : FACTORY_BINDING_UNVERIFIED);
}

function factoryBindingStateData(input: EscrowLifecycleEventInput, eventProofHash: string, timestamp = new Date()): Record<string, unknown> | null {
  if (!isFactoryCreationEvent(input.eventName)) return null;

  const data = {
    factoryBound: input.factoryBound === true,
    factoryBindingStatus: factoryBindingStatus(input),
    factoryBindingProofHash: eventProofHash,
    factoryBindingTxHash: normalizeHash(input.txHash),
    factoryBindingBlockNumber: String(input.blockNumber),
    factoryBindingLogIndex: input.logIndex,
    factoryAddress: normalizedAddress(input.factoryAddress) || undefined,
    onchainJobId: normalizeHash(input.onchainJobId) || undefined,
    escrowContractVersion: input.escrowContractVersion || undefined,
    tokenAddress: normalizedAddress(input.tokenAddress),
    tokenSymbol: input.tokenSymbol || undefined,
    amountGross: input.amountGross || undefined,
    clientAddress: normalizedAddress(input.clientAddress) || undefined,
    createdOnchainAt: timestamp,
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function eventMayUpdateFactoryBoundAmount(eventName: string): boolean {
  return ['EscrowCreated', 'EscrowFunded', 'AcceptanceTimeoutRefunded', 'BudgetSet', 'JobFunded', 'Refunded'].includes(eventName);
}

function lifecycleStateMetadataData(input: EscrowLifecycleEventInput, job: any | null, currentState?: any | null): Record<string, unknown> {
  const factoryProtected = Boolean(currentState?.factoryBound) && !isFactoryCreationEvent(input.eventName);
  const data: Record<string, unknown> = {
    factoryAddress: normalizedAddress(input.factoryAddress) || undefined,
    onchainJobId: normalizeHash(input.onchainJobId) || undefined,
    agentPayout: input.agentPayout || undefined,
    platformFee: input.platformFee || undefined,
    clientAddress: normalizedAddress(input.clientAddress) || undefined,
    agentAddress: normalizedAddress(input.agentAddress) || undefined,
  };

  if (!factoryProtected) {
    data.escrowContractVersion = input.escrowContractVersion || job?.escrowContractVersion;
    const inputTokenAddress = normalizedAddress(input.tokenAddress);
    if (inputTokenAddress || isFactoryCreationEvent(input.eventName)) data.tokenAddress = inputTokenAddress;
    data.tokenSymbol = input.tokenSymbol || job?.budgetToken;
  }

  if (!factoryProtected || eventMayUpdateFactoryBoundAmount(input.eventName)) {
    data.amountGross = input.amountGross || undefined;
  }

  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function storedEventInput(event: any): EscrowLifecycleEventInput {
  return {
    chainKey: event.chainKey,
    chainId: event.chainId,
    caip2Network: event.caip2Network,
    txHash: event.txHash,
    logIndex: event.logIndex,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionIndex: event.transactionIndex,
    contractAddress: event.contractAddress,
    factoryAddress: event.factoryAddress,
    escrowAddress: event.escrowAddress,
    eventName: event.eventName,
    lifecycleType: event.lifecycleType,
    onchainJobId: event.onchainJobId,
    actorAddress: event.actorAddress,
    clientAddress: event.clientAddress,
    agentAddress: event.agentAddress,
    recipientAddress: event.recipientAddress,
    amountGross: event.amountGross,
    agentPayout: event.agentPayout,
    platformFee: event.platformFee,
    tokenAddress: event.tokenAddress,
    tokenSymbol: event.tokenSymbol,
    escrowContractVersion: event.escrowContractVersion,
    factoryBound: event.factoryBound,
    factoryBindingStatus: event.factoryBindingStatus,
    decodedArgs: parseDecodedArgs(event.decodedArgs),
    finalityStatus: event.finalityStatus,
    confirmations: event.confirmations,
  };
}

function lifecycleForEvent(eventName: string): { lifecycleType: string; state: string } {
  switch (eventName) {
    case 'EscrowCreated': return { lifecycleType: 'ESCROW_CREATED', state: 'UNFUNDED' };
    case 'JobCreated': return { lifecycleType: 'ESCROW_CREATED', state: 'UNFUNDED' };
    case 'BudgetSet': return { lifecycleType: 'BUDGET_SET', state: 'UNFUNDED' };
    case 'ProviderSet': return { lifecycleType: 'PROVIDER_SET', state: 'UNCHANGED' };
    case 'EscrowFunded': return { lifecycleType: 'FUNDED', state: 'FUNDED' };
    case 'JobFunded': return { lifecycleType: 'FUNDED', state: 'FUNDED' };
    case 'WorkStarted': return { lifecycleType: 'STARTED', state: 'IN_PROGRESS' };
    case 'DeliverableSubmitted': return { lifecycleType: 'DELIVERED', state: 'PENDING_REVIEW' };
    case 'JobSubmitted': return { lifecycleType: 'DELIVERED', state: 'PENDING_REVIEW' };
    case 'JobApproved': return { lifecycleType: 'RELEASED', state: 'COMPLETED' };
    case 'JobAutoReleased': return { lifecycleType: 'AUTO_RELEASED', state: 'COMPLETED' };
    case 'JobCompleted': return { lifecycleType: 'RELEASED', state: 'COMPLETED' };
    case 'PaymentReleased': return { lifecycleType: 'RELEASED', state: 'COMPLETED' };
    case 'DisputeOpened': return { lifecycleType: 'DISPUTED', state: 'DISPUTED' };
    case 'DisputeResolved': return { lifecycleType: 'RESOLVED', state: 'RESOLVED' };
    case 'AcceptanceTimeoutRefunded': return { lifecycleType: 'REFUNDED', state: 'CANCELLED' };
    case 'Refunded': return { lifecycleType: 'REFUNDED', state: 'CANCELLED' };
    case 'JobCancelled': return { lifecycleType: 'CANCELLED', state: 'CANCELLED' };
    case 'JobRejected': return { lifecycleType: 'CANCELLED', state: 'CANCELLED' };
    case 'JobExpired': return { lifecycleType: 'REFUNDED', state: 'CANCELLED' };
    case 'NativeFeePaid': return { lifecycleType: 'FEE_PAID', state: 'UNCHANGED' };
    case 'PlatformFeePaid': return { lifecycleType: 'FEE_PAID', state: 'UNCHANGED' };
    default: return { lifecycleType: eventName.toUpperCase(), state: 'UNKNOWN' };
  }
}

function eventPosition(input: { blockNumber?: string | number | null; transactionIndex?: number | null; logIndex?: number | null }): { block: bigint; transaction: number; log: number } {
  const blockValue = input.blockNumber === undefined || input.blockNumber === null ? '0' : String(input.blockNumber);
  return {
    block: BigInt(blockValue),
    transaction: Number(input.transactionIndex ?? 0),
    log: Number(input.logIndex ?? 0),
  };
}

function compareEventPosition(a: ReturnType<typeof eventPosition>, b: ReturnType<typeof eventPosition>): number {
  if (a.block > b.block) return 1;
  if (a.block < b.block) return -1;
  if (a.transaction > b.transaction) return 1;
  if (a.transaction < b.transaction) return -1;
  if (a.log > b.log) return 1;
  if (a.log < b.log) return -1;
  return 0;
}

function eventIdentity(input: { txHash?: string | null; logIndex?: number | null }): string | null {
  const txHash = normalizeHash(input.txHash);
  if (!txHash || input.logIndex === undefined || input.logIndex === null || input.logIndex < 0) return null;
  return `${txHash}:${input.logIndex}`;
}

function blockNumberInRange(value: string | number | null | undefined, fromBlock: number, toBlock: number): boolean {
  if (value === undefined || value === null) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= fromBlock && parsed <= toBlock;
}

function blockNumbersForRange(fromBlock: number, toBlock: number): string[] {
  const blocks: string[] = [];
  for (let block = fromBlock; block <= toBlock; block++) blocks.push(String(block));
  return blocks;
}

function mapEventToJobStatus(lifecycleType: string, state: string): { status?: string; settlementStatus?: string } {
  if (lifecycleType === 'ESCROW_CREATED') return { status: 'OPEN', settlementStatus: 'ESCROW_CREATED' };
  if (state === 'FUNDED') return { status: 'FUNDED', settlementStatus: 'FUNDED' };
  if (state === 'IN_PROGRESS') return { status: 'IN_PROGRESS' };
  if (state === 'PENDING_REVIEW') return { status: 'PENDING_REVIEW' };
  if (state === 'DISPUTED') return { status: 'DISPUTED' };
  if (state === 'CANCELLED') return { status: 'CANCELLED', settlementStatus: lifecycleType === 'REFUNDED' ? 'REFUNDED' : 'CANCELLED' };
  return {};
}

async function findJobForEvent(event: EscrowLifecycleEventInput): Promise<any | null> {
  const escrowAddress = normalizedAddress(event.escrowAddress);
  const onchainJobId = normalizeHash(event.onchainJobId);

  if (onchainJobId) {
    const byOnchainJob = await prisma.job.findFirst({
      where: {
        chainId: event.chainId,
        onchainJobId,
      },
    });
    if (byOnchainJob) return byOnchainJob;
  }

  if (escrowAddress) {
    return prisma.job.findFirst({
      where: {
        chainId: event.chainId,
        escrowAddress,
      },
    });
  }

  return null;
}

async function maybeUpdateJobFromLifecycle(job: any | null, event: EscrowLifecycleEventInput, state: string, lifecycleType: string): Promise<void> {
  if (!job || !['standard', 'erc8183'].includes(job.settlementRail || '')) return;
  const finalityStatus = event.finalityStatus || 'FINAL';
  if (finalityStatus !== 'FINAL') return;

  const update = mapEventToJobStatus(lifecycleType, state);
  const data: Record<string, unknown> = {};
  if (update.status) data.status = update.status;
  if (update.settlementStatus) data.settlementStatus = update.settlementStatus;
  if (event.escrowAddress && !job.escrowAddress) data.escrowAddress = normalizedAddress(event.escrowAddress);
  if (event.onchainJobId && !job.onchainJobId) data.onchainJobId = normalizeHash(event.onchainJobId);
  if (event.tokenAddress && !job.tokenAddress) data.tokenAddress = normalizedAddress(event.tokenAddress);
  if (event.escrowContractVersion && !job.escrowContractVersion) data.escrowContractVersion = event.escrowContractVersion;

  if (state === 'IN_PROGRESS' && !job.acceptedAt) {
    data.acceptedAt = new Date();
    if (event.decodedArgs?.agentId && !job.agentId) {
      const agent = await prisma.agent.findUnique({ where: { agentId: String(event.decodedArgs.agentId) } }).catch(() => null);
      if (agent) data.agentId = agent.id;
    }
  }
  if (Object.keys(data).length === 0) return;
  await prisma.job.update({ where: { id: job.id }, data });
  wsService.broadcast(`job:${job.id}`, 'job:indexed-lifecycle-updated', {
    id: job.id,
    lifecycleType,
    state,
    status: data.status || job.status,
    settlementStatus: data.settlementStatus || job.settlementStatus,
  });
}

function lifecycleTimestamp(event: any): Date {
  return event.finalizedAt || event.indexedAt || new Date();
}

function parseDecodedArgs(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function recomputeEscrowLifecycleState(chainId: number, escrowAddress: string): Promise<boolean> {
  const normalizedEscrow = normalizedAddress(escrowAddress);
  if (!normalizedEscrow) return false;

  const events = await (prisma as any).indexedChainEvent.findMany({
    where: {
      chainId,
      escrowAddress: normalizedEscrow,
      finalityStatus: { notIn: ['REORGED', 'FAILED'] },
    },
  }).catch(() => []);

  const ordered = events
    .filter((event: any) => lifecycleForEvent(event.eventName).state !== 'UNCHANGED')
    .sort((a: any, b: any) => compareEventPosition(eventPosition(a), eventPosition(b)));

  const latest = ordered[ordered.length - 1];
  if (!latest) {
    const existing = await (prisma as any).escrowLifecycleState.findUnique({
      where: { chainId_escrowAddress: { chainId, escrowAddress: normalizedEscrow } },
    }).catch(() => null);
    if (!existing) return false;
    await (prisma as any).escrowLifecycleState.update({
      where: { chainId_escrowAddress: { chainId, escrowAddress: normalizedEscrow } },
      data: {
        state: 'REORGED',
        finalityStatus: 'REORGED',
        confirmations: 0,
        lastIndexedAt: new Date(),
      },
    });
    return true;
  }

  const latestLifecycle = lifecycleForEvent(latest.eventName);
  const aggregate: Record<string, unknown> = {
    chainKey: latest.chainKey,
    chainId: latest.chainId,
    caip2Network: latest.caip2Network,
    escrowAddress: normalizedEscrow,
    lastIndexedAt: new Date(),
  };
  let latestState = latestLifecycle.state;
  let latestLifecycleType = latest.lifecycleType || latestLifecycle.lifecycleType;
  let latestJobId: string | null | undefined = latest.jobId;

  for (const event of ordered) {
    const { lifecycleType, state } = lifecycleForEvent(event.eventName);
    const effectiveLifecycleType = event.lifecycleType || lifecycleType;
    const timestamp = lifecycleTimestamp(event);
    const eventInput = storedEventInput(event);
    const bindingData = factoryBindingStateData(eventInput, event.proofHash || proofHash({
      chainId: event.chainId,
      txHash: normalizeHash(event.txHash),
      logIndex: event.logIndex,
      eventName: event.eventName,
      decodedArgs: parseDecodedArgs(event.decodedArgs),
    }), timestamp);
    if (bindingData) Object.assign(aggregate, bindingData);
    const metadataData = lifecycleStateMetadataData(eventInput, null, aggregate);
    latestState = state;
    latestLifecycleType = effectiveLifecycleType;
    latestJobId = event.jobId || latestJobId;

    Object.assign(aggregate, {
      ...(event.jobId ? { job: { connect: { id: event.jobId } } } : {}),
      ...metadataData,
      agentPayout: event.agentPayout || aggregate.agentPayout,
      platformFee: event.platformFee || aggregate.platformFee,
      state,
      finalityStatus: event.finalityStatus || 'FINAL',
      confirmations: event.confirmations ?? 0,
      latestTxHash: normalizeHash(event.txHash),
      latestBlockNumber: String(event.blockNumber),
      latestTransactionIndex: event.transactionIndex ?? null,
      latestLogIndex: event.logIndex,
      ...(effectiveLifecycleType === 'ESCROW_CREATED' ? { createdOnchainAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'FUNDED' ? { fundedAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'STARTED' ? { acceptedAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'DELIVERED' ? { deliveredAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'RELEASED' || effectiveLifecycleType === 'AUTO_RELEASED' ? { releasedAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'REFUNDED' || effectiveLifecycleType === 'CANCELLED' ? { refundedAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'DISPUTED' ? { disputedAt: timestamp } : {}),
      ...(effectiveLifecycleType === 'RESOLVED' ? { resolvedAt: timestamp } : {}),
    });
  }

  await (prisma as any).escrowLifecycleState.upsert({
    where: { chainId_escrowAddress: { chainId, escrowAddress: normalizedEscrow } },
    update: aggregate,
    create: {
      ...aggregate,
      chainKey: latest.chainKey,
      chainId: latest.chainId,
      caip2Network: latest.caip2Network,
      escrowAddress: normalizedEscrow,
    },
  });

  const job = latestJobId ? await prisma.job.findUnique({ where: { id: latestJobId } }).catch(() => null) : null;
  if (job) {
    await maybeUpdateJobFromLifecycle(job, {
      chainKey: latest.chainKey,
      chainId: latest.chainId,
      caip2Network: latest.caip2Network,
      txHash: latest.txHash,
      logIndex: latest.logIndex,
      blockNumber: latest.blockNumber,
      blockHash: latest.blockHash,
      transactionIndex: latest.transactionIndex,
      contractAddress: latest.contractAddress,
      factoryAddress: latest.factoryAddress,
      escrowAddress: latest.escrowAddress,
      eventName: latest.eventName,
      lifecycleType: latestLifecycleType,
      onchainJobId: latest.onchainJobId,
      actorAddress: latest.actorAddress,
      clientAddress: latest.clientAddress,
      agentAddress: latest.agentAddress,
      recipientAddress: latest.recipientAddress,
      amountGross: latest.amountGross,
      agentPayout: latest.agentPayout,
      platformFee: latest.platformFee,
      tokenAddress: latest.tokenAddress,
      tokenSymbol: latest.tokenSymbol,
      escrowContractVersion: latest.escrowContractVersion,
      decodedArgs: parseDecodedArgs(latest.decodedArgs),
      finalityStatus: latest.finalityStatus,
      confirmations: latest.confirmations,
    }, latestState, latestLifecycleType);
  }

  return true;
}

export async function reconcileCanonicalEventsForRange(
  chain: ChainConfig,
  fromBlock: number,
  toBlock: number,
  canonicalEvents: EscrowLifecycleEventInput[],
  scannedAddresses?: string[],
): Promise<{ reorgedEvents: number; recomputedEscrows: number }> {
  if (toBlock < fromBlock) return { reorgedEvents: 0, recomputedEscrows: 0 };

  const canonicalKeys = new Set(
    canonicalEvents
      .map(event => eventIdentity(event))
      .filter(Boolean) as string[],
  );
  const scannedAddressSet = scannedAddresses?.length
    ? new Set(scannedAddresses.map(address => normalizedAddress(address)).filter(Boolean) as string[])
    : null;

  const storedEvents = await (prisma as any).indexedChainEvent.findMany({
    where: {
      chainId: chain.chainId,
      blockNumber: { in: blockNumbersForRange(fromBlock, toBlock) },
      finalityStatus: { in: ['PENDING', 'FINAL'] },
    },
  }).catch(() => []);

  const displaced = storedEvents.filter((event: any) => {
    const identity = eventIdentity(event);
    if (!identity || canonicalKeys.has(identity)) return false;
    if (!blockNumberInRange(event.blockNumber, fromBlock, toBlock)) return false;
    if (scannedAddressSet) {
      const contractAddress = normalizedAddress(event.contractAddress);
      const escrowAddress = normalizedAddress(event.escrowAddress);
      const factoryAddress = normalizedAddress(event.factoryAddress);
      if (!contractAddress && !escrowAddress && !factoryAddress) return false;
      if (
        !scannedAddressSet.has(contractAddress || '')
        && !scannedAddressSet.has(escrowAddress || '')
        && !scannedAddressSet.has(factoryAddress || '')
      ) {
        return false;
      }
    }
    return true;
  });

  if (displaced.length === 0) return { reorgedEvents: 0, recomputedEscrows: 0 };

  const now = new Date();
  const escrowKeys = new Set<string>();
  for (const event of displaced) {
    await (prisma as any).indexedChainEvent.update({
      where: { chainId_txHash_logIndex: { chainId: event.chainId, txHash: event.txHash, logIndex: event.logIndex } },
      data: {
        finalityStatus: 'REORGED',
        removedAt: now,
      },
    });
    const normalizedEscrow = normalizedAddress(event.escrowAddress || event.contractAddress);
    if (normalizedEscrow) escrowKeys.add(`${event.chainId}:${normalizedEscrow}`);
  }

  let recomputedEscrows = 0;
  for (const key of escrowKeys) {
    const [chainIdText, escrowAddress] = key.split(':');
    const recomputed = await recomputeEscrowLifecycleState(Number(chainIdText), escrowAddress);
    if (recomputed) recomputedEscrows++;
  }

  return { reorgedEvents: displaced.length, recomputedEscrows };
}

export async function persistEscrowLifecycleEvent(input: EscrowLifecycleEventInput) {
  const { lifecycleType, state } = lifecycleForEvent(input.eventName);
  const normalizedEscrow = normalizedAddress(input.escrowAddress || input.contractAddress);
  const normalizedContract = normalizedAddress(input.contractAddress);
  const job = await findJobForEvent({ ...input, escrowAddress: normalizedEscrow });
  const decodedArgs = input.decodedArgs || {};
  const finalityStatus = input.finalityStatus || 'FINAL';
  const uniqueEvent = {
    chainId_txHash_logIndex: {
      chainId: input.chainId,
      txHash: normalizeHash(input.txHash),
      logIndex: input.logIndex,
    },
  };
  const existingIndexed = await (prisma as any).indexedChainEvent.findUnique({
    where: uniqueEvent,
  }).catch(() => null);
  const eventProofHash = proofHash({
    chainId: input.chainId,
    txHash: normalizeHash(input.txHash),
    logIndex: input.logIndex,
    eventName: input.eventName,
    decodedArgs,
  });
  const shouldUseJobMetadataFallback = !isFactoryCreationEvent(input.eventName) && input.factoryBound !== true;
  const indexedTokenSymbol = input.tokenSymbol || (shouldUseJobMetadataFallback ? job?.budgetToken : undefined);
  const indexedEscrowContractVersion = input.escrowContractVersion || (shouldUseJobMetadataFallback ? job?.escrowContractVersion : undefined);
  const indexedFactoryBound = input.factoryBound === true;
  const indexedFactoryBindingStatus = factoryBindingStatus(input);

  const indexed = await (prisma as any).indexedChainEvent.upsert({
    where: uniqueEvent,
    update: {
      blockNumber: String(input.blockNumber),
      blockHash: normalizeHash(input.blockHash) || input.blockHash,
      transactionIndex: input.transactionIndex ?? null,
      contractAddress: normalizedContract || normalizeAddress(input.contractAddress),
      factoryAddress: normalizedAddress(input.factoryAddress) || undefined,
      escrowAddress: normalizedEscrow,
      eventName: input.eventName,
      lifecycleType: input.lifecycleType || lifecycleType,
      ...(job?.id ? { job: { connect: { id: job.id } } } : {}),
      onchainJobId: normalizeHash(input.onchainJobId) || undefined,
      actorAddress: normalizedAddress(input.actorAddress) || undefined,
      clientAddress: normalizedAddress(input.clientAddress) || undefined,
      agentAddress: normalizedAddress(input.agentAddress) || undefined,
      recipientAddress: normalizedAddress(input.recipientAddress) || undefined,
      amountGross: input.amountGross || undefined,
      agentPayout: input.agentPayout || undefined,
      platformFee: input.platformFee || undefined,
      tokenAddress: normalizedAddress(input.tokenAddress) || undefined,
      tokenSymbol: indexedTokenSymbol,
      escrowContractVersion: indexedEscrowContractVersion,
      factoryBound: indexedFactoryBound,
      factoryBindingStatus: indexedFactoryBindingStatus,
      finalityStatus,
      confirmations: input.confirmations ?? 0,
      decodedArgs: JSON.stringify(decodedArgs),
      proofHash: eventProofHash,
      indexedAt: new Date(),
      finalizedAt: finalityStatus === 'FINAL' ? new Date() : null,
      removedAt: finalityStatus === 'REORGED' ? new Date() : null,
    },
    create: {
      chainKey: input.chainKey,
      chainId: input.chainId,
      caip2Network: input.caip2Network,
      blockNumber: String(input.blockNumber),
      blockHash: normalizeHash(input.blockHash) || input.blockHash,
      transactionIndex: input.transactionIndex ?? undefined,
      txHash: normalizeHash(input.txHash),
      logIndex: input.logIndex,
      contractAddress: normalizedContract || normalizeAddress(input.contractAddress),
      factoryAddress: normalizedAddress(input.factoryAddress),
      escrowAddress: normalizedEscrow,
      eventName: input.eventName,
      lifecycleType: input.lifecycleType || lifecycleType,
      jobId: job?.id,
      onchainJobId: normalizeHash(input.onchainJobId),
      actorAddress: normalizedAddress(input.actorAddress),
      clientAddress: normalizedAddress(input.clientAddress),
      agentAddress: normalizedAddress(input.agentAddress),
      recipientAddress: normalizedAddress(input.recipientAddress),
      amountGross: input.amountGross || undefined,
      agentPayout: input.agentPayout || undefined,
      platformFee: input.platformFee || undefined,
      tokenAddress: normalizedAddress(input.tokenAddress),
      tokenSymbol: indexedTokenSymbol,
      escrowContractVersion: indexedEscrowContractVersion,
      factoryBound: indexedFactoryBound,
      factoryBindingStatus: indexedFactoryBindingStatus,
      confirmations: input.confirmations ?? 0,
      finalityStatus,
      decodedArgs: JSON.stringify(decodedArgs),
      proofHash: eventProofHash,
      finalizedAt: finalityStatus === 'FINAL' ? new Date() : undefined,
      removedAt: finalityStatus === 'REORGED' ? new Date() : undefined,
    },
  });

  if (finalityStatus === 'REORGED') {
    if (normalizedEscrow && state !== 'UNCHANGED') {
      await recomputeEscrowLifecycleState(input.chainId, normalizedEscrow);
    }
    return indexed;
  }

  const blockHashChanged = existingIndexed
    && (String(existingIndexed.blockNumber) !== String(input.blockNumber)
      || (normalizeHash(existingIndexed.blockHash) || existingIndexed.blockHash) !== (normalizeHash(input.blockHash) || input.blockHash));

  if (blockHashChanged && normalizedEscrow && state !== 'UNCHANGED') {
    await recomputeEscrowLifecycleState(input.chainId, normalizedEscrow);
    return indexed;
  }

  let shouldProjectState = state !== 'UNCHANGED' && finalityStatus !== 'FAILED';
  let currentState: any | null = null;
  if (normalizedEscrow && state !== 'UNCHANGED') {
    currentState = await (prisma as any).escrowLifecycleState.findUnique({
      where: {
        chainId_escrowAddress: {
          chainId: input.chainId,
          escrowAddress: normalizedEscrow,
        },
      },
    }).catch(() => null);
    if (currentState) {
      const incomingPosition = eventPosition(input);
      const currentPosition = eventPosition({
        blockNumber: currentState.latestBlockNumber,
        transactionIndex: currentState.latestTransactionIndex,
        logIndex: currentState.latestLogIndex,
      });
      shouldProjectState = compareEventPosition(incomingPosition, currentPosition) >= 0;
    }
  }

  const bindingData = factoryBindingStateData(input, eventProofHash);
  if (normalizedEscrow && currentState && bindingData && finalityStatus !== 'FAILED') {
    await (prisma as any).escrowLifecycleState.update({
      where: {
        chainId_escrowAddress: {
          chainId: input.chainId,
          escrowAddress: normalizedEscrow,
        },
      },
      data: bindingData,
    });
    currentState = { ...currentState, ...bindingData };
  }

  if (normalizedEscrow && shouldProjectState) {
    const stateMetadata = lifecycleStateMetadataData(input, job, currentState);
    const stateBinding = bindingData || {};
    await (prisma as any).escrowLifecycleState.upsert({
      where: {
        chainId_escrowAddress: {
          chainId: input.chainId,
          escrowAddress: normalizedEscrow,
        },
      },
      update: {
        ...(job?.id ? { job: { connect: { id: job.id } } } : {}),
        state,
        finalityStatus,
        confirmations: input.confirmations ?? 0,
        latestTxHash: normalizeHash(input.txHash),
        latestBlockNumber: String(input.blockNumber),
        latestTransactionIndex: input.transactionIndex ?? null,
        latestLogIndex: input.logIndex,
        ...stateMetadata,
        ...stateBinding,
        lastIndexedAt: new Date(),
        ...(lifecycleType === 'ESCROW_CREATED' ? { createdOnchainAt: new Date() } : {}),
        ...(lifecycleType === 'FUNDED' ? { fundedAt: new Date() } : {}),
        ...(lifecycleType === 'STARTED' ? { acceptedAt: new Date() } : {}),
        ...(lifecycleType === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(lifecycleType === 'RELEASED' || lifecycleType === 'AUTO_RELEASED' ? { releasedAt: new Date() } : {}),
        ...(lifecycleType === 'REFUNDED' || lifecycleType === 'CANCELLED' ? { refundedAt: new Date() } : {}),
        ...(lifecycleType === 'DISPUTED' ? { disputedAt: new Date() } : {}),
        ...(lifecycleType === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
      },
      create: {
        ...(job?.id ? { job: { connect: { id: job.id } } } : {}),
        chainKey: input.chainKey,
        chainId: input.chainId,
        caip2Network: input.caip2Network,
        escrowAddress: normalizedEscrow,
        ...stateMetadata,
        ...stateBinding,
        state,
        finalityStatus,
        confirmations: input.confirmations ?? 0,
        latestTxHash: normalizeHash(input.txHash),
        latestBlockNumber: String(input.blockNumber),
        latestTransactionIndex: input.transactionIndex ?? null,
        latestLogIndex: input.logIndex,
        createdOnchainAt: lifecycleType === 'ESCROW_CREATED' ? new Date() : undefined,
        fundedAt: lifecycleType === 'FUNDED' ? new Date() : undefined,
        acceptedAt: lifecycleType === 'STARTED' ? new Date() : undefined,
        deliveredAt: lifecycleType === 'DELIVERED' ? new Date() : undefined,
        releasedAt: lifecycleType === 'RELEASED' || lifecycleType === 'AUTO_RELEASED' ? new Date() : undefined,
        refundedAt: lifecycleType === 'REFUNDED' || lifecycleType === 'CANCELLED' ? new Date() : undefined,
        disputedAt: lifecycleType === 'DISPUTED' ? new Date() : undefined,
        resolvedAt: lifecycleType === 'RESOLVED' ? new Date() : undefined,
        lastIndexedAt: new Date(),
      },
    });
  }

  if (shouldProjectState) {
    await maybeUpdateJobFromLifecycle(job, input, state, input.lifecycleType || lifecycleType);
  }
  return indexed;
}

export function decodedEventArgs(args: any): Record<string, string> {
  const record: Record<string, string> = {};
  const namedArgs = typeof args?.toObject === 'function' ? args.toObject() : args;
  for (const key of Object.keys(namedArgs || {})) {
    if (/^\d+$/.test(key)) continue;
    record[key] = String(namedArgs[key]);
  }
  return record;
}

type EscrowContractDetails = {
  onchainJobId?: string;
  clientAddress?: string | null;
  tokenAddress?: string | null;
  amountGross?: string;
};

type Erc8183FactoryDetails = {
  escrowAddress?: string | null;
  tokenAddress?: string | null;
};

type Erc8183EscrowDetails = {
  onchainJobId?: string;
  factoryAddress?: string | null;
  tokenAddress?: string | null;
};

function callBlockTag(event: EscrowLifecycleEventInput): number | undefined {
  const blockNumber = Number(event.blockNumber);
  return Number.isFinite(blockNumber) && blockNumber > 0 ? blockNumber : undefined;
}

async function readEscrowContractDetails(
  provider: JsonRpcProvider,
  event: EscrowLifecycleEventInput,
): Promise<EscrowContractDetails | null> {
  const escrowAddress = normalizedAddress(event.escrowAddress);
  if (!escrowAddress) return null;

  const blockTag = callBlockTag(event);
  const result = await provider.call({
    to: escrowAddress,
    data: escrowDetailsInterface.encodeFunctionData('getDetails', []),
    ...(blockTag !== undefined ? { blockTag } : {}),
  });
  const decoded = escrowDetailsInterface.decodeFunctionResult('getDetails', result) as any;
  const paymentToken = normalizedAddress(String(decoded[2]));

  return {
    onchainJobId: hexString(decoded[0]),
    clientAddress: normalizedAddress(String(decoded[1])),
    tokenAddress: paymentToken && paymentToken !== ZERO_ADDRESS ? paymentToken : null,
    amountGross: bigintString(decoded[3]),
  };
}

async function readErc8183FactoryDetails(
  provider: JsonRpcProvider,
  event: EscrowLifecycleEventInput,
): Promise<Erc8183FactoryDetails | null> {
  const factoryAddress = normalizedAddress(event.factoryAddress || event.contractAddress);
  const jobId = bigintString(event.decodedArgs?.jobId);
  if (!factoryAddress || !jobId) return null;

  const blockTag = callBlockTag(event);
  const callBase = {
    to: factoryAddress,
    ...(blockTag !== undefined ? { blockTag } : {}),
  };
  const [escrowResult, tokenResult] = await Promise.all([
    provider.call({
      ...callBase,
      data: erc8183FactoryInterface.encodeFunctionData('getEscrow', [BigInt(jobId)]),
    }),
    provider.call({
      ...callBase,
      data: erc8183FactoryInterface.encodeFunctionData('paymentToken', []),
    }),
  ]);
  const [escrowAddress] = erc8183FactoryInterface.decodeFunctionResult('getEscrow', escrowResult) as any;
  const [tokenAddress] = erc8183FactoryInterface.decodeFunctionResult('paymentToken', tokenResult) as any;
  return {
    escrowAddress: normalizedAddress(String(escrowAddress)),
    tokenAddress: normalizedAddress(String(tokenAddress)),
  };
}

async function readErc8183EscrowDetails(
  provider: JsonRpcProvider,
  event: EscrowLifecycleEventInput,
  escrowAddress: string,
): Promise<Erc8183EscrowDetails | null> {
  const normalizedEscrow = normalizedAddress(escrowAddress);
  if (!normalizedEscrow) return null;

  const blockTag = callBlockTag(event);
  const callBase = {
    to: normalizedEscrow,
    ...(blockTag !== undefined ? { blockTag } : {}),
  };
  const [jobIdResult, factoryResult, tokenResult] = await Promise.all([
    provider.call({
      ...callBase,
      data: erc8183EscrowInterface.encodeFunctionData('jobId', []),
    }),
    provider.call({
      ...callBase,
      data: erc8183EscrowInterface.encodeFunctionData('factory', []),
    }),
    provider.call({
      ...callBase,
      data: erc8183EscrowInterface.encodeFunctionData('paymentToken', []),
    }),
  ]);
  const [jobId] = erc8183EscrowInterface.decodeFunctionResult('jobId', jobIdResult) as any;
  const [factoryAddress] = erc8183EscrowInterface.decodeFunctionResult('factory', factoryResult) as any;
  const [tokenAddress] = erc8183EscrowInterface.decodeFunctionResult('paymentToken', tokenResult) as any;

  return {
    onchainJobId: uintToBytes32(jobId),
    factoryAddress: normalizedAddress(String(factoryAddress)),
    tokenAddress: normalizedAddress(String(tokenAddress)),
  };
}

function factoryEventMatchesEscrowDetails(event: EscrowLifecycleEventInput, details: EscrowContractDetails): boolean {
  const eventJobId = normalizeHash(event.onchainJobId);
  const eventClient = normalizedAddress(event.clientAddress);
  const eventAmount = bigintString(event.amountGross);

  return Boolean(
    eventJobId
    && details.onchainJobId === eventJobId
    && eventClient
    && details.clientAddress === eventClient
    && eventAmount
    && details.amountGross === eventAmount,
  );
}

function erc8183FactoryEventMatchesEscrowDetails(
  event: EscrowLifecycleEventInput,
  factoryDetails: Erc8183FactoryDetails,
  escrowDetails: Erc8183EscrowDetails,
): boolean {
  const factoryAddress = normalizedAddress(event.factoryAddress || event.contractAddress);
  const eventJobId = normalizeHash(event.onchainJobId);
  const tokenAddress = normalizedAddress(factoryDetails.tokenAddress);

  return Boolean(
    factoryAddress
    && factoryDetails.escrowAddress
    && eventJobId
    && escrowDetails.onchainJobId === eventJobId
    && escrowDetails.factoryAddress === factoryAddress
    && tokenAddress
    && escrowDetails.tokenAddress === tokenAddress,
  );
}

async function enrichFactoryEventFromEscrow(
  provider: JsonRpcProvider,
  chain: ChainConfig,
  event: EscrowLifecycleEventInput,
): Promise<EscrowLifecycleEventInput> {
  const kind = configuredFactoryKind(chain, event.factoryAddress);
  if (!kind) return { ...event, factoryBound: false, factoryBindingStatus: FACTORY_BINDING_UNVERIFIED };

  const defaults = factoryTokenDefaults(chain, kind);
  const baseEvent: EscrowLifecycleEventInput = {
    ...event,
    ...defaults,
    factoryBound: false,
    factoryBindingStatus: FACTORY_BINDING_UNVERIFIED,
  };

  try {
    const details = await readEscrowContractDetails(provider, event);
    if (!details || !factoryEventMatchesEscrowDetails(event, details)) return baseEvent;

    const tokenAddress = kind === 'native-eth' ? null : details.tokenAddress;
    if (kind !== 'native-eth' && !tokenAddress) return baseEvent;

    return {
      ...baseEvent,
      tokenAddress,
      tokenSymbol: kind === 'native-eth'
        ? chain.nativeCurrency.symbol
        : tokenSymbolForAddress(chain, tokenAddress),
      escrowContractVersion: defaults.escrowContractVersion,
      factoryBound: true,
      factoryBindingStatus: FACTORY_BINDING_VERIFIED,
    };
  } catch {
    return baseEvent;
  }
}

async function enrichErc8183FactoryEvent(
  provider: JsonRpcProvider,
  chain: ChainConfig,
  event: EscrowLifecycleEventInput,
): Promise<EscrowLifecycleEventInput> {
  const kind = configuredFactoryKind(chain, event.factoryAddress);
  if (kind !== 'erc8183') return { ...event, factoryBound: false, factoryBindingStatus: FACTORY_BINDING_UNVERIFIED };

  const defaults = factoryTokenDefaults(chain, kind);
  const baseEvent: EscrowLifecycleEventInput = {
    ...event,
    ...defaults,
    factoryBound: false,
    factoryBindingStatus: isFactoryCreationEvent(event.eventName) ? FACTORY_BINDING_UNVERIFIED : FACTORY_BINDING_UNBOUND,
  };

  try {
    const factoryDetails = await readErc8183FactoryDetails(provider, event);
    const tokenAddress = normalizedAddress(factoryDetails?.tokenAddress);
    const escrowAddress = normalizedAddress(factoryDetails?.escrowAddress);
    const enrichedBase: EscrowLifecycleEventInput = {
      ...baseEvent,
      escrowAddress: escrowAddress || baseEvent.escrowAddress,
      tokenAddress: tokenAddress || baseEvent.tokenAddress,
      tokenSymbol: tokenAddress ? tokenSymbolForAddress(chain, tokenAddress) : baseEvent.tokenSymbol,
      escrowContractVersion: 'erc8183',
    };

    if (!isFactoryCreationEvent(event.eventName)) return enrichedBase;
    if (!factoryDetails || !escrowAddress || !tokenAddress) return enrichedBase;

    const escrowDetails = await readErc8183EscrowDetails(provider, event, escrowAddress);
    if (!escrowDetails || !erc8183FactoryEventMatchesEscrowDetails(event, factoryDetails, escrowDetails)) {
      return enrichedBase;
    }

    return {
      ...enrichedBase,
      factoryBound: true,
      factoryBindingStatus: FACTORY_BINDING_VERIFIED,
    };
  } catch {
    return baseEvent;
  }
}

function decodeFactoryLog(chain: ChainConfig, log: Log, confirmations: number): EscrowLifecycleEventInput | null {
  try {
    const parsed = factoryInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== 'EscrowCreated') return null;
    const args = decodedEventArgs(parsed.args);
    const kind = configuredFactoryKind(chain, log.address);
    if (!kind) return null;
    const defaults = factoryTokenDefaults(chain, kind);
    return {
      chainKey: chain.key,
      chainId: chain.chainId,
      caip2Network: chain.caip2Network,
      txHash: normalizeHash(log.transactionHash) || log.transactionHash,
      logIndex: Number((log as any).index ?? (log as any).logIndex ?? 0),
      blockNumber: Number(log.blockNumber || 0),
      blockHash: normalizeHash(log.blockHash) || log.blockHash,
      transactionIndex: Number((log as any).transactionIndex ?? 0),
      contractAddress: normalizeAddress(log.address) || log.address,
      factoryAddress: normalizeAddress(log.address),
      escrowAddress: normalizedAddress(args.escrow),
      eventName: parsed.name,
      onchainJobId: hexString(args.jobId),
      clientAddress: normalizedAddress(args.client),
      amountGross: bigintString(args.amount),
      tokenAddress: defaults.tokenAddress,
      tokenSymbol: defaults.tokenSymbol,
      escrowContractVersion: defaults.escrowContractVersion,
      factoryBound: false,
      factoryBindingStatus: FACTORY_BINDING_UNVERIFIED,
      decodedArgs: args,
      finalityStatus: 'FINAL',
      confirmations,
    };
  } catch {
    return null;
  }
}

function decodeErc8183FactoryLog(chain: ChainConfig, log: Log, confirmations: number): EscrowLifecycleEventInput | null {
  try {
    const parsed = erc8183FactoryInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) return null;
    const args = decodedEventArgs(parsed.args);
    const kind = configuredFactoryKind(chain, log.address);
    if (kind !== 'erc8183') return null;
    const defaults = factoryTokenDefaults(chain, kind);
    const onchainJobId = uintToBytes32(args.jobId);
    if (!onchainJobId) return null;

    const event: EscrowLifecycleEventInput = {
      chainKey: chain.key,
      chainId: chain.chainId,
      caip2Network: chain.caip2Network,
      txHash: normalizeHash(log.transactionHash) || log.transactionHash,
      logIndex: Number((log as any).index ?? (log as any).logIndex ?? 0),
      blockNumber: Number(log.blockNumber || 0),
      blockHash: normalizeHash(log.blockHash) || log.blockHash,
      transactionIndex: Number((log as any).transactionIndex ?? 0),
      contractAddress: normalizeAddress(log.address) || log.address,
      factoryAddress: normalizeAddress(log.address),
      eventName: parsed.name,
      onchainJobId,
      tokenAddress: defaults.tokenAddress,
      tokenSymbol: defaults.tokenSymbol,
      escrowContractVersion: defaults.escrowContractVersion,
      factoryBound: false,
      factoryBindingStatus: isFactoryCreationEvent(parsed.name) ? FACTORY_BINDING_UNVERIFIED : FACTORY_BINDING_UNBOUND,
      decodedArgs: args,
      finalityStatus: 'FINAL',
      confirmations,
    };

    switch (parsed.name) {
      case 'JobCreated':
        return {
          ...event,
          clientAddress: normalizedAddress(args.client),
          agentAddress: normalizedAddress(args.provider),
          recipientAddress: normalizedAddress(args.evaluator),
          amountGross: '0',
        };
      case 'ProviderSet':
        return { ...event, agentAddress: normalizedAddress(args.provider) };
      case 'BudgetSet':
        return { ...event, amountGross: bigintString(args.amount) };
      case 'JobFunded':
        return {
          ...event,
          clientAddress: normalizedAddress(args.client),
          amountGross: bigintString(args.amount),
        };
      case 'JobSubmitted':
        return { ...event, agentAddress: normalizedAddress(args.provider) };
      case 'JobCompleted':
        return { ...event, actorAddress: normalizedAddress(args.evaluator) };
      case 'PaymentReleased':
        return {
          ...event,
          recipientAddress: normalizedAddress(args.provider),
          agentPayout: bigintString(args.amount),
        };
      case 'Refunded':
        return {
          ...event,
          clientAddress: normalizedAddress(args.client),
          amountGross: bigintString(args.amount),
        };
      case 'PlatformFeePaid':
        return {
          ...event,
          recipientAddress: normalizedAddress(args.feeCollector),
          platformFee: bigintString(args.amount),
        };
      case 'JobRejected':
        return { ...event, actorAddress: normalizedAddress(args.rejector) };
      case 'JobExpired':
        return event;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function decodeEscrowLog(chain: ChainConfig, log: Log, confirmations: number): EscrowLifecycleEventInput | null {
  try {
    const parsed = escrowInterface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed) return null;
    const args = decodedEventArgs(parsed.args);
    return {
      chainKey: chain.key,
      chainId: chain.chainId,
      caip2Network: chain.caip2Network,
      txHash: normalizeHash(log.transactionHash) || log.transactionHash,
      logIndex: Number((log as any).index ?? (log as any).logIndex ?? 0),
      blockNumber: Number(log.blockNumber || 0),
      blockHash: normalizeHash(log.blockHash) || log.blockHash,
      transactionIndex: Number((log as any).transactionIndex ?? 0),
      contractAddress: normalizeAddress(log.address) || log.address,
      escrowAddress: normalizeAddress(log.address),
      eventName: parsed.name,
      onchainJobId: hexString(args.jobId),
      actorAddress: normalizedAddress(args.disputedBy || args.arbiter || args.client),
      clientAddress: normalizedAddress(args.client),
      recipientAddress: normalizedAddress(args.recipient || args.feeCollector),
      amountGross: bigintString(args.amount || args.recipientAmount),
      agentPayout: bigintString(args.agentPayout),
      platformFee: bigintString(args.platformFee),
      decodedArgs: args,
      finalityStatus: 'FINAL',
      confirmations,
    };
  } catch {
    return null;
  }
}

async function getKnownEscrowAddresses(chain: ChainConfig): Promise<string[]> {
  const [jobs, states] = await Promise.all([
    prisma.job.findMany({
      where: { chainId: chain.chainId, escrowAddress: { not: null } },
      select: { escrowAddress: true },
    }),
    (prisma as any).escrowLifecycleState.findMany({
      where: { chainId: chain.chainId },
      select: { escrowAddress: true },
    }).catch(() => []),
  ]);

  return Array.from(new Set([
    ...jobs.map(job => normalizeAddress(job.escrowAddress)).filter(Boolean),
    ...states.map((state: any) => normalizeAddress(state.escrowAddress)).filter(Boolean),
  ] as string[]));
}

function configuredIndexerStartBlock(chain: ChainConfig): number | null {
  const configured = chainEnvValue(chain, 'INDEXER_START_BLOCK') || process.env.AAE_CHAIN_INDEXER_START_BLOCK;
  const parsed = configured ? Number(configured) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return null;
}

function indexerStartBlock(chain: ChainConfig, finalizedBlock: number): number {
  const configured = configuredIndexerStartBlock(chain);
  if (configured !== null) return configured;
  return finalizedBlock + 1;
}

async function scanCanonicalEventRange(input: {
  chain: ChainConfig;
  provider: JsonRpcProvider;
  latestBlock: number;
  fromBlock: number;
  toBlock: number;
  factoryAddresses: string[];
  escrowFactoryAddresses: string[];
  erc8183FactoryAddresses: string[];
}): Promise<{ indexedEvents: number; reorgedEvents: number; recomputedEscrows: number }> {
  const {
    chain,
    provider,
    latestBlock,
    fromBlock,
    toBlock,
    factoryAddresses,
    escrowFactoryAddresses,
    erc8183FactoryAddresses,
  } = input;
  const confirmations = latestBlock - toBlock;
  const canonicalEvents: EscrowLifecycleEventInput[] = [];
  let indexedEvents = 0;

  if (escrowFactoryAddresses.length > 0) {
    const factoryLogs = await provider.getLogs({
      address: escrowFactoryAddresses,
      fromBlock,
      toBlock,
      topics: [[eventTopic(factoryInterface, 'EscrowCreated')]],
    });
    for (const log of factoryLogs) {
      const decoded = decodeFactoryLog(chain, log, confirmations);
      if (decoded) {
        const enriched = await enrichFactoryEventFromEscrow(provider, chain, decoded);
        canonicalEvents.push(enriched);
        await persistEscrowLifecycleEvent(enriched);
        indexedEvents++;
      }
    }
  }

  if (erc8183FactoryAddresses.length > 0) {
    const erc8183Topics = [
      'JobCreated',
      'ProviderSet',
      'BudgetSet',
      'JobFunded',
      'JobSubmitted',
      'JobCompleted',
      'JobRejected',
      'JobExpired',
      'PaymentReleased',
      'Refunded',
      'PlatformFeePaid',
    ].map(name => eventTopic(erc8183FactoryInterface, name));
    const erc8183Logs = await provider.getLogs({
      address: erc8183FactoryAddresses,
      fromBlock,
      toBlock,
      topics: [erc8183Topics],
    });
    for (const log of erc8183Logs) {
      const decoded = decodeErc8183FactoryLog(chain, log, confirmations);
      if (decoded) {
        const enriched = await enrichErc8183FactoryEvent(provider, chain, decoded);
        canonicalEvents.push(enriched);
        await persistEscrowLifecycleEvent(enriched);
        indexedEvents++;
      }
    }
  }

  const escrowAddresses = await getKnownEscrowAddresses(chain);
  const scannedAddresses = Array.from(new Set([...factoryAddresses, ...escrowAddresses]));
  if (escrowAddresses.length > 0) {
    for (let i = 0; i < escrowAddresses.length; i += 100) {
      const addressChunk = escrowAddresses.slice(i, i + 100);
      const escrowLogs = await provider.getLogs({
        address: addressChunk,
        fromBlock,
        toBlock,
      });
      for (const log of escrowLogs) {
        const decoded = decodeEscrowLog(chain, log, confirmations);
        if (decoded) {
          canonicalEvents.push(decoded);
          await persistEscrowLifecycleEvent(decoded);
          indexedEvents++;
        }
      }
    }
  }

  const reorgSummary = await reconcileCanonicalEventsForRange(chain, fromBlock, toBlock, canonicalEvents, scannedAddresses);
  return {
    indexedEvents,
    reorgedEvents: reorgSummary.reorgedEvents,
    recomputedEscrows: reorgSummary.recomputedEscrows,
  };
}

async function scanChain(chain: ChainConfig, maxBlocks = DEFAULT_BATCH_BLOCKS): Promise<ChainIndexerRunSummary> {
  if (process.env[chain.receiptIndexerEnvFlag] !== 'true') {
    return { chainKey: chain.key, indexedEvents: 0, skipped: `${chain.receiptIndexerEnvFlag}=false` };
  }
  if (chain.paidRailsEnabledEnvFlag && process.env[chain.paidRailsEnabledEnvFlag] !== 'true') {
    return { chainKey: chain.key, indexedEvents: 0, skipped: `${chain.paidRailsEnabledEnvFlag}=false` };
  }
  const rpcUrls = rpcUrlsForChain(chain);
  if (rpcUrls.length === 0) {
    return { chainKey: chain.key, indexedEvents: 0, skipped: `${chain.rpcEnvVar} is not configured` };
  }

  const escrowFactoryAddresses = [
    chainEnvValue(chain, 'ESCROW_FACTORY_ADDRESS'),
    chainEnvValue(chain, 'NATIVE_ETH_ESCROW_FACTORY_ADDRESS'),
  ].map(value => normalizeAddress(value)).filter(Boolean) as string[];
  const erc8183FactoryAddresses = [
    chainEnvValue(chain, 'ERC8183_FACTORY_ADDRESS'),
  ].map(value => normalizeAddress(value)).filter(Boolean) as string[];
  const factoryAddresses = Array.from(new Set([...escrowFactoryAddresses, ...erc8183FactoryAddresses]));
  if (factoryAddresses.length === 0) {
    return { chainKey: chain.key, indexedEvents: 0, skipped: 'no escrow factories configured' };
  }

  let provider: JsonRpcProvider | null = null;
  let latestBlock = 0;
  const rpcErrors: string[] = [];
  for (const rpcUrl of rpcUrls) {
    try {
      const candidate = new JsonRpcProvider(rpcUrl);
      const network = await candidate.getNetwork();
      if (Number(network.chainId) !== chain.chainId) {
        throw new Error(`${chain.key} RPC returned chainId ${network.chainId}`);
      }
      latestBlock = await candidate.getBlockNumber();
      provider = candidate;
      break;
    } catch (error: any) {
      rpcErrors.push(error.message || String(error));
    }
  }
  if (!provider) {
    throw new Error(`${chain.key} RPC unavailable: ${rpcErrors.join(' | ')}`.slice(0, 1000));
  }

  const finalizedBlock = Math.max(0, latestBlock - chain.confirmationDepth);
  const cursor = await (prisma as any).chainIndexerCursor.upsert({
    where: { chainKey: chain.key },
    update: { cursorStatus: 'ACTIVE', lastStartedAt: new Date() },
    create: {
      chainKey: chain.key,
      chainId: chain.chainId,
      caip2Network: chain.caip2Network,
      confirmationDepth: chain.confirmationDepth,
      reorgDepth: chain.reorgDepth,
      lastIndexedBlock: String(indexerStartBlock(chain, finalizedBlock) - 1),
      lastStartedAt: new Date(),
    },
  });

  if (cursor.cursorStatus === 'PAUSED') {
    return { chainKey: chain.key, indexedEvents: 0, skipped: 'cursor paused' };
  }

  const lastIndexedBlock = Number(cursor.lastIndexedBlock || '0');
  const startBlock = configuredIndexerStartBlock(chain) ?? 0;
  const reorgDepth = Math.max(0, Number(cursor.reorgDepth ?? chain.reorgDepth ?? 0));
  const reorgScanBlock = cursor.reorgScanBlock === null || cursor.reorgScanBlock === undefined
    ? null
    : Number(cursor.reorgScanBlock);
  const scanPlan = planChainIndexerRanges({
    lastIndexedBlock,
    finalizedBlock,
    startBlock,
    reorgDepth,
    maxBlocks,
    reorgScanBlock,
  });

  if (scanPlan.ranges.length === 0) {
    const finalizedHash = finalizedBlock > 0 ? (await provider.getBlock(finalizedBlock))?.hash : undefined;
    await (prisma as any).chainIndexerCursor.update({
      where: { chainKey: chain.key },
      data: {
        finalizedBlock: String(finalizedBlock),
        lastBlockHash: finalizedHash ? normalizeHash(finalizedHash) : undefined,
        confirmationDepth: chain.confirmationDepth,
        reorgDepth: chain.reorgDepth,
        lastSucceededAt: new Date(),
      },
    });
    return { chainKey: chain.key, indexedEvents: 0, toBlock: finalizedBlock };
  }

  let indexedEvents = 0;
  let reorgedEvents = 0;
  let recomputedEscrows = 0;

  for (const range of scanPlan.ranges) {
    const rangeSummary = await scanCanonicalEventRange({
      chain,
      provider,
      latestBlock,
      fromBlock: range.fromBlock,
      toBlock: range.toBlock,
      factoryAddresses,
      escrowFactoryAddresses,
      erc8183FactoryAddresses,
    });
    indexedEvents += rangeSummary.indexedEvents;
    reorgedEvents += rangeSummary.reorgedEvents;
    recomputedEscrows += rangeSummary.recomputedEscrows;
  }

  const lastIndexedHash = scanPlan.nextLastIndexedBlock > 0
    ? (await provider.getBlock(scanPlan.nextLastIndexedBlock))?.hash
    : undefined;
  await (prisma as any).chainIndexerCursor.update({
    where: { chainKey: chain.key },
    data: {
      lastIndexedBlock: String(scanPlan.nextLastIndexedBlock),
      finalizedBlock: String(finalizedBlock),
      lastBlockHash: lastIndexedHash ? normalizeHash(lastIndexedHash) : undefined,
      reorgScanBlock: scanPlan.nextReorgScanBlock !== undefined ? String(scanPlan.nextReorgScanBlock) : undefined,
      confirmationDepth: chain.confirmationDepth,
      reorgDepth: chain.reorgDepth,
      cursorStatus: 'ACTIVE',
      lastError: null,
      lastSucceededAt: new Date(),
    },
  });

  return {
    chainKey: chain.key,
    indexedEvents,
    reorgedEvents,
    recomputedEscrows,
    fromBlock: Math.min(...scanPlan.ranges.map(range => range.fromBlock)),
    toBlock: Math.max(...scanPlan.ranges.map(range => range.toBlock)),
  };
}

export async function runChainIndexerOnce(chainKeys?: ChainKey[]): Promise<ChainIndexerRunSummary[]> {
  const keys = chainKeys?.length ? chainKeys : Object.keys(CHAINS) as ChainKey[];
  const summaries: ChainIndexerRunSummary[] = [];

  for (const key of keys) {
    const chain = CHAINS[key];
    try {
      summaries.push(await scanChain(chain));
    } catch (error: any) {
      await (prisma as any).chainIndexerCursor.upsert({
        where: { chainKey: key },
        update: {
          cursorStatus: 'ERROR',
          lastError: error.message?.slice(0, 1000) || String(error).slice(0, 1000),
          updatedAt: new Date(),
        },
        create: {
          chainKey: key,
          chainId: chain.chainId,
          caip2Network: chain.caip2Network,
          cursorStatus: 'ERROR',
          lastError: error.message?.slice(0, 1000) || String(error).slice(0, 1000),
          confirmationDepth: chain.confirmationDepth,
          reorgDepth: chain.reorgDepth,
        },
      }).catch(() => undefined);
      summaries.push({ chainKey: key, indexedEvents: 0, error: error.message || String(error) });
    }
  }

  return summaries;
}

export function startChainIndexerLoop(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (process.env.AAE_ENABLE_CHAIN_INDEXER !== 'true') {
    console.log('[ChainIndexer] Disabled — set AAE_ENABLE_CHAIN_INDEXER=true to run.');
    return;
  }

  let running = false;
  const run = async () => {
    if (running) {
      console.warn('[ChainIndexer] Previous run still active; skipping overlapping poll.');
      return;
    }
    running = true;
    try {
      const summaries = await runChainIndexerOnce();
      const indexed = summaries.reduce((sum, item) => sum + item.indexedEvents, 0);
      const reorged = summaries.reduce((sum, item) => sum + (item.reorgedEvents || 0), 0);
      const errors = summaries.filter(item => item.error);
      if (indexed > 0 || reorged > 0 || errors.length > 0) {
        console.log(`[ChainIndexer] Indexed ${indexed} event(s); reorged=${reorged}; errors=${errors.length}`);
      }
    } finally {
      running = false;
    }
  };

  run().catch(error => console.error('[ChainIndexer] Initial run failed:', error));
  setInterval(() => {
    run().catch(error => console.error('[ChainIndexer] Run failed:', error));
  }, intervalMs);
  console.log(`[ChainIndexer] Started — polling every ${intervalMs / 1000}s`);
}
