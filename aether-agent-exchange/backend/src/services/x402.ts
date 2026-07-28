import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import {
  amountToUnits,
  assertReceiptMatchesJob,
  canonicalReceiptHash,
  isPaidChainRail,
  normalizeAddress,
  normalizeHash,
  normalizeReceiptHash,
  recordSettlementReceipt,
  SettlementError,
} from './settlement';
import {
  discoverX402Requirements,
  enforceEndpointAllowlist,
  X402RequirementSummary,
} from './px402DryRun';

export type X402Rail = 'x402' | 'px402';

export interface X402Policy {
  provider: string;
  facilitatorUrl: string;
  allowedNetworks: string[];
  maxPaymentUsd: string;
  maxRetryCount: number;
  sellerEnabled: boolean;
  buyerEnabled: boolean;
  mainnetEnabled: boolean;
  monadMainnetPaidRailsEnabled: boolean;
  endpointAllowlist: string[];
  sellerPayTo?: string;
  sellerPriceUsd?: string;
  sellerNetwork: 'eip155:8453' | 'eip155:84532' | 'eip155:143';
  sellerResourceIds: string[];
}

export interface X402ReceiptInput {
  rail: X402Rail;
  network: string;
  chainId: number;
  caip2Network?: string;
  amount: number | string;
  tokenSymbol: string;
  payerWallet?: string;
  payeeWallet?: string;
  endpoint?: string;
  txHash?: string;
  receiptHash?: string;
  facilitatorReference?: string;
  facilitatorReferenceHash?: string;
  receipt: string;
  status?: 'SETTLED';
  providerPayload?: unknown;
}

export interface X402FacilitatorAdapter {
  verify(input: X402ReceiptInput, policy: X402Policy): Promise<X402FacilitatorResult>;
  settle(input: X402ReceiptInput, policy: X402Policy): Promise<X402FacilitatorResult>;
}

export interface X402FacilitatorResult {
  ok: boolean;
  status: string;
  network?: string;
  txHash?: string;
  receiptHash?: string;
  reference?: string;
  payer?: string;
  payee?: string;
  amount?: string;
  tokenSymbol?: string;
  raw?: unknown;
}

export interface X402SellerRequirement {
  resourceId: string;
  scheme: 'exact';
  network: 'eip155:8453' | 'eip155:84532' | 'eip155:143';
  chainId: 8453 | 84532 | 143;
  amount: string;
  maxAmountRequired: string;
  currency: 'USDC';
  asset: 'USDC';
  payTo: string;
  facilitator: string;
  status: 'PAYMENT_REQUIRED';
  rawPaymentHeaderStored: false;
}

export interface X402SellerAccess {
  resourceId: string;
  ledgerId: string;
  rail: X402Rail;
  status: 'AUTHORIZED';
  network: string;
  chainId: number;
  amount: string | null;
  tokenSymbol: string | null;
  redactedReference?: string | null;
}

export interface X402BuyerIntentInput {
  endpoint: string;
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: unknown;
  approved: boolean;
  walletAddress?: string;
  jobId?: string;
}

export interface X402BuyerIntent {
  ledgerId: string;
  jobId?: string;
  state: 'QUOTE' | 'APPROVAL_REQUIRED' | 'APPROVED_EXECUTION_DISABLED' | 'BLOCKED';
  executeDisabled: true;
  retryLimit: number;
  requirements: X402RequirementSummary;
  redactedReference: string;
  redactedReferenceHash: string;
  policyReasons: string[];
}

const BASE_CAIP2: Record<string, { network: string; chainId: number }> = {
  'eip155:8453': { network: 'base', chainId: 8453 },
  'eip155:84532': { network: 'base-sepolia', chainId: 84532 },
  'eip155:143': { network: 'monad', chainId: 143 },
};

const NETWORK_TO_CAIP2: Record<string, string> = {
  base: 'eip155:8453',
  'base-mainnet': 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  basesepolia: 'eip155:84532',
  monad: 'eip155:143',
  'monad-mainnet': 'eip155:143',
};

const SENSITIVE_FIELD_PATTERN = /(^authorization$|^cookie$|payment[-_]?signature|^x[-_]?payment$|x402[-_]?payment|private[-_]?key|seed[-_]?phrase|mnemonic|signed[-_]?payload|signed[-_]?message|prxvt[-_]?note|ucan[-_]?secret)/i;

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashWith0x(value: unknown): string {
  return `0x${sha256Hex(value)}`;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function findSensitiveMaterial(value: unknown, path: string[] = []): string[] | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveMaterial(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = [...path, key];
      if (SENSITIVE_FIELD_PATTERN.test(key)) return keyPath;
      const found = findSensitiveMaterial(nested, keyPath);
      if (found) return found;
    }
  }

  return null;
}

function assertNoRawPaymentMaterial(value: unknown): void {
  const path = findSensitiveMaterial(value);
  if (path) {
    throw new SettlementError(`Raw x402 payment material is not accepted at ${path.join('.')}`, 400);
  }
}

function normalizeNetwork(input: { network?: string; chainId?: number; caip2Network?: string }): { network: string; chainId: number; caip2Network: string } {
  const caip2 = input.caip2Network || (input.network ? NETWORK_TO_CAIP2[input.network.replace(/_/g, '-').toLowerCase()] : undefined);
  const byCaip2 = caip2 ? BASE_CAIP2[caip2] : undefined;
  const network = byCaip2?.network || input.network?.replace(/_/g, '-').toLowerCase();
  const chainId = byCaip2?.chainId || input.chainId;

  if (!network || !chainId) {
    throw new SettlementError('x402 receipt requires a supported EVM network and chainId');
  }
  const expectedCaip2 = NETWORK_TO_CAIP2[network];
  if (!expectedCaip2) {
    throw new SettlementError('x402 receipt supports configured Base and Monad networks only', 409);
  }
  const expected = BASE_CAIP2[expectedCaip2];
  if (expected.chainId !== chainId) {
    throw new SettlementError(`x402 chainId ${chainId} does not match ${network}`, 409);
  }

  return { network: expected.network, chainId: expected.chainId, caip2Network: expectedCaip2 };
}

function amountUsd(value: number | string, tokenSymbol: string): number | undefined {
  if (!['USD', 'USDC'].includes(tokenSymbol.toUpperCase())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function amountUsdFromRequirement(requirement: X402RequirementSummary): number | undefined {
  const currency = requirement.currency?.toUpperCase();
  if (currency && !['USD', 'USDC'].includes(currency)) return undefined;
  if (requirement.amount && Number.isFinite(Number(requirement.amount))) return Number(requirement.amount);
  if (requirement.amountAtomic && /^\d+$/.test(requirement.amountAtomic)) return Number(requirement.amountAtomic) / 1_000_000;
  return undefined;
}

function parseAllowedNetworks(value: string | undefined): string[] {
  return (value || 'eip155:84532')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function getX402PolicyFromEnv(): X402Policy {
  return {
    provider: process.env.X402_PROVIDER || 'coinbase-cdp',
    facilitatorUrl: (process.env.X402_FACILITATOR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402').replace(/\/+$/, ''),
    allowedNetworks: parseAllowedNetworks(process.env.X402_ALLOWED_NETWORKS || process.env.STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS),
    maxPaymentUsd: process.env.X402_MAX_PAYMENT_USD || process.env.STABLECOIN_ACCEPTANCE_MAX_USD || '0',
    maxRetryCount: Number.parseInt(process.env.X402_MAX_RETRY_COUNT || '1', 10),
    sellerEnabled: process.env.AAE_ENABLE_X402_SELLER === 'true',
    buyerEnabled: process.env.AAE_ENABLE_X402_BUYER === 'true',
    mainnetEnabled: process.env.AAE_ENABLE_X402_MAINNET === 'true' && process.env.AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE === 'true',
    monadMainnetPaidRailsEnabled: process.env.AAE_ENABLE_MONAD_MAINNET_PAID_RAILS === 'true',
    endpointAllowlist: (process.env.X402_ENDPOINT_ALLOWLIST || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost,http://127.0.0.1'))
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    sellerPayTo: process.env.X402_SELLER_PAY_TO,
    sellerPriceUsd: process.env.X402_SELLER_PRICE_USD || '0.01',
    sellerNetwork: (process.env.X402_SELLER_NETWORK || 'eip155:84532') as 'eip155:8453' | 'eip155:84532' | 'eip155:143',
    sellerResourceIds: (process.env.X402_SELLER_RESOURCE_IDS || 'agent-resource')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  };
}

function assertPolicyAllows(input: X402ReceiptInput, policy: X402Policy, normalized: { network: string; chainId: number; caip2Network: string }): void {
  if (!policy.allowedNetworks.includes(normalized.caip2Network)) {
    throw new SettlementError(`x402 network ${normalized.caip2Network} is not allowlisted`, 403);
  }
  if (normalized.network === 'base' && !policy.mainnetEnabled) {
    throw new SettlementError('Base mainnet x402 settlement requires AAE_ENABLE_X402_MAINNET=true', 503);
  }
  if (normalized.network === 'monad' && !policy.monadMainnetPaidRailsEnabled) {
    throw new SettlementError('Monad mainnet x402 settlement requires AAE_ENABLE_MONAD_MAINNET_PAID_RAILS=true', 503);
  }

  const cap = Number(policy.maxPaymentUsd);
  const usd = amountUsd(input.amount, input.tokenSymbol);
  if (usd === undefined) {
    throw new SettlementError(`x402 cap cannot be evaluated for token ${input.tokenSymbol}`, 409);
  }
  if (!Number.isFinite(cap) || cap <= 0 || usd > cap) {
    throw new SettlementError(`x402 amount ${usd} exceeds configured cap ${policy.maxPaymentUsd || 'unset'}`, 403);
  }
}

function facilitatorAuthHeaders(): Record<string, string> {
  const apiKey = process.env.X402_CDP_API_KEY || process.env.CDP_API_KEY || process.env.COINBASE_CDP_API_KEY;
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function assertCaip2Allowed(caip2Network: string, policy: X402Policy): void {
  if (!policy.allowedNetworks.includes(caip2Network)) {
    throw new SettlementError(`x402 network ${caip2Network} is not allowlisted`, 403);
  }
  if (caip2Network === 'eip155:8453' && !policy.mainnetEnabled) {
    throw new SettlementError('Base mainnet x402 settlement requires AAE_ENABLE_X402_MAINNET=true', 503);
  }
  if (caip2Network === 'eip155:143' && !policy.monadMainnetPaidRailsEnabled) {
    throw new SettlementError('Monad mainnet x402 settlement requires AAE_ENABLE_MONAD_MAINNET_PAID_RAILS=true', 503);
  }
}

function usdcAtomicFromUsd(value: string): string {
  const match = value.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) throw new SettlementError('x402 seller price must be a USDC decimal string');
  const [, whole, fraction = ''] = match;
  return `${whole}${fraction.padEnd(6, '0')}`.replace(/^0+(?=\d)/, '') || '0';
}

export function buildX402SellerRequirement(resourceId: string, policy: X402Policy = getX402PolicyFromEnv()): X402SellerRequirement {
  if (!policy.sellerEnabled) {
    throw new SettlementError('x402 seller flow is disabled by AAE_ENABLE_X402_SELLER', 503);
  }
  if (!policy.sellerResourceIds.includes(resourceId)) {
    throw new SettlementError('x402 seller resource is not allowlisted', 404);
  }
  if (!policy.sellerPayTo || !/^0x[a-fA-F0-9]{40}$/.test(policy.sellerPayTo)) {
    throw new SettlementError('X402_SELLER_PAY_TO must be configured with a receiving wallet', 503);
  }
  assertCaip2Allowed(policy.sellerNetwork, policy);
  const network = BASE_CAIP2[policy.sellerNetwork];
  const priceUsd = policy.sellerPriceUsd || '0';
  const amountAtomic = usdcAtomicFromUsd(priceUsd);
  const maxUsd = Number(policy.maxPaymentUsd);
  const price = Number(priceUsd);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || price > maxUsd) {
    throw new SettlementError(`x402 seller price ${priceUsd} exceeds configured cap ${policy.maxPaymentUsd || 'unset'}`, 403);
  }

  return {
    resourceId,
    scheme: 'exact',
    network: policy.sellerNetwork,
    chainId: network.chainId as 8453 | 84532 | 143,
    amount: priceUsd,
    maxAmountRequired: amountAtomic,
    currency: 'USDC',
    asset: 'USDC',
    payTo: normalizeAddress(policy.sellerPayTo)!,
    facilitator: policy.facilitatorUrl,
    status: 'PAYMENT_REQUIRED',
    rawPaymentHeaderStored: false,
  };
}

export async function authorizeX402SellerResourceAccess(
  resourceId: string,
  ledgerId: string | undefined,
  policy: X402Policy = getX402PolicyFromEnv(),
): Promise<X402SellerAccess> {
  if (!policy.sellerEnabled) {
    throw new SettlementError('x402 seller flow is disabled by AAE_ENABLE_X402_SELLER', 503);
  }
  if (!policy.sellerResourceIds.includes(resourceId)) {
    throw new SettlementError('x402 seller resource is not allowlisted', 404);
  }
  if (!ledgerId) {
    throw new SettlementError('Settled x402 PaymentLedger reference is required for this resource', 402);
  }

  const ledger = await prisma.paymentLedger.findUnique({ where: { id: ledgerId } });
  if (!ledger) throw new SettlementError('PaymentLedger reference not found', 404);
  if (!['x402', 'px402'].includes(ledger.rail)) {
    throw new SettlementError('PaymentLedger rail is not valid for x402 resource access', 409);
  }
  if (ledger.status !== 'SETTLED') {
    throw new SettlementError('PaymentLedger is not settled for x402 resource access', 402);
  }
  if (!ledger.redactedReferenceType?.includes('x402-facilitator')) {
    throw new SettlementError('PaymentLedger does not contain verified x402 facilitator evidence', 409);
  }

  const normalized = normalizeNetwork({ network: ledger.network || undefined, chainId: ledger.chainId || undefined });
  assertCaip2Allowed(normalized.caip2Network, policy);

  const expectedPrice = policy.sellerPriceUsd || '0.01';
  if (ledger.amount && amountToUnits(ledger.amount, ledger.tokenSymbol || 'USDC') !== amountToUnits(expectedPrice, 'USDC')) {
    throw new SettlementError('PaymentLedger amount does not match x402 seller resource price', 409);
  }
  if ((ledger.tokenSymbol || 'USDC') !== 'USDC') {
    throw new SettlementError('x402 seller resource requires USDC payment evidence', 409);
  }

  return {
    resourceId,
    ledgerId: ledger.id,
    rail: ledger.rail as X402Rail,
    status: 'AUTHORIZED',
    network: ledger.network || normalized.network,
    chainId: ledger.chainId || normalized.chainId,
    amount: ledger.amount,
    tokenSymbol: ledger.tokenSymbol,
    redactedReference: ledger.redactedReference,
  };
}

function buyerPolicyReasons(requirements: X402RequirementSummary, policy: X402Policy): string[] {
  const reasons: string[] = [];
  const normalized = normalizeNetwork({ network: requirements.network, chainId: requirements.chainId });
  if (!policy.allowedNetworks.includes(normalized.caip2Network)) {
    reasons.push(`network ${normalized.caip2Network} is not allowlisted`);
  }
  if (normalized.network === 'base' && !policy.mainnetEnabled) {
    reasons.push('Base mainnet buyer payment requires AAE_ENABLE_X402_MAINNET=true');
  }
  if (normalized.network === 'monad' && !policy.monadMainnetPaidRailsEnabled) {
    reasons.push('Monad mainnet buyer payment requires AAE_ENABLE_MONAD_MAINNET_PAID_RAILS=true');
  }
  const usd = amountUsdFromRequirement(requirements);
  const cap = Number(policy.maxPaymentUsd);
  if (usd === undefined) {
    reasons.push(`amount cap cannot be evaluated for currency ${requirements.currency || 'missing'}`);
  } else if (!Number.isFinite(cap) || cap <= 0 || usd > cap) {
    reasons.push(`amount ${usd} exceeds configured cap ${policy.maxPaymentUsd || 'unset'}`);
  }
  if (!requirements.payTo) {
    reasons.push('payTo recipient missing');
  }
  if (requirements.status !== 402) {
    reasons.push(`expected HTTP 402 challenge, got ${requirements.status}`);
  }
  return reasons;
}

export async function prepareX402BuyerIntent(
  input: X402BuyerIntentInput,
  policy: X402Policy = getX402PolicyFromEnv(),
): Promise<X402BuyerIntent> {
  if (!policy.buyerEnabled) {
    throw new SettlementError('x402 buyer flow is disabled by AAE_ENABLE_X402_BUYER', 503);
  }
  enforceEndpointAllowlist(input.endpoint, policy.endpointAllowlist);
  const requirements = await discoverX402Requirements({
    url: input.endpoint,
    endpointAllowlist: policy.endpointAllowlist,
    method: input.method || 'GET',
    headers: input.headers,
    body: input.body,
  });
  const normalized = normalizeNetwork({ network: requirements.network, chainId: requirements.chainId });
  const reasons = buyerPolicyReasons(requirements, policy);
  const endpointHash = hashWith0x(requirements.endpoint);
  const referenceHash = hashWith0x({
    endpoint: requirements.endpoint,
    network: normalized.caip2Network,
    amount: requirements.amount,
    amountAtomic: requirements.amountAtomic,
    payToPresent: Boolean(requirements.payTo),
    approved: input.approved,
  });
  const blocked = reasons.length > 0;
  const state: X402BuyerIntent['state'] = blocked
    ? 'BLOCKED'
    : input.approved
      ? 'APPROVED_EXECUTION_DISABLED'
      : 'APPROVAL_REQUIRED';

  const ledger = await prisma.paymentLedger.create({
    data: {
      jobId: input.jobId,
      receipt: 'redacted-x402-buyer-intent',
      rail: 'x402',
      mode: 'buyer-intent',
      amount: requirements.amount || (requirements.amountAtomic ? String(Number(requirements.amountAtomic) / 1_000_000) : '0'),
      token: requirements.currency || 'USDC',
      tokenSymbol: requirements.currency || 'USDC',
      wallet: normalizeAddress(input.walletAddress),
      walletAddress: normalizeAddress(input.walletAddress),
      endpoint: endpointHash,
      receiptHash: referenceHash,
      chainId: normalized.chainId,
      network: normalized.network,
      status: blocked ? 'BLOCKED' : input.approved ? 'APPROVED' : 'QUOTED',
      redactedReference: `x402-buyer:${normalized.caip2Network}:${referenceHash.slice(2, 14)}`,
      redactedReferenceHash: referenceHash,
      redactedReferenceType: 'x402-buyer-intent',
      redactedPaymentReference: endpointHash,
    },
  });

  return {
    ledgerId: ledger.id,
    jobId: input.jobId,
    state,
    executeDisabled: true,
    retryLimit: Math.max(0, policy.maxRetryCount),
    requirements,
    redactedReference: ledger.redactedReference || '',
    redactedReferenceHash: referenceHash,
    policyReasons: reasons,
  };
}

export function executeApprovedX402BuyerPayment(): never {
  throw new SettlementError('x402 buyer payment execution requires an operator-approved wallet signer path; no payment headers are generated by default', 503);
}

async function postFacilitator(path: '/verify' | '/settle', input: X402ReceiptInput, policy: X402Policy): Promise<X402FacilitatorResult> {
  if (policy.provider !== 'coinbase-cdp') {
    throw new SettlementError(`Unsupported x402 provider ${policy.provider}`, 503);
  }

  const response = await fetch(`${policy.facilitatorUrl}${path}`, {
    method: 'POST',
    headers: facilitatorAuthHeaders(),
    body: JSON.stringify({
      network: input.caip2Network,
      txHash: input.txHash,
      receiptHash: input.receiptHash,
      facilitatorReferenceHash: input.facilitatorReferenceHash,
    }),
  });
  const body = await response.json().catch(() => ({}));
  return normalizeFacilitatorResult(body, response.ok);
}

export const coinbaseCdpX402Adapter: X402FacilitatorAdapter = {
  verify: (input, policy) => postFacilitator('/verify', input, policy),
  settle: (input, policy) => postFacilitator('/settle', input, policy),
};

export function normalizeFacilitatorResult(payload: unknown, transportOk = true): X402FacilitatorResult {
  assertNoRawPaymentMaterial(payload);
  const body = asRecord(payload) || {};
  const nested = asRecord(body.payment) || asRecord(body.settlement) || asRecord(body.result) || {};
  const status = asString(body.status) || asString(nested.status) || (transportOk ? 'success' : 'failed');
  const ok = transportOk && !['failed', 'failure', 'rejected', 'invalid', 'false'].includes(status.toLowerCase());
  return {
    ok,
    status,
    network: asString(body.network) || asString(nested.network),
    txHash: asString(body.txHash) || asString(nested.txHash),
    receiptHash: asString(body.receiptHash) || asString(nested.receiptHash),
    reference: asString(body.reference) || asString(body.facilitatorReference) || asString(nested.reference),
    payer: asString(body.payer) || asString(nested.payer),
    payee: asString(body.payee) || asString(nested.payee),
    amount: asString(body.amount) || asString(nested.amount),
    tokenSymbol: asString(body.tokenSymbol) || asString(body.currency) || asString(nested.tokenSymbol) || asString(nested.currency),
    raw: payload,
  };
}

function mergeFacilitatorEvidence(verify: X402FacilitatorResult, settle: X402FacilitatorResult): X402FacilitatorResult {
  if (!verify.ok) throw new SettlementError(`x402 facilitator verify failed: ${verify.status}`, 409);
  if (!settle.ok) throw new SettlementError(`x402 facilitator settle failed: ${settle.status}`, 409);
  return {
    ok: true,
    status: settle.status || verify.status,
    network: settle.network || verify.network,
    txHash: settle.txHash || verify.txHash,
    receiptHash: settle.receiptHash || verify.receiptHash,
    reference: settle.reference || verify.reference,
    payer: settle.payer || verify.payer,
    payee: settle.payee || verify.payee,
    amount: settle.amount || verify.amount,
    tokenSymbol: settle.tokenSymbol || verify.tokenSymbol,
    raw: { verify: verify.raw, settle: settle.raw },
  };
}

function redactedReference(input: X402ReceiptInput, evidence: X402FacilitatorResult, normalized: { caip2Network: string }): { reference: string; hash: string } {
  const reference = input.facilitatorReference || evidence.reference || `${input.rail}:${normalized.caip2Network}:${input.endpoint || 'endpoint-omitted'}`;
  return {
    reference: `${input.rail}:${normalized.caip2Network}:${sha256Hex(reference).slice(0, 16)}`,
    hash: input.facilitatorReferenceHash || hashWith0x(reference),
  };
}

async function assertFacilitatorReferenceAvailable(jobId: string, hash: string): Promise<void> {
  const existing = await prisma.paymentLedger.findFirst({
    where: { redactedReferenceHash: normalizeReceiptHash(hash) || hash },
    select: { jobId: true },
  });
  if (existing && existing.jobId !== jobId) {
    throw new SettlementError('x402 facilitator reference is already linked to another job', 409);
  }
}

export async function verifyAndRecordX402SettlementReceipt(
  jobId: string,
  input: X402ReceiptInput,
  options: { policy?: X402Policy; adapter?: X402FacilitatorAdapter } = {},
) {
  assertNoRawPaymentMaterial(input);
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new SettlementError('Job not found', 404);
  if (!isPaidChainRail(job) || !['x402', 'px402'].includes(job.settlementRail || '')) {
    throw new SettlementError('x402 verifier only records explicit x402/px402 paid rails', 409);
  }
  if (job.settlementRail !== input.rail) {
    throw new SettlementError('x402 receipt rail does not match job', 409);
  }

  const normalized = normalizeNetwork(input);
  if (job.network !== normalized.network || job.chainId !== normalized.chainId) {
    throw new SettlementError(`x402 receipt expected ${job.network} chainId ${job.chainId}`, 409);
  }

  const policy = options.policy || getX402PolicyFromEnv();
  assertPolicyAllows(input, policy, normalized);

  const adapter = options.adapter || coinbaseCdpX402Adapter;
  const verify = await adapter.verify({ ...input, ...normalized }, policy);
  const settle = await adapter.settle({ ...input, ...normalized }, policy);
  const evidence = mergeFacilitatorEvidence(verify, settle);

  const txHash = normalizeHash(input.txHash || evidence.txHash);
  if (!txHash) {
    throw new SettlementError('Settled x402 receipt requires a public txHash from receipt input or facilitator settlement evidence', 409);
  }

  const evidenceReceiptHash = normalizeReceiptHash(input.receiptHash)
    || normalizeReceiptHash(evidence.receiptHash)
    || canonicalReceiptHash({
      rail: input.rail,
      jobId,
      network: normalized.caip2Network,
      txHash,
      reference: evidence.reference,
    });

  const reference = redactedReference(input, evidence, normalized);
  await assertFacilitatorReferenceAvailable(job.id, reference.hash);

  const amount = evidence.amount || String(input.amount);
  const tokenSymbol = (evidence.tokenSymbol || input.tokenSymbol).toUpperCase();
  if (amountToUnits(amount, tokenSymbol) !== amountToUnits(job.budgetAmount, job.budgetToken)) {
    throw new SettlementError('x402 receipt amount does not match job budget', 409);
  }
  if (tokenSymbol !== job.budgetToken) {
    throw new SettlementError('x402 receipt token does not match job budget token', 409);
  }

  const ledger = await recordSettlementReceipt(job.id, {
    receipt: 'redacted-x402-settlement',
    rail: input.rail,
    amount,
    tokenSymbol,
    walletAddress: normalizeAddress(input.payerWallet || evidence.payer) || undefined,
    recipientAddress: normalizeAddress(input.payeeWallet || evidence.payee) || undefined,
    endpoint: input.endpoint ? hashWith0x(input.endpoint) : undefined,
    txHash,
    receiptHash: evidenceReceiptHash,
    chainId: normalized.chainId,
    network: normalized.network,
    status: 'SETTLED',
    redactedReference: reference.reference,
    redactedReferenceHash: reference.hash,
    redactedReferenceType: `${policy.provider}:x402-facilitator`,
  });

  assertReceiptMatchesJob(job, ledger);
  return ledger;
}
