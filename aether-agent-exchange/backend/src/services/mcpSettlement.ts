import prisma from '../lib/prisma';
import {
  assertReceiptMatchesJob,
  assertSettlementInputMatchesJob,
  canonicalReceiptHash,
  JobSettlementShape,
  SettlementError,
  SettlementReceiptInput,
} from './settlement';
import { verifyAndRecordSettlementReceipt } from './settlementVerifier';

export type BaseMcpReceiptKind = 'send' | 'send_calls' | 'x402_payment';

export interface BaseMcpSettlementOptions {
  kind?: BaseMcpReceiptKind;
  rail?: string;
  expectedRecipientAddress?: string;
  walletAddress?: string;
  endpoint?: string;
  escrowContractVersion?: string;
}

export interface NormalizedBaseMcpSettlementReceipt extends SettlementReceiptInput {
  kind: BaseMcpReceiptKind;
  receiptHash: string;
  redactedReference: string;
  redactedReferenceHash: string;
  redactedReferenceType: string;
}

type UnknownRecord = Record<string, unknown>;

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_NETWORK = 'base-sepolia';
const SUPPORTED_LEDGER_RAILS = new Set(['standard', 'erc8183', 'px402-dry-run']);
const CONFIRMED_SEND_STATUSES = new Set(['1', '0x1', 'confirmed', 'success', 'succeeded', 'settled', 'complete', 'completed', 'mined']);
const APPROVED_X402_STATUSES = new Set([...CONFIRMED_SEND_STATUSES, 'approved', 'paid']);

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function valueAt(input: unknown, path: Array<string | number>): unknown {
  let cursor: unknown = input;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[segment];
      continue;
    }
    const record = asRecord(cursor);
    if (!record || !(segment in record)) return undefined;
    cursor = record[segment];
  }
  return cursor;
}

function firstValue(input: unknown, paths: Array<Array<string | number>>): unknown {
  for (const path of paths) {
    const value = valueAt(input, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
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

function normalizeAddress(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new SettlementError('Base MCP receipt address is invalid');
  }
  return normalized;
}

function normalizeTxHash(value?: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !/^0x[a-f0-9]{64}$/.test(normalized)) {
    throw new SettlementError('Base MCP receipt txHash is required');
  }
  return normalized;
}

function normalizeReceiptHash(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (/^0x[a-f0-9]{64}$/.test(normalized)) return normalized;
  if (/^[a-f0-9]{64}$/.test(normalized)) return `0x${normalized}`;
  return undefined;
}

function normalizeNetwork(value: unknown, chainId?: number): string | undefined {
  const raw = stringValue(value);
  if (!raw && chainId === BASE_SEPOLIA_CHAIN_ID) return BASE_SEPOLIA_NETWORK;
  if (!raw) return undefined;
  const normalized = raw.replace(/_/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  if (normalized === 'base-sepolia' || normalized === 'basesepolia') return BASE_SEPOLIA_NETWORK;
  return normalized;
}

function normalizeRail(job: JobSettlementShape, receipt: unknown, options: BaseMcpSettlementOptions, kind: BaseMcpReceiptKind): string {
  const rawRail = options.rail
    || stringValue(firstValue(receipt, [['rail'], ['settlementRail'], ['payment', 'rail'], ['paymentRequirements', 'rail']]))
    || job.settlementRail
    || 'standard';
  const normalized = rawRail.trim().toLowerCase();
  const rail = kind === 'x402_payment' && ['x402', 'px402', 'base-mcp', 'base-mcp-style'].includes(normalized)
    ? 'px402-dry-run'
    : normalized;

  if (!SUPPORTED_LEDGER_RAILS.has(rail)) {
    throw new SettlementError(`Base MCP receipt rail ${rail} is not supported for ledger settlement`);
  }
  return rail;
}

function inferKind(receipt: unknown, options: BaseMcpSettlementOptions): BaseMcpReceiptKind {
  if (options.kind) return options.kind;
  const method = stringValue(firstValue(receipt, [['method'], ['request', 'method'], ['jsonrpcMethod']]))?.toLowerCase();
  if (method === 'send_calls' || method === 'wallet_sendcalls') return 'send_calls';
  if (asArray(firstValue(receipt, [['calls'], ['request', 'calls']])).length > 0) return 'send_calls';
  if (asRecord(firstValue(receipt, [['paymentRequirements'], ['x402'], ['payment']]))) return 'x402_payment';
  return 'send';
}

function assertConfirmed(kind: BaseMcpReceiptKind, statusValue: unknown): void {
  if (statusValue === true) return;
  const status = stringValue(statusValue)?.toLowerCase();
  const allowed = kind === 'x402_payment' ? APPROVED_X402_STATUSES : CONFIRMED_SEND_STATUSES;
  if (!status || !allowed.has(status)) {
    throw new SettlementError(`Base MCP ${kind} receipt is not confirmed or approved`, 409);
  }
}

function normalizeTokenSymbol(value: unknown, fallback: string): string {
  const raw = stringValue(value);
  if (!raw || /^0x[a-fA-F0-9]{40}$/.test(raw)) return fallback;
  return raw.toUpperCase();
}

function decimalsForToken(tokenSymbol: string, explicitDecimals?: number): number {
  if (explicitDecimals !== undefined) return explicitDecimals;
  if (tokenSymbol === 'ETH' || tokenSymbol === 'MON') return 18;
  return 6;
}

function formatAtomicUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) throw new SettlementError('Base MCP receipt atomic amount is invalid');
  if (decimals === 0) return raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '') || '0';
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function normalizeAmount(receipt: unknown, tokenSymbol: string): string {
  const displayAmount = stringValue(firstValue(receipt, [
    ['amount'],
    ['valueDisplay'],
    ['payment', 'amount'],
    ['paymentRequirements', 'amount'],
    ['paymentRequirements', 'price'],
  ]));
  if (displayAmount) return displayAmount;

  const atomicAmount = stringValue(firstValue(receipt, [
    ['amountAtomic'],
    ['valueAtomic'],
    ['payment', 'amountAtomic'],
    ['paymentRequirements', 'amountAtomic'],
    ['paymentRequirements', 'maxAmountRequired'],
    ['calls', 0, 'value'],
    ['transaction', 'value'],
    ['value'],
  ]));
  if (!atomicAmount) throw new SettlementError('Base MCP receipt amount is required');

  const decimals = numberValue(firstValue(receipt, [
    ['tokenDecimals'],
    ['decimals'],
    ['payment', 'tokenDecimals'],
    ['paymentRequirements', 'tokenDecimals'],
  ]));
  return formatAtomicUnits(atomicAmount, decimalsForToken(tokenSymbol, decimals));
}

function redactedReferencePayload(input: {
  kind: BaseMcpReceiptKind;
  jobId: string;
  rail: string;
  network: string;
  chainId: number;
  amount: string;
  tokenSymbol: string;
  tokenAddress?: string;
  recipientAddress: string;
  txHash: string;
  sourceReceiptHash?: string;
  endpoint?: string;
}): UnknownRecord {
  return {
    source: 'base-mcp',
    kind: input.kind,
    jobId: input.jobId,
    rail: input.rail,
    network: input.network,
    chainId: input.chainId,
    amount: input.amount,
    tokenSymbol: input.tokenSymbol,
    tokenAddress: input.tokenAddress,
    recipientAddress: input.recipientAddress,
    txHash: input.txHash,
    receiptHash: input.sourceReceiptHash,
    endpoint: input.endpoint,
    rawReceiptStored: false,
  };
}

export function normalizeBaseMcpSettlementReceipt(
  job: JobSettlementShape,
  receipt: unknown,
  options: BaseMcpSettlementOptions = {},
): NormalizedBaseMcpSettlementReceipt {
  const record = asRecord(receipt);
  if (!record) throw new SettlementError('Base MCP receipt must be an object');

  const kind = inferKind(record, options);
  assertConfirmed(kind, firstValue(record, [
    ['status'],
    ['state'],
    ['result', 'status'],
    ['receipt', 'status'],
    ['transaction', 'status'],
    ['receipts', 0, 'status'],
    ['payment', 'status'],
    ['success'],
    ['confirmed'],
    ['approved'],
  ]));

  const receiptJobId = stringValue(firstValue(record, [['jobId'], ['metadata', 'jobId'], ['payment', 'jobId']]));
  if (receiptJobId && receiptJobId !== job.id) {
    throw new SettlementError('Base MCP receipt jobId does not match requested job');
  }

  const rail = normalizeRail(job, record, options, kind);
  const chainId = numberValue(firstValue(record, [
    ['chainId'],
    ['network', 'chainId'],
    ['transaction', 'chainId'],
    ['payment', 'chainId'],
    ['paymentRequirements', 'chainId'],
  ]));
  const network = normalizeNetwork(firstValue(record, [
    ['network'],
    ['chain'],
    ['transaction', 'network'],
    ['payment', 'network'],
    ['paymentRequirements', 'network'],
  ]), chainId);
  if (chainId !== BASE_SEPOLIA_CHAIN_ID || network !== BASE_SEPOLIA_NETWORK) {
    throw new SettlementError('Base MCP receipt must be for Base Sepolia');
  }

  const tokenSymbol = normalizeTokenSymbol(firstValue(record, [
    ['tokenSymbol'],
    ['token'],
    ['currency'],
    ['assetSymbol'],
    ['payment', 'tokenSymbol'],
    ['paymentRequirements', 'currency'],
    ['paymentRequirements', 'asset'],
  ]), job.budgetToken);
  const amount = normalizeAmount(record, tokenSymbol);
  const tokenAddress = normalizeAddress(stringValue(firstValue(record, [
    ['tokenAddress'],
    ['assetAddress'],
    ['payment', 'tokenAddress'],
    ['paymentRequirements', 'assetAddress'],
  ])));
  const txHash = normalizeTxHash(stringValue(firstValue(record, [
    ['txHash'],
    ['transactionHash'],
    ['transaction', 'hash'],
    ['receipt', 'transactionHash'],
    ['receipts', 0, 'transactionHash'],
    ['payment', 'txHash'],
  ])));
  const recipientAddress = normalizeAddress(stringValue(firstValue(record, [
    ['escrowAddress'],
    ['escrow'],
    ['recipientAddress'],
    ['recipient'],
    ['to'],
    ['payTo'],
    ['calls', 0, 'to'],
    ['transaction', 'to'],
    ['payment', 'recipient'],
    ['payment', 'payTo'],
    ['paymentRequirements', 'payTo'],
  ])));
  if (!recipientAddress) {
    throw new SettlementError('Base MCP receipt recipient is required');
  }

  const expectedRecipient = normalizeAddress(job.escrowAddress || options.expectedRecipientAddress || job.recipientAddress || undefined);
  if (!expectedRecipient) {
    throw new SettlementError('Expected escrow or recipient address is required to match Base MCP receipt', 409);
  }
  if (recipientAddress !== expectedRecipient) {
    throw new SettlementError('Base MCP receipt recipient does not match job settlement address');
  }

  const sourceReceiptHash = normalizeReceiptHash(stringValue(firstValue(record, [
    ['receiptHash'],
    ['paymentReceiptHash'],
    ['receipt', 'hash'],
    ['payment', 'receiptHash'],
    ['x402ReceiptHash'],
  ])));
  const endpoint = options.endpoint || stringValue(firstValue(record, [['endpoint'], ['payment', 'endpoint'], ['paymentRequirements', 'resource']]));
  const referencePayload = redactedReferencePayload({
    kind,
    jobId: job.id,
    rail,
    network,
    chainId,
    amount,
    tokenSymbol,
    tokenAddress,
    recipientAddress,
    txHash,
    sourceReceiptHash,
    endpoint,
  });
  const redactedReference = JSON.stringify(referencePayload);
  const receiptHash = sourceReceiptHash || canonicalReceiptHash(referencePayload);
  const walletAddress = normalizeAddress(options.walletAddress || stringValue(firstValue(record, [
    ['walletAddress'],
    ['payerWallet'],
    ['from'],
    ['transaction', 'from'],
    ['payment', 'payer'],
  ])));
  const verificationProof = firstValue(record, [
    ['verificationProof'],
    ['onchainReceipt'],
    ['proof'],
    ['payment', 'verificationProof'],
  ]);

  return {
    kind,
    receipt: `redacted-base-mcp-${kind}-receipt`,
    receiptHash,
    rail,
    amount,
    tokenSymbol,
    tokenAddress,
    walletAddress,
    endpoint,
    escrowAddress: job.escrowAddress ? recipientAddress : undefined,
    recipientAddress,
    txHash,
    chainId,
    network,
    status: 'SETTLED',
    redactedReference,
    redactedReferenceHash: receiptHash,
    redactedReferenceType: `base-mcp:${kind}`,
    escrowContractVersion: options.escrowContractVersion || job.escrowContractVersion || undefined,
    verificationProof,
    condition: stringValue(firstValue(record, [
      ['condition'],
      ['proofCondition'],
      ['verificationProof', 'condition'],
      ['onchainReceipt', 'condition'],
      ['proof', 'condition'],
      ['payment', 'condition'],
      ['payment', 'verificationProof', 'condition'],
    ])) || 'funding',
  };
}

function assertLedgerReferenceMatches(input: NormalizedBaseMcpSettlementReceipt, ledger: {
  txHash?: string | null;
  receiptHash: string;
}): void {
  if (ledger.txHash?.toLowerCase() !== input.txHash.toLowerCase()) {
    throw new SettlementError('PaymentLedger txHash does not match Base MCP receipt');
  }
  if (normalizeReceiptHash(ledger.receiptHash) !== normalizeReceiptHash(input.receiptHash)) {
    throw new SettlementError('PaymentLedger receiptHash does not match Base MCP receipt');
  }
}

export async function recordConfirmedBaseMcpSettlementReceipt(
  jobId: string,
  receipt: unknown,
  options: BaseMcpSettlementOptions = {},
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new SettlementError('Job not found', 404);

  const normalized = normalizeBaseMcpSettlementReceipt(job, receipt, options);
  const jobForMatch = {
    ...job,
    recipientAddress: options.expectedRecipientAddress || normalized.recipientAddress,
  };
  assertSettlementInputMatchesJob(jobForMatch, normalized);

  const ledger = await verifyAndRecordSettlementReceipt(job.id, normalized);
  assertReceiptMatchesJob(jobForMatch, ledger);
  assertLedgerReferenceMatches(normalized, ledger);
  return ledger;
}

export function recordBaseMcpSendReceipt(jobId: string, receipt: unknown, options: Omit<BaseMcpSettlementOptions, 'kind'> = {}) {
  return recordConfirmedBaseMcpSettlementReceipt(jobId, receipt, { ...options, kind: 'send' });
}

export function recordBaseMcpSendCallsReceipt(jobId: string, receipt: unknown, options: Omit<BaseMcpSettlementOptions, 'kind'> = {}) {
  return recordConfirmedBaseMcpSettlementReceipt(jobId, receipt, { ...options, kind: 'send_calls' });
}

export function recordApprovedX402PaymentReceipt(jobId: string, receipt: unknown, options: Omit<BaseMcpSettlementOptions, 'kind'> = {}) {
  return recordConfirmedBaseMcpSettlementReceipt(jobId, receipt, { ...options, kind: 'x402_payment' });
}
