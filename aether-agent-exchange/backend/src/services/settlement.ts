import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import { CHAINS, getChainById } from '../config/chains';

export const PAID_CHAIN_RAILS = new Set(['standard', 'erc8183', 'x402', 'px402']);
const ESCROW_PAID_CHAIN_RAILS = new Set(['standard', 'erc8183']);

export interface SettlementReceiptInput {
  receipt: string;
  rail: string;
  amount: number | string;
  receiptHash?: string;
  tokenSymbol?: string;
  tokenAddress?: string;
  onchainJobId?: string;
  walletAddress?: string;
  endpoint?: string;
  escrowAddress?: string;
  recipientAddress?: string;
  txHash: string;
  chainId?: number;
  network?: string;
  status?: string;
  redactedReference?: string;
  redactedReferenceHash?: string;
  redactedReferenceType?: string;
  escrowContractVersion?: string;
  verificationProof?: unknown;
  condition?: string;
}

export interface SettlementRefs {
  txHash?: string;
  receiptHash?: string;
  ledgerId?: string;
}

export type JobSettlementShape = {
  id: string;
  budgetAmount: number | string;
  budgetToken: string;
  settlementRail?: string | null;
  chainId?: number | null;
  network?: string | null;
  tokenAddress?: string | null;
  onchainJobId?: string | null;
  escrowAddress?: string | null;
  recipientAddress?: string | null;
  escrowContractVersion?: string | null;
};

export class SettlementError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}

export function canonicalReceiptHash(input: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`;
}

export function normalizeAddress(value?: string | null): string | null {
  return value ? value.toLowerCase() : null;
}

export function normalizeHash(value?: string | null): string | null {
  return value ? value.toLowerCase() : null;
}

export function normalizeReceiptHash(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (/^0x[a-f0-9]{64}$/.test(normalized)) return normalized;
  return /^[a-f0-9]{64}$/.test(normalized) ? `0x${normalized}` : null;
}

export function settlementDecimalsForToken(tokenSymbol?: string | null): number {
  const token = tokenSymbol?.toUpperCase();
  if (token === 'ETH' || token === 'MON') return 18;
  if (token === 'USDC') return 6;
  return parseInt(process.env.SETTLEMENT_TOKEN_DECIMALS || '6', 10);
}

export function amountToUnits(value: number | string, tokenSymbol?: string | null): bigint {
  const decimals = settlementDecimalsForToken(tokenSymbol);
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  const match = raw.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new SettlementError('Payment amount must be a positive decimal');

  const [, whole, fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new SettlementError(`Payment amount exceeds ${decimals} token decimals`);
  }

  return BigInt(whole) * (BigInt(10) ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function isPaidChainRail(job: { budgetAmount: number | string; settlementRail?: string | null }): boolean {
  return Number(job.budgetAmount) > 0 && PAID_CHAIN_RAILS.has(job.settlementRail || 'standard');
}

export function isEscrowPaidChainRail(job: { budgetAmount: number | string; settlementRail?: string | null }): boolean {
  return Number(job.budgetAmount) > 0 && ESCROW_PAID_CHAIN_RAILS.has(job.settlementRail || 'standard');
}

function nativeSymbolForJob(job: JobSettlementShape): string | null {
  const chain = job.network ? CHAINS[job.network as keyof typeof CHAINS] : undefined;
  return (chain || (job.chainId ? getChainById(job.chainId) : undefined))?.nativeCurrency.symbol || null;
}

function assertNativePaidChainIsSupported(job: JobSettlementShape, receipt: any): void {
  const nativeSymbol = nativeSymbolForJob(job);
  if (!isEscrowPaidChainRail(job) || !nativeSymbol || job.budgetToken !== nativeSymbol) return;

  if (job.tokenAddress || receipt.tokenAddress) {
    throw new SettlementError(`Native ${nativeSymbol} settlement must not include tokenAddress; wrapped/ERC20 ${nativeSymbol}-like tokens require an explicit ERC20 path, not budgetToken ${nativeSymbol}`, 409);
  }

  const jobVersion = job.escrowContractVersion || 'legacy';
  const receiptVersion = receipt.escrowContractVersion || jobVersion;
  if (jobVersion !== 'native-eth' || receiptVersion !== 'native-eth') {
    throw new SettlementError(`Native ${nativeSymbol} paid-chain settlement requires escrowContractVersion native-eth; legacy/ERC8183 paths remain ERC20-only`, 409);
  }
}

export function assertReceiptMatchesJob(job: JobSettlementShape, receipt: any): void {
  if (receipt.jobId !== job.id) throw new SettlementError('PaymentLedger job does not match requested job');
  if (receipt.status !== 'SETTLED') throw new SettlementError('PaymentLedger is not settled', 409);
  if (receipt.rail !== (job.settlementRail || 'standard')) throw new SettlementError('PaymentLedger rail does not match job');
  if (job.chainId && receipt.chainId !== job.chainId) throw new SettlementError('PaymentLedger chainId does not match job');
  if (job.network && receipt.network !== job.network) throw new SettlementError('PaymentLedger network does not match job');
  if (amountToUnits(receipt.amount || '0', receipt.tokenSymbol || job.budgetToken) !== amountToUnits(job.budgetAmount, job.budgetToken)) throw new SettlementError('PaymentLedger amount does not match job budget');
  if (receipt.tokenSymbol && receipt.tokenSymbol !== job.budgetToken) throw new SettlementError('PaymentLedger token does not match job budget token');
  assertNativePaidChainIsSupported(job, receipt);
  if (job.tokenAddress && normalizeAddress(receipt.tokenAddress) !== normalizeAddress(job.tokenAddress)) throw new SettlementError('PaymentLedger tokenAddress does not match job');
  const receiptRecipient = normalizeAddress(receipt.escrowAddress || receipt.escrow || receipt.recipientAddress || receipt.recipient);
  if (isEscrowPaidChainRail(job) || job.escrowAddress) {
    if (!job.escrowAddress) throw new SettlementError('Job escrowAddress is required before settlement can be approved', 409);
    if (receiptRecipient !== normalizeAddress(job.escrowAddress)) throw new SettlementError('PaymentLedger escrow does not match job');
  } else if (job.recipientAddress && receiptRecipient !== normalizeAddress(job.recipientAddress)) {
    throw new SettlementError('PaymentLedger recipient does not match job');
  }
  if (job.escrowContractVersion && receipt.escrowContractVersion && receipt.escrowContractVersion !== job.escrowContractVersion) {
    throw new SettlementError('PaymentLedger escrow contract version does not match job');
  }
}

export function assertSettlementInputMatchesJob(job: JobSettlementShape, input: SettlementReceiptInput): void {
  assertReceiptMatchesJob(job, {
    jobId: job.id,
    status: input.status || 'SETTLED',
    rail: input.rail,
    amount: String(input.amount),
    tokenSymbol: input.tokenSymbol,
    tokenAddress: input.tokenAddress,
    escrowAddress: input.escrowAddress,
    recipientAddress: input.recipientAddress,
    chainId: input.chainId,
    network: input.network,
    escrowContractVersion: input.escrowContractVersion,
  });
}

function assertExistingLedgerMatchesInput(jobId: string, receiptHash: string, input: SettlementReceiptInput, existing: any): void {
  if (existing.jobId !== jobId) {
    throw new SettlementError('PaymentLedger receipt reference is already linked to another job', 409);
  }
  if (normalizeReceiptHash(existing.receiptHash) !== receiptHash) {
    throw new SettlementError('PaymentLedger receiptHash does not match settlement input', 409);
  }
  const inputTxHash = normalizeHash(input.txHash);
  if (inputTxHash && normalizeHash(existing.txHash) !== inputTxHash) {
    throw new SettlementError('PaymentLedger txHash does not match settlement input', 409);
  }
  if (existing.rail !== input.rail) {
    throw new SettlementError('PaymentLedger rail does not match settlement input', 409);
  }
  if (existing.chainId !== input.chainId) {
    throw new SettlementError('PaymentLedger chainId does not match settlement input', 409);
  }
  if (existing.network !== input.network) {
    throw new SettlementError('PaymentLedger network does not match settlement input', 409);
  }
  if (existing.tokenSymbol && input.tokenSymbol && existing.tokenSymbol !== input.tokenSymbol) {
    throw new SettlementError('PaymentLedger token does not match settlement input', 409);
  }
  if (normalizeAddress(existing.tokenAddress) !== normalizeAddress(input.tokenAddress)) {
    throw new SettlementError('PaymentLedger tokenAddress does not match settlement input', 409);
  }
  const settlementAddress = input.escrowAddress || input.recipientAddress;
  if (normalizeAddress(existing.escrowAddress || existing.escrow) !== normalizeAddress(settlementAddress)) {
    throw new SettlementError('PaymentLedger escrow does not match settlement input', 409);
  }
  if (existing.escrowContractVersion && input.escrowContractVersion && existing.escrowContractVersion !== input.escrowContractVersion) {
    throw new SettlementError('PaymentLedger escrow contract version does not match settlement input', 409);
  }
  if (existing.amount && amountToUnits(existing.amount, existing.tokenSymbol || input.tokenSymbol) !== amountToUnits(input.amount, input.tokenSymbol || existing.tokenSymbol)) {
    throw new SettlementError('PaymentLedger amount does not match settlement input', 409);
  }
}

export async function recordSettlementReceipt(jobId: string, input: SettlementReceiptInput) {
  const settlementAddress = input.escrowAddress || input.recipientAddress;
  const receiptHash = normalizeReceiptHash(input.receiptHash) || canonicalReceiptHash({
    jobId,
    receipt: input.receipt,
    rail: input.rail,
    amount: String(input.amount),
    tokenSymbol: input.tokenSymbol,
    tokenAddress: normalizeAddress(input.tokenAddress),
    walletAddress: normalizeAddress(input.walletAddress),
    escrowAddress: normalizeAddress(settlementAddress),
    txHash: normalizeHash(input.txHash),
    chainId: input.chainId,
    network: input.network,
    status: input.status || 'SETTLED',
  });
  const txHash = normalizeHash(input.txHash);

  const [existingByReceipt, existingByTx] = await Promise.all([
    prisma.paymentLedger.findUnique({ where: { receiptHash } }),
    txHash ? prisma.paymentLedger.findUnique({ where: { txHash } }) : Promise.resolve(null),
  ]);

  if (existingByReceipt && existingByTx && existingByReceipt.id !== existingByTx.id) {
    throw new SettlementError('PaymentLedger txHash and receiptHash refer to different ledger records', 409);
  }

  const existing = existingByReceipt || existingByTx;
  if (existing) {
    assertExistingLedgerMatchesInput(jobId, receiptHash, input, existing);
    return prisma.paymentLedger.update({
      where: { id: existing.id },
      data: {
        status: input.status || existing.status,
        settledAt: (input.status || existing.status) === 'SETTLED' ? (existing.settledAt || new Date()) : existing.settledAt,
      },
    });
  }

  return prisma.paymentLedger.create({
    data: {
      jobId,
      receipt: input.receipt,
      rail: input.rail,
      mode: 'settlement',
      amount: String(input.amount),
      token: input.tokenSymbol,
      tokenSymbol: input.tokenSymbol,
      tokenAddress: normalizeAddress(input.tokenAddress),
      wallet: normalizeAddress(input.walletAddress),
      walletAddress: normalizeAddress(input.walletAddress),
      endpoint: input.endpoint,
      escrow: normalizeAddress(settlementAddress),
      escrowAddress: normalizeAddress(settlementAddress),
      txHash,
      receiptHash,
      chainId: input.chainId,
      network: input.network,
      status: input.status || 'SETTLED',
      redactedReference: input.redactedReference,
      redactedReferenceHash: normalizeReceiptHash(input.redactedReferenceHash),
      redactedReferenceType: input.redactedReferenceType,
      escrowContractVersion: input.escrowContractVersion,
      settledAt: (input.status || 'SETTLED') === 'SETTLED' ? new Date() : null,
    },
  });
}

export async function findSettledReceiptForJob(job: JobSettlementShape, refs: SettlementRefs = {}) {
  const receiptHash = normalizeReceiptHash(refs.receiptHash);
  const txHash = normalizeHash(refs.txHash);

  const referenced = refs.ledgerId
    ? await prisma.paymentLedger.findUnique({ where: { id: refs.ledgerId } })
    : txHash
      ? await prisma.paymentLedger.findUnique({ where: { txHash } })
      : receiptHash
        ? await prisma.paymentLedger.findUnique({ where: { receiptHash } })
        : null;

  if (referenced) {
    assertReceiptMatchesJob(job, referenced);
    return referenced;
  }

  if (refs.ledgerId || txHash || receiptHash) {
    throw new SettlementError('No PaymentLedger found for supplied settlement reference', 404);
  }

  const receipts = await prisma.paymentLedger.findMany({
    where: {
      jobId: job.id,
      rail: job.settlementRail || 'standard',
      status: 'SETTLED',
      chainId: job.chainId || undefined,
      network: job.network || undefined,
    },
    orderBy: [{ settledAt: 'desc' }, { createdAt: 'desc' }],
  });

  for (const receipt of receipts) {
    try {
      assertReceiptMatchesJob(job, receipt);
      return receipt;
    } catch {
      // Keep looking in case there are older mismatched receipts for this job.
    }
  }

  return null;
}

export async function assertJobCanComplete(job: JobSettlementShape, refs: SettlementRefs = {}) {
  if (!isPaidChainRail(job)) {
    return null;
  }

  const receipt = await findSettledReceiptForJob(job, refs);
  if (!receipt) {
    const rail = job.settlementRail || 'standard';
    throw new SettlementError(`Missing settled PaymentLedger receipt for paid ${rail} rail`, 409);
  }
  if (isEscrowPaidChainRail(job)) {
    const releaseVerification = await (prisma as any).settlementReceiptVerification.findFirst({
      where: {
        paymentLedgerId: receipt.id,
        status: 'PASSED',
        condition: { in: ['release', 'payment'] },
      },
      select: { id: true },
    });
    if (!releaseVerification) {
      throw new SettlementError('Paid escrow completion requires release or dispute-resolution PaymentLedger evidence; funding-only evidence is not final settlement', 409);
    }
  }
  return receipt;
}
