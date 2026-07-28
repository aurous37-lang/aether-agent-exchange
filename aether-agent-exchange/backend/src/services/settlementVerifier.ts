import { createHash } from 'crypto';
import { Interface, JsonRpcProvider } from 'ethers';
import prisma from '../lib/prisma';
import { getChainById, getChainByKey, normalizeChainKey, rpcUrlsForChain, type ChainConfig } from '../config/chains';
import {
  amountToUnits,
  assertReceiptMatchesJob,
  assertSettlementInputMatchesJob,
  canonicalReceiptHash,
  isPaidChainRail,
  JobSettlementShape,
  normalizeAddress,
  normalizeHash,
  normalizeReceiptHash,
  recordSettlementReceipt,
  SettlementError,
  SettlementReceiptInput,
} from './settlement';

const SUCCESS_STATUSES = new Set(['1', '0x1', 'success', 'succeeded', 'settled', 'confirmed', 'complete', 'completed', 'mined', 'true']);
const FUNDED_STATES = new Set(['1', 'FUNDED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED', 'DISPUTED', 'RESOLVED']);
const RELEASED_STATES = new Set(['4', '6', 'COMPLETED', 'RESOLVED']);
const FUNDING_EVENTS = new Set(['EscrowFunded', 'JobFunded', 'Transfer']);
const RELEASE_EVENTS = new Set(['JobApproved', 'JobAutoReleased', 'PaymentReleased', 'DisputeResolved']);

export type SettlementProofCondition = 'funding' | 'release' | 'payment';

export interface SettlementProofLog {
  address?: string;
  eventName?: string;
  args?: Record<string, unknown>;
  logIndex?: number;
}

export interface SettlementContractStateProof {
  address?: string;
  state?: string | number;
  escrowAmount?: string | number;
  balance?: string | number;
  nativeBalance?: string | number;
  paymentToken?: string;
  tokenAddress?: string;
  jobId?: string;
  contractVersion?: string;
}

export interface SettlementVerificationProofInput {
  provider?: string;
  network?: string;
  chainId?: number;
  txHash?: string;
  receiptHash?: string;
  status?: string | number | boolean;
  to?: string;
  from?: string;
  value?: string | number;
  blockNumber?: string | number;
  logs?: SettlementProofLog[];
  contractState?: SettlementContractStateProof;
  condition?: SettlementProofCondition;
}

interface IndexedSettlementReceipt {
  provider: string;
  network: string;
  chainId: number;
  txHash: string;
  receiptHash?: string;
  status: string;
  to?: string;
  from?: string;
  value?: string;
  blockNumber?: string;
  blockHash?: string;
  confirmations?: number;
  finalityStatus?: 'PENDING' | 'FINAL';
  logs: SettlementProofLog[];
  contractState?: SettlementContractStateProof;
}

interface SettlementReceiptProvider {
  readonly id: string;
  getReceipt(txHash: string): Promise<IndexedSettlementReceipt | null>;
}

interface ProofMatch {
  type: 'event' | 'contract-state';
  eventName?: string;
  logIndex?: number;
  state?: string;
}

interface VerificationPass {
  id: string;
  receiptHash: string;
  proofHash: string;
  proofType: string;
  provider: string;
}

type ExpectedEvmChain = { network: string; chainId: number; config: ChainConfig };

const eventInterfaces = [
  new Interface([
    'event EscrowFunded(bytes32 indexed jobId, address indexed client, uint256 amount)',
    'event EscrowFunded(uint256 indexed jobId, uint256 amount)',
    'event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount)',
    'event JobApproved(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee)',
    'event JobAutoReleased(bytes32 indexed jobId, uint256 agentPayout, uint256 platformFee)',
    'event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)',
    'event PlatformFeePaid(uint256 indexed jobId, address indexed feeCollector, uint256 amount)',
    'event DisputeResolved(bytes32 indexed jobId, address indexed recipient, uint256 recipientAmount, uint256 otherAmount)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]),
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function assertValidTxHash(value?: string | null): string {
  const normalized = normalizeHash(value);
  if (!normalized || !/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new SettlementError('Settlement verifier requires a valid txHash');
  }
  return normalized;
}

function normalizeProofReceiptHash(value?: string | null): string | undefined {
  return normalizeReceiptHash(value) || undefined;
}

function normalizeProofAddress(value?: string | null): string | undefined {
  const normalized = normalizeAddress(value);
  if (!normalized) return undefined;
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new SettlementError('Settlement verifier proof contains an invalid address');
  }
  return normalized;
}

function proofHash(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function normalizeNetwork(value?: string | null): string | undefined {
  return normalizeChainKey(value);
}

function statusSucceeded(status: unknown): boolean {
  if (status === true || status === 1) return true;
  const normalized = stringValue(status)?.toLowerCase();
  return Boolean(normalized && SUCCESS_STATUSES.has(normalized));
}

function getVerificationProof(input: SettlementReceiptInput): SettlementVerificationProofInput | undefined {
  const proof = asRecord(input.verificationProof);
  if (!proof) return undefined;
  return proof as SettlementVerificationProofInput;
}

function proofCondition(input: SettlementReceiptInput, receipt?: SettlementVerificationProofInput): SettlementProofCondition {
  const raw = input.condition || receipt?.condition || 'funding';
  if (raw === 'funding' || raw === 'release' || raw === 'payment') return raw;
  throw new SettlementError(`Unsupported settlement proof condition: ${raw}`);
}

function normalizeFixtureProof(proof: SettlementVerificationProofInput, txHash: string): IndexedSettlementReceipt {
  const chainId = numberValue(proof.chainId);
  const network = normalizeNetwork(proof.network);
  const finalityStatus = stringValue((proof as any).finalityStatus)?.toUpperCase();
  const logs = Array.isArray(proof.logs) ? proof.logs.map((log, index) => ({
    address: normalizeProofAddress(log.address),
    eventName: stringValue(log.eventName),
    args: asRecord(log.args) || {},
    logIndex: numberValue(log.logIndex) ?? index,
  })) : [];
  const contractState = proof.contractState ? {
    ...proof.contractState,
    address: normalizeProofAddress(proof.contractState.address),
    paymentToken: normalizeProofAddress(proof.contractState.paymentToken),
    tokenAddress: normalizeProofAddress(proof.contractState.tokenAddress),
  } : undefined;

  return {
    provider: 'fixture',
    network: network || '',
    chainId: chainId || 0,
    txHash: assertValidTxHash(proof.txHash || txHash),
    receiptHash: normalizeProofReceiptHash(proof.receiptHash),
    status: stringValue(proof.status) || '',
    to: normalizeProofAddress(proof.to),
    from: normalizeProofAddress(proof.from),
    value: stringValue(proof.value),
    blockNumber: stringValue(proof.blockNumber),
    blockHash: normalizeHash(stringValue((proof as any).blockHash)) || 'fixture',
    confirmations: numberValue((proof as any).confirmations),
    finalityStatus: finalityStatus === 'PENDING' || finalityStatus === 'FINAL' ? finalityStatus : undefined,
    logs,
    contractState,
  };
}

class FixtureSettlementReceiptProvider implements SettlementReceiptProvider {
  readonly id = 'fixture';

  constructor(private readonly proof: SettlementVerificationProofInput) {
  }

  async getReceipt(txHash: string): Promise<IndexedSettlementReceipt | null> {
    return normalizeFixtureProof(this.proof, txHash);
  }
}

function parsedArgsToRecord(args: any): Record<string, string> {
  const record: Record<string, string> = {};
  for (const key of Object.keys(args)) {
    if (/^\d+$/.test(key)) continue;
    record[key] = String(args[key]);
  }
  return record;
}

function parseEthersLog(log: any): SettlementProofLog | null {
  for (const eventInterface of eventInterfaces) {
    try {
      const parsed = eventInterface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed) continue;
      const args = parsedArgsToRecord(parsed.args);
      parsed.fragment.inputs.forEach((input, index) => {
        if (input.name && args[input.name] === undefined) {
          args[input.name] = String(parsed.args[index]);
        }
      });
      return {
        address: normalizeProofAddress(log.address),
        eventName: parsed.name,
        args,
        logIndex: numberValue(log.index),
      };
    } catch {
      // Try the next event ABI.
    }
  }
  return null;
}

class EvmRpcSettlementReceiptProvider implements SettlementReceiptProvider {
  readonly id: string;

  constructor(
    private readonly chain: ChainConfig,
    private readonly rpcUrls: string[],
  ) {
    this.id = `${chain.key}-rpc`;
  }

  async getReceipt(txHash: string): Promise<IndexedSettlementReceipt | null> {
    let lastError: unknown;
    for (const rpcUrl of this.rpcUrls) {
      try {
        const provider = new JsonRpcProvider(rpcUrl);
        const [network, receipt, transaction, latestBlock] = await Promise.all([
          provider.getNetwork(),
          provider.getTransactionReceipt(txHash),
          provider.getTransaction(txHash),
          provider.getBlockNumber(),
        ]);
        if (Number(network.chainId) !== this.chain.chainId) {
          throw new SettlementError(`${this.chain.key} RPC returned chainId ${network.chainId}`, 503);
        }
        if (!receipt) continue;
        const confirmations = receipt.blockNumber === null || receipt.blockNumber === undefined
          ? 0
          : Math.max(0, latestBlock - receipt.blockNumber);

        return {
          provider: this.id,
          network: this.chain.key,
          chainId: Number(network.chainId),
          txHash: assertValidTxHash((receipt as any).hash || (receipt as any).transactionHash || txHash),
          status: receipt.status === 1 ? 'success' : 'failed',
          to: normalizeProofAddress(transaction?.to || undefined),
          from: normalizeProofAddress(transaction?.from || undefined),
          value: transaction?.value?.toString(),
          blockNumber: receipt.blockNumber?.toString(),
          blockHash: normalizeHash((receipt as any).blockHash) || undefined,
          confirmations,
          finalityStatus: confirmations >= this.chain.confirmationDepth ? 'FINAL' : 'PENDING',
          logs: receipt.logs.map(parseEthersLog).filter((log): log is SettlementProofLog => Boolean(log)),
        };
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return null;
  }
}

function expectedEvmChain(job: JobSettlementShape, input?: SettlementReceiptInput): ExpectedEvmChain | null {
  const network = normalizeNetwork(input?.network || job.network);
  const chainId = input?.chainId || job.chainId || undefined;
  const byNetwork = network ? getChainByKey(network) : undefined;
  const byChainId = chainId ? getChainById(chainId) : undefined;
  if (byNetwork && byChainId && byNetwork.chainId !== byChainId.chainId) return null;
  const chain = byNetwork || byChainId;
  return chain ? { network: chain.key, chainId: chain.chainId, config: chain } : null;
}

function createSettlementReceiptProvider(input: SettlementReceiptInput, expected: ExpectedEvmChain): SettlementReceiptProvider {
  const fixture = getVerificationProof(input);
  if (fixture) {
    if (fixture.provider && fixture.provider !== 'fixture') {
      throw new SettlementError('Inline settlement verification proof must use fixture provider; omit fixture proof to use live EVM RPC indexing', 409);
    }
    if (process.env.NODE_ENV === 'production' && process.env.AAE_ENABLE_SETTLEMENT_FIXTURE_VERIFIER !== 'true') {
      throw new SettlementError('Fixture settlement verification is disabled in production', 503);
    }
    return new FixtureSettlementReceiptProvider(fixture);
  }

  if (process.env[expected.config.receiptIndexerEnvFlag] !== 'true') {
    throw new SettlementError(`EVM settlement verifier requires fixture proof or ${expected.config.receiptIndexerEnvFlag}=true`, 503);
  }

  if (expected.config.paidRailsEnabledEnvFlag && process.env[expected.config.paidRailsEnabledEnvFlag] !== 'true') {
    throw new SettlementError(`${expected.config.name} receipt indexing requires ${expected.config.paidRailsEnabledEnvFlag}=true`, 503);
  }

  const rpcUrls = rpcUrlsForChain(expected.config);
  if (rpcUrls.length === 0) {
    throw new SettlementError(`${expected.config.rpcEnvVar} is required for live ${expected.config.name} settlement receipt indexing`, 503);
  }
  return new EvmRpcSettlementReceiptProvider(expected.config, rpcUrls);
}

function finalityForReceipt(receipt: IndexedSettlementReceipt, expected: ExpectedEvmChain): { confirmations: number; finalityStatus: 'PENDING' | 'FINAL' } {
  const confirmations = Number.isFinite(receipt.confirmations)
    ? Number(receipt.confirmations)
    : receipt.provider === 'fixture'
      ? expected.config.confirmationDepth
      : 0;
  const finalityStatus = receipt.finalityStatus || (confirmations >= expected.config.confirmationDepth ? 'FINAL' : 'PENDING');
  return { confirmations, finalityStatus };
}

function argValue(log: SettlementProofLog, keys: string[]): string | undefined {
  const args = asRecord(log.args) || {};
  for (const key of keys) {
    const direct = stringValue(args[key]);
    if (direct !== undefined) return direct;
    const lowerKey = Object.keys(args).find(candidate => candidate.toLowerCase() === key.toLowerCase());
    if (lowerKey) return stringValue(args[lowerKey]);
  }
  return undefined;
}

function argAddress(log: SettlementProofLog, keys: string[]): string | undefined {
  const value = argValue(log, keys);
  return value ? normalizeProofAddress(value) : undefined;
}

function argUnits(log: SettlementProofLog, keys: string[]): bigint | undefined {
  const value = argValue(log, keys);
  return value && /^\d+$/.test(value) ? BigInt(value) : undefined;
}

function stateUnits(state: SettlementContractStateProof | undefined): bigint | undefined {
  const raw = stringValue(state?.escrowAmount) || stringValue(state?.balance) || stringValue(state?.nativeBalance);
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined;
}

function normalizeStateName(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const numericStates: Record<string, string> = {
    '0': 'UNFUNDED',
    '1': 'FUNDED',
    '2': 'IN_PROGRESS',
    '3': 'PENDING_REVIEW',
    '4': 'COMPLETED',
    '5': 'DISPUTED',
    '6': 'RESOLVED',
    '7': 'CANCELLED',
  };
  return numericStates[raw] || raw.toUpperCase();
}

function matchesExpectedEscrow(log: SettlementProofLog, expectedEscrow: string): boolean {
  const logAddress = normalizeAddress(log.address);
  if (logAddress === expectedEscrow) return true;
  const to = argAddress(log, ['to', 'recipient', 'escrow', 'escrowAddress']);
  return to === expectedEscrow;
}

function normalizeProofJobId(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^0x[a-fA-F0-9]+$/.test(value)) return normalizeHash(value) || undefined;
  if (/^\d+$/.test(value)) {
    const hex = BigInt(value).toString(16);
    return hex.length <= 64 ? `0x${hex.padStart(64, '0')}` : undefined;
  }
  return normalizeHash(value) || undefined;
}

function proofJobId(log: SettlementProofLog): string | undefined {
  return normalizeProofJobId(argValue(log, ['jobId']));
}

function proofJobMatches(log: SettlementProofLog, expectedOnchainJobId?: string): boolean {
  const actual = proofJobId(log);
  if (!actual) return false;
  return Boolean(expectedOnchainJobId && actual === expectedOnchainJobId);
}

function releaseEventGrossUnits(log: SettlementProofLog, logs: SettlementProofLog[], expectedOnchainJobId?: string): bigint | undefined {
  if (log.eventName === 'JobApproved' || log.eventName === 'JobAutoReleased') {
    const payout = argUnits(log, ['agentPayout', 'providerAmount', 'recipientAmount']);
    const fee = argUnits(log, ['platformFee', 'fee']);
    return payout === undefined || fee === undefined ? undefined : payout + fee;
  }

  if (log.eventName === 'DisputeResolved') {
    const recipientAmount = argUnits(log, ['recipientAmount']);
    const otherAmount = argUnits(log, ['otherAmount']);
    return recipientAmount === undefined || otherAmount === undefined ? undefined : recipientAmount + otherAmount;
  }

  if (log.eventName === 'PaymentReleased') {
    const payout = argUnits(log, ['amount', 'providerAmount', 'agentPayout']);
    if (payout === undefined) return undefined;
    const feeLog = logs.find((candidate) => {
      if (candidate.eventName !== 'PlatformFeePaid') return false;
      const candidateJobId = proofJobId(candidate);
      return Boolean(expectedOnchainJobId && candidateJobId === expectedOnchainJobId);
    });
    const fee = feeLog ? argUnits(feeLog, ['amount', 'platformFee', 'fee']) : 0n;
    return fee === undefined ? undefined : payout + fee;
  }

  return undefined;
}

function nativeSymbolForExpectedNetwork(expected: ExpectedEvmChain | null): string | null {
  return expected?.config.nativeCurrency.symbol || null;
}

function assertNoNativeTokenConfusion(job: JobSettlementShape, input: SettlementReceiptInput, receipt: IndexedSettlementReceipt): void {
  const tokenSymbol = input.tokenSymbol || job.budgetToken;
  const nativeValue = receipt.value && /^\d+$/.test(receipt.value) ? BigInt(receipt.value) : 0n;
  const nativeSymbol = nativeSymbolForExpectedNetwork(expectedEvmChain(job, input));

  if (nativeSymbol && job.budgetToken === nativeSymbol) {
    if (input.tokenAddress || receipt.logs.some(log => log.eventName === 'Transfer')) {
      throw new SettlementError(`Native ${nativeSymbol} settlement proof must not use ERC20 token evidence`, 409);
    }
    return;
  }

  if (nativeSymbol && tokenSymbol === nativeSymbol) {
    throw new SettlementError(`ERC20 paid-chain settlement must not be recorded as native ${nativeSymbol}`, 409);
  }
  if (nativeValue > 0n) {
    throw new SettlementError(`ERC20 settlement proof must not include native ${nativeSymbol || 'token'} value`, 409);
  }
}

function findEventProof(
  job: JobSettlementShape,
  input: SettlementReceiptInput,
  receipt: IndexedSettlementReceipt,
  condition: SettlementProofCondition,
): ProofMatch | null {
  const expectedEscrow = normalizeAddress(job.escrowAddress || input.escrowAddress);
  if (!expectedEscrow) return null;

  const expectedUnits = amountToUnits(input.amount, input.tokenSymbol || job.budgetToken);
  const allowedEvents = condition === 'release' ? RELEASE_EVENTS : FUNDING_EVENTS;
  const expectedOnchainJobId = normalizeHash(input.onchainJobId || job.onchainJobId) || undefined;

  for (const log of receipt.logs) {
    const eventName = log.eventName;
    if (!eventName || !allowedEvents.has(eventName)) continue;

    if (eventName === 'Transfer') {
      const to = argAddress(log, ['to', 'recipient']);
      if (to !== expectedEscrow) continue;
      const value = argUnits(log, ['value', 'amount']);
      if (value !== expectedUnits) continue;
      if (job.tokenAddress && normalizeAddress(log.address) !== normalizeAddress(job.tokenAddress)) continue;
      return { type: 'event', eventName, logIndex: log.logIndex };
    }

    const subjectMatches = matchesExpectedEscrow(log, expectedEscrow) || proofJobMatches(log, expectedOnchainJobId);
    if (!subjectMatches) continue;

    const amount = condition === 'release'
      ? releaseEventGrossUnits(log, receipt.logs, expectedOnchainJobId)
      : argUnits(log, ['amount', 'escrowAmount', 'grossAmount']);
    if (amount === undefined || amount !== expectedUnits) continue;

    const proofAaeJobId = argValue(log, ['aaeJobId']);
    if (proofAaeJobId && proofAaeJobId !== job.id) {
      throw new SettlementError('Settlement proof job id does not match requested job', 409);
    }
    const proofOnchainJobId = proofJobId(log);
    if (proofOnchainJobId) {
      if (!expectedOnchainJobId) {
        throw new SettlementError('Settlement proof onchain job id requires matching job metadata', 409);
      }
      if (proofOnchainJobId !== expectedOnchainJobId) {
        throw new SettlementError('Settlement proof onchain job id does not match requested job', 409);
      }
    }

    return { type: 'event', eventName, logIndex: log.logIndex };
  }

  return null;
}

function findStateProof(
  job: JobSettlementShape,
  input: SettlementReceiptInput,
  receipt: IndexedSettlementReceipt,
  condition: SettlementProofCondition,
): ProofMatch | null {
  const state = receipt.contractState;
  if (!state) return null;

  const expectedEscrow = normalizeAddress(job.escrowAddress || input.escrowAddress);
  if (!expectedEscrow || normalizeAddress(state.address) !== expectedEscrow) return null;

  const expectedUnits = amountToUnits(input.amount, input.tokenSymbol || job.budgetToken);
  const amount = stateUnits(state);
  if (amount === undefined) {
    throw new SettlementError('Settlement contract state proof must include amount evidence', 409);
  }
  if (amount !== expectedUnits) return null;

  if (job.tokenAddress && normalizeAddress(state.paymentToken || state.tokenAddress) !== normalizeAddress(job.tokenAddress)) {
    throw new SettlementError('Settlement contract state token does not match job tokenAddress', 409);
  }
  const nativeSymbol = nativeSymbolForExpectedNetwork(expectedEvmChain(job, input));
  if (nativeSymbol && job.budgetToken === nativeSymbol && (state.paymentToken || state.tokenAddress)) {
    throw new SettlementError(`Native ${nativeSymbol} settlement state must not include an ERC20 token address`, 409);
  }

  const stateName = normalizeStateName(state.state);
  if (!stateName) return null;
  const allowedStates = condition === 'release' ? RELEASED_STATES : FUNDED_STATES;
  if (!allowedStates.has(stateName)) return null;

  return { type: 'contract-state', state: stateName };
}

async function assertEscrowUniqueForJob(job: JobSettlementShape): Promise<void> {
  const escrowAddress = normalizeAddress(job.escrowAddress);
  if (!escrowAddress) return;

  const candidates = await prisma.job.findMany({
    where: {
      id: { not: job.id },
      chainId: job.chainId || undefined,
      network: job.network || undefined,
      settlementRail: job.settlementRail || undefined,
      escrowAddress: { not: null },
    },
    select: { id: true, escrowAddress: true },
  });

  if (candidates.some(candidate => normalizeAddress(candidate.escrowAddress) === escrowAddress)) {
    throw new SettlementError('Escrow address is already linked to another job on this rail and chain', 409);
  }
}

async function assertLedgerReferencesAreAvailable(job: JobSettlementShape, txHash: string, receiptHash?: string): Promise<void> {
  const references = await prisma.paymentLedger.findMany({
    where: {
      OR: [
        { txHash },
        ...(receiptHash ? [{ receiptHash }] : []),
      ],
    },
    select: { id: true, jobId: true, txHash: true, receiptHash: true },
  });

  for (const reference of references) {
    if (reference.jobId !== job.id) {
      throw new SettlementError('PaymentLedger receipt reference is already linked to another job', 409);
    }
    if (reference.txHash && normalizeHash(reference.txHash) !== txHash) {
      throw new SettlementError('PaymentLedger txHash does not match settlement input', 409);
    }
    if (receiptHash && normalizeReceiptHash(reference.receiptHash) !== receiptHash) {
      throw new SettlementError('PaymentLedger receiptHash does not match settlement input', 409);
    }
  }
}

function sanitizedSummary(input: {
  job: JobSettlementShape;
  receipt: IndexedSettlementReceipt;
  match: ProofMatch;
  condition: SettlementProofCondition;
  receiptHash: string;
  input: SettlementReceiptInput;
}) {
  return {
    source: 'evm-chain-settlement-verifier',
    provider: input.receipt.provider,
    jobId: input.job.id,
    onchainJobId: input.input.onchainJobId || input.job.onchainJobId,
    rail: input.input.rail,
    condition: input.condition,
    network: input.receipt.network,
    chainId: input.receipt.chainId,
    txHash: input.receipt.txHash,
    receiptHash: input.receiptHash,
    onchainStatus: input.receipt.status,
    escrowAddress: normalizeAddress(input.job.escrowAddress || input.input.escrowAddress),
    amount: String(input.input.amount),
    tokenSymbol: input.input.tokenSymbol || input.job.budgetToken,
    tokenAddress: normalizeAddress(input.input.tokenAddress),
    escrowContractVersion: input.input.escrowContractVersion || input.job.escrowContractVersion,
    proofType: input.match.type,
    eventName: input.match.eventName,
    logIndex: input.match.logIndex,
    state: input.match.state,
    blockNumber: input.receipt.blockNumber,
    confirmations: input.receipt.confirmations,
    finalityStatus: input.receipt.finalityStatus,
    rawCalldataStored: false,
    rawSignaturesStored: false,
    rawPaymentHeadersStored: false,
    privateKeysStored: false,
  };
}

async function persistVerificationFailure(job: JobSettlementShape, input: SettlementReceiptInput, error: Error): Promise<void> {
  const txHash = normalizeHash(input.txHash) || 'invalid';
  const expected = expectedEvmChain(job, input);
  const receiptHash = normalizeReceiptHash(input.receiptHash)
    || normalizeReceiptHash(getVerificationProof(input)?.receiptHash)
    || canonicalReceiptHash({ jobId: job.id, txHash, failed: true, reason: error.message });

  try {
    await (prisma as any).settlementReceiptVerification.create({
      data: {
        jobId: job.id,
        provider: getVerificationProof(input)?.provider || 'unresolved',
        source: expected?.network || input.network || job.network || 'unknown',
        rail: input.rail || job.settlementRail || 'standard',
        condition: input.condition || 'funding',
        escrowContractVersion: input.escrowContractVersion || job.escrowContractVersion,
        chainId: input.chainId || job.chainId || expected?.chainId || 0,
        network: input.network || job.network || expected?.network || 'unknown',
        txHash,
        receiptHash,
        status: 'FAILED',
        failureReason: error.message.slice(0, 1000),
        escrowAddress: normalizeAddress(input.escrowAddress || job.escrowAddress),
        recipientAddress: normalizeAddress(input.recipientAddress),
        amount: input.amount === undefined ? undefined : String(input.amount),
        tokenSymbol: input.tokenSymbol || job.budgetToken,
        tokenAddress: normalizeAddress(input.tokenAddress),
        verifiedAt: new Date(),
      },
    });
  } catch {
    // Verification failure persistence must not hide the verifier error.
  }
}

async function verifySettlementReceipt(job: JobSettlementShape, input: SettlementReceiptInput): Promise<VerificationPass> {
  try {
    if (!isPaidChainRail(job)) {
      throw new SettlementError('Settlement verifier only creates settled receipts for paid-chain rails', 409);
    }
    const expected = expectedEvmChain(job, input);
    if (!expected) {
      throw new SettlementError('Settlement verifier supports configured EVM networks only', 409);
    }
    if (job.network !== expected.network || job.chainId !== expected.chainId || input.network !== expected.network || input.chainId !== expected.chainId) {
      throw new SettlementError(`Settlement verifier expected ${expected.network} chainId ${expected.chainId}`, 409);
    }
    if (expected.config.paidRailsEnabledEnvFlag && process.env[expected.config.paidRailsEnabledEnvFlag] !== 'true') {
      throw new SettlementError(`${expected.config.name} settlement verification requires ${expected.config.paidRailsEnabledEnvFlag}=true`, 503);
    }
    if ((input.status || 'SETTLED') !== 'SETTLED') {
      throw new SettlementError('Settlement verifier only records settled receipts', 409);
    }

    assertSettlementInputMatchesJob(job, input);
    await assertEscrowUniqueForJob(job);

    const txHash = assertValidTxHash(input.txHash);
    const claimedReceiptHash = normalizeReceiptHash(input.receiptHash)
      || normalizeProofReceiptHash(getVerificationProof(input)?.receiptHash);
    await assertLedgerReferencesAreAvailable(job, txHash, claimedReceiptHash);

    const provider = createSettlementReceiptProvider(input, expected);
    const indexedReceipt = await provider.getReceipt(txHash);
    if (!indexedReceipt) {
      throw new SettlementError('Onchain receipt was not found', 404);
    }

    if (indexedReceipt.txHash !== txHash) {
      throw new SettlementError('Onchain receipt txHash does not match settlement input', 409);
    }
    if (indexedReceipt.network !== expected.network || indexedReceipt.chainId !== expected.chainId) {
      throw new SettlementError(`Onchain receipt must be for ${expected.network} chainId ${expected.chainId}`, 409);
    }
    if (!statusSucceeded(indexedReceipt.status)) {
      throw new SettlementError('Onchain receipt status did not succeed', 409);
    }
    const finality = finalityForReceipt(indexedReceipt, expected);
    if (finality.finalityStatus !== 'FINAL') {
      throw new SettlementError(
        `${expected.config.name} settlement receipt requires ${expected.config.confirmationDepth} confirmations before final settlement; received ${finality.confirmations}`,
        409,
      );
    }
    indexedReceipt.confirmations = finality.confirmations;
    indexedReceipt.finalityStatus = finality.finalityStatus;

    const receiptHash = normalizeReceiptHash(input.receiptHash)
      || normalizeProofReceiptHash(indexedReceipt.receiptHash)
      || canonicalReceiptHash({
        provider: indexedReceipt.provider,
        chainId: indexedReceipt.chainId,
        network: indexedReceipt.network,
        txHash,
        blockNumber: indexedReceipt.blockNumber,
      });
    if (!receiptHash) {
      throw new SettlementError('Settlement verifier requires a valid receiptHash');
    }

    if (indexedReceipt.receiptHash && normalizeProofReceiptHash(indexedReceipt.receiptHash) !== receiptHash) {
      throw new SettlementError('Onchain receipt hash does not match settlement input', 409);
    }

    assertNoNativeTokenConfusion(job, input, indexedReceipt);
    const condition = proofCondition(input, getVerificationProof(input));
    if ((job.settlementRail === 'standard' || job.settlementRail === 'erc8183') && condition === 'funding') {
      throw new SettlementError('Paid escrow settlement receipts must prove release, payment, or dispute-resolution; funding proof is not final settlement', 409);
    }
    const match = findEventProof(job, input, indexedReceipt, condition)
      || findStateProof(job, input, indexedReceipt, condition);
    if (!match) {
      throw new SettlementError('Settlement proof did not include a matching event or contract state', 409);
    }

    const summary = sanitizedSummary({ job, receipt: indexedReceipt, match, condition, receiptHash, input });
    const evidenceHash = proofHash(summary);
    const verification = await (prisma as any).settlementReceiptVerification.create({
      data: {
        jobId: job.id,
        provider: provider.id,
        source: indexedReceipt.network,
        rail: input.rail,
        condition,
        escrowContractVersion: input.escrowContractVersion || job.escrowContractVersion,
        chainId: indexedReceipt.chainId,
        network: indexedReceipt.network,
        txHash,
        receiptHash,
        status: 'PASSED',
        onchainStatus: indexedReceipt.status,
        proofType: match.type,
        proofHash: evidenceHash,
        proofSummary: JSON.stringify(summary),
        blockNumber: indexedReceipt.blockNumber,
        logIndex: match.logIndex,
        eventName: match.eventName,
        escrowAddress: normalizeAddress(job.escrowAddress || input.escrowAddress),
        recipientAddress: normalizeAddress(input.recipientAddress),
        amount: String(input.amount),
        tokenSymbol: input.tokenSymbol || job.budgetToken,
        tokenAddress: normalizeAddress(input.tokenAddress),
        verifiedAt: new Date(),
      },
    });

    return {
      id: verification.id,
      receiptHash,
      proofHash: evidenceHash,
      proofType: match.type,
      provider: provider.id,
    };
  } catch (error: any) {
    await persistVerificationFailure(job, input, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function verifyAndRecordSettlementReceipt(jobId: string, input: SettlementReceiptInput) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new SettlementError('Job not found', 404);

  const txHash = normalizeHash(input.txHash);
  const receiptHash = normalizeReceiptHash(input.receiptHash)
    || normalizeProofReceiptHash(getVerificationProof(input)?.receiptHash);
  const existingLedger = txHash
    ? await prisma.paymentLedger.findUnique({ where: { txHash } })
    : receiptHash
      ? await prisma.paymentLedger.findUnique({ where: { receiptHash } })
      : null;

  if (existingLedger?.jobId === job.id) {
    assertSettlementInputMatchesJob(job, input);
    if (receiptHash && normalizeReceiptHash(existingLedger.receiptHash) !== receiptHash) {
      throw new SettlementError('PaymentLedger receiptHash does not match settlement input', 409);
    }
    assertReceiptMatchesJob(job, existingLedger);
    const existingVerification = await (prisma as any).settlementReceiptVerification.findFirst({
      where: {
        paymentLedgerId: existingLedger.id,
        status: 'PASSED',
        txHash: existingLedger.txHash || txHash || undefined,
        receiptHash: existingLedger.receiptHash,
      },
      select: { id: true },
    });
    if (!existingVerification) {
      throw new SettlementError('Existing PaymentLedger requires passed settlement verification before reuse', 409);
    }
    return existingLedger;
  }

  const verification = await verifySettlementReceipt(job, input);
  const ledger = await recordSettlementReceipt(job.id, {
    ...input,
    receiptHash: verification.receiptHash,
    redactedReferenceHash: input.redactedReferenceHash || verification.proofHash,
    redactedReferenceType: input.redactedReferenceType || `settlement-verifier:${verification.provider}`,
  });

  await (prisma as any).settlementReceiptVerification.update({
    where: { id: verification.id },
    data: { paymentLedgerId: ledger.id },
  });

  return ledger;
}
