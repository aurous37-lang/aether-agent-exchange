import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import { caip2ForNetwork, getActiveChain, networkForCaip2, type ChainConfig } from '../config/chains';
import { SettlementError, normalizeHash, normalizeReceiptHash } from './settlement';
import { getX402PolicyFromEnv } from './x402';

export type StablecoinProviderId = 'visa-tap' | 'mastercard-ap4m' | 'x402';
export type StablecoinAdapterId = 'visa-agentic-stablecoin' | 'mastercard-ap4m' | 'x402';
export type StablecoinCapabilityStatus = 'enabled' | 'readiness' | 'disabled';

export interface StablecoinAcceptancePolicy {
  allowedNetworks: string[];
  allowedTokens: string[];
  maxUsd: string;
  mainnetEnabled: boolean;
}

export interface StablecoinProviderCapability {
  providerId: StablecoinProviderId | 'direct-wallet';
  adapterId: StablecoinAdapterId | 'direct-wallet-escrow';
  displayName: string;
  rail: string;
  status: StablecoinCapabilityStatus;
  enabled: boolean;
  readinessOnly: boolean;
  network: string;
  caip2Network: string;
  tokenSymbols: string[];
  merchantRegistrationReady: boolean;
  capabilityDiscovery: true;
  quoteGenerationReady: boolean;
  receiptNormalizationReady: boolean;
  settlementVerificationReady: boolean;
  redactionAuditReady: true;
  reasons: string[];
}

export interface PaymentRequirementRequest {
  providerId: string;
  rail?: string;
  network: string;
  tokenSymbol: string;
  amountUsd: number | string;
  resource: string;
}

export interface PaymentRequirement {
  providerId: StablecoinProviderId;
  rail: string;
  network: string;
  caip2Network: string;
  tokenSymbol: 'USDC';
  amount: string;
  endpointResourceHash: string;
  status: 'READY';
  rawPaymentHeaderStored: false;
  signedPayloadStored: false;
}

export interface StablecoinReceiptEvidenceInput {
  providerId: string;
  rail: string;
  network: string;
  caip2Network?: string;
  tokenSymbol: string;
  amount: string | number;
  endpoint?: string;
  endpointResourceHash?: string;
  receiptHash?: string;
  txHash?: string;
  facilitatorReference?: string;
  facilitatorReferenceHash?: string;
  status: string;
  timestamps?: { createdAt?: string; settledAt?: string };
  payload?: unknown;
}

export interface SafeStablecoinReceiptEvidence {
  providerId: StablecoinProviderId;
  rail: string;
  network: string;
  caip2Network: string;
  tokenSymbol: 'USDC';
  amount: string;
  endpointResourceHash?: string;
  receiptHash: string;
  txHash?: string;
  facilitatorReferenceHash?: string;
  status: string;
  timestamps: { createdAt: string; settledAt?: string };
}

const PROVIDERS: Record<StablecoinProviderId, {
  adapterId: StablecoinAdapterId;
  displayName: string;
  rail: string;
  enabledFlag: string;
  providerUrlEnv?: string;
}> = {
  'visa-tap': {
    adapterId: 'visa-agentic-stablecoin',
    displayName: 'Visa agentic stablecoin readiness',
    rail: 'visa-agentic-stablecoin',
    enabledFlag: 'AAE_ENABLE_VISA_AGENTIC_PAYMENTS',
    providerUrlEnv: 'VISA_AGENTIC_PROVIDER_URL',
  },
  'mastercard-ap4m': {
    adapterId: 'mastercard-ap4m',
    displayName: 'Mastercard AP4M stablecoin readiness',
    rail: 'mastercard-ap4m',
    enabledFlag: 'AAE_ENABLE_MASTERCARD_AP4M',
    providerUrlEnv: 'MASTERCARD_AP4M_PROVIDER_URL',
  },
  x402: {
    adapterId: 'x402',
    displayName: 'x402 stablecoin',
    rail: 'x402',
    enabledFlag: 'AAE_ENABLE_X402_SELLER',
    providerUrlEnv: 'X402_FACILITATOR_URL',
  },
};

const SENSITIVE_FIELD_PATTERN = /(^authorization$|^cookie$|payment[-_]?signature|payment[-_]?header|^x[-_]?payment$|x402[-_]?payment|private[-_]?key|seed[-_]?phrase|mnemonic|wallet[-_]?signature|signed[-_]?payload|signed[-_]?message|card[-_]?credential|pan|cvv|cvc|visa[-_]?secret|mastercard[-_]?secret|ucan[-_]?secret|prxvt[-_]?note)/i;
const MAINNET_CAIP2 = new Set(['eip155:8453', 'eip155:143', 'eip155:1', 'eip155:4663']);

function csv(value: string | undefined, fallback: string): string[] {
  return (value || fallback).split(',').map(item => item.trim()).filter(Boolean);
}

function hashWith0x(value: unknown): string {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

export function getStablecoinAcceptancePolicyFromEnv(): StablecoinAcceptancePolicy {
  return {
    allowedNetworks: csv(process.env.STABLECOIN_ACCEPTANCE_ALLOWED_NETWORKS || process.env.X402_ALLOWED_NETWORKS, 'eip155:84532'),
    allowedTokens: csv(process.env.STABLECOIN_ACCEPTANCE_ALLOWED_TOKENS, 'USDC').map(token => token.toUpperCase()),
    maxUsd: process.env.STABLECOIN_ACCEPTANCE_MAX_USD || process.env.X402_MAX_PAYMENT_USD || '0',
    mainnetEnabled: process.env.AAE_ENABLE_MAINNET_STABLECOIN_ACCEPTANCE === 'true',
  };
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

export function assertNoRawStablecoinPaymentMaterial(value: unknown): void {
  const path = findSensitiveMaterial(value);
  if (path) {
    throw new SettlementError(`Raw payment, credential, signature, or secret material is not accepted at ${path.join('.')}`, 400);
  }
}

function providerEnabled(providerId: StablecoinProviderId): boolean {
  if (providerId === 'x402') {
    return process.env.AAE_ENABLE_X402_SELLER === 'true' || process.env.AAE_ENABLE_X402_BUYER === 'true';
  }
  return process.env[PROVIDERS[providerId].enabledFlag] === 'true';
}

function readinessReasons(providerId: StablecoinProviderId, policy: StablecoinAcceptancePolicy, caip2Network: string): string[] {
  const provider = PROVIDERS[providerId];
  const reasons: string[] = [];
  if (!providerEnabled(providerId)) reasons.push(`${provider.enabledFlag}=false`);
  if (!policy.allowedNetworks.includes(caip2Network)) reasons.push(`network ${caip2Network} is not allowlisted`);
  if (!policy.allowedTokens.includes('USDC')) reasons.push('USDC is not allowlisted');
  if (!Number.isFinite(Number(policy.maxUsd)) || Number(policy.maxUsd) <= 0) reasons.push('stablecoin acceptance cap is unset or zero');
  if (MAINNET_CAIP2.has(caip2Network) && !policy.mainnetEnabled) reasons.push('mainnet stablecoin acceptance is disabled');
  if (providerId === 'x402' && MAINNET_CAIP2.has(caip2Network) && process.env.AAE_ENABLE_X402_MAINNET !== 'true') reasons.push('x402 mainnet is disabled');
  if (provider.providerUrlEnv && !process.env[provider.providerUrlEnv] && providerId !== 'x402') reasons.push(`${provider.providerUrlEnv} is not configured`);
  return reasons;
}

function chainEnvValue(chain: ChainConfig, name: string, fallback?: string): string | undefined {
  const active = getActiveChain().key === chain.key;
  return process.env[`AAE_${chain.contractEnvPrefix}_${name}`]
    || process.env[`${chain.contractEnvPrefix}_${name}`]
    || (active ? process.env[fallback || name] : undefined);
}

function directWalletTokenSymbols(chain: ChainConfig): string[] {
  const tokens: string[] = [];
  const escrowFactory = chainEnvValue(chain, 'ESCROW_FACTORY_ADDRESS');
  const nativeFactory = chainEnvValue(chain, 'NATIVE_ETH_ESCROW_FACTORY_ADDRESS');

  if (escrowFactory && chain.supportedTokens.includes('USDC') && chainEnvValue(chain, 'USDC_TOKEN_ADDRESS')) tokens.push('USDC');
  if (nativeFactory && chain.supportedTokens.includes(chain.nativeCurrency.symbol)) tokens.push(chain.nativeCurrency.symbol);

  return Array.from(new Set(tokens));
}

export function getStablecoinProviderCapabilities(policy = getStablecoinAcceptancePolicyFromEnv(), activeChain: ChainConfig = getActiveChain()): StablecoinProviderCapability[] {
  const caip2Network = caip2ForNetwork(activeChain.key) || `eip155:${activeChain.chainId}`;
  const directTokens = directWalletTokenSymbols(activeChain);
  const directSupported = activeChain.settlementRails.includes('standard');
  const directMainnetGateOpen = !activeChain.paidRailsEnabledEnvFlag || process.env[activeChain.paidRailsEnabledEnvFlag] === 'true';
  const directEnabled = directSupported && directTokens.length > 0 && directMainnetGateOpen;
  const directReasons = [
    ...(!directSupported ? ['direct wallet escrow is not supported on this chain'] : []),
    ...(directSupported && directTokens.length === 0 ? ['no direct-wallet escrow factory/token configuration is available for this chain'] : []),
    ...(directSupported && directTokens.length > 0 && !directMainnetGateOpen ? [`${activeChain.paidRailsEnabledEnvFlag}=false`] : []),
  ];
  const direct: StablecoinProviderCapability = {
    providerId: 'direct-wallet',
    adapterId: 'direct-wallet-escrow',
    displayName: 'Direct wallet escrow',
    rail: 'standard',
    status: directEnabled ? 'enabled' : 'disabled',
    enabled: directEnabled,
    readinessOnly: !directEnabled,
    network: activeChain.key,
    caip2Network,
    tokenSymbols: directTokens,
    merchantRegistrationReady: true,
    capabilityDiscovery: true,
    quoteGenerationReady: true,
    receiptNormalizationReady: true,
    settlementVerificationReady: true,
    redactionAuditReady: true,
    reasons: directReasons,
  };

  return [
    direct,
    ...Object.entries(PROVIDERS).map(([id, provider]) => {
      const providerId = id as StablecoinProviderId;
      const railSupported = activeChain.settlementRails.includes(provider.rail);
      const reasons = [
        ...(!railSupported ? [`${provider.rail} settlement rail is not supported on ${activeChain.key}`] : []),
        ...readinessReasons(providerId, policy, caip2Network),
      ];
      const enabled = reasons.length === 0;
      return {
        providerId,
        adapterId: provider.adapterId,
        displayName: provider.displayName,
        rail: provider.rail,
        status: enabled ? 'enabled' : 'readiness',
        enabled,
        readinessOnly: !enabled,
        network: activeChain.key,
        caip2Network,
        tokenSymbols: railSupported ? policy.allowedTokens : [],
        merchantRegistrationReady: providerId === 'x402' ? Boolean(process.env.X402_FACILITATOR_URL) : false,
        capabilityDiscovery: true,
        quoteGenerationReady: providerId === 'x402',
        receiptNormalizationReady: true,
        settlementVerificationReady: providerId === 'x402',
        redactionAuditReady: true,
        reasons,
      } satisfies StablecoinProviderCapability;
    }),
  ];
}

export function assertStablecoinProviderCanQuote(input: PaymentRequirementRequest, policy = getStablecoinAcceptancePolicyFromEnv()): void {
  const providerId = input.providerId as StablecoinProviderId;
  const provider = PROVIDERS[providerId];
  if (!provider) throw new SettlementError(`Unsupported stablecoin provider ${input.providerId}`, 404);

  const caip2Network = caip2ForNetwork(input.network);
  if (!caip2Network) throw new SettlementError(`Unsupported stablecoin network ${input.network}`, 409);

  const reasons = readinessReasons(providerId, policy, caip2Network);
  if (reasons.length > 0) {
    throw new SettlementError(`${provider.displayName} is not enabled: ${reasons.join('; ')}`, 503);
  }

  if (input.tokenSymbol.toUpperCase() !== 'USDC' || !policy.allowedTokens.includes('USDC')) {
    throw new SettlementError('Stablecoin acceptance is currently USDC-only', 409);
  }

  const amount = Number(input.amountUsd);
  const cap = Number(policy.maxUsd);
  if (!Number.isFinite(amount) || amount <= 0) throw new SettlementError('Stablecoin payment amount must be positive', 400);
  if (!Number.isFinite(cap) || cap <= 0 || amount > cap) {
    throw new SettlementError(`Stablecoin amount ${amount} exceeds configured cap ${policy.maxUsd || 'unset'}`, 403);
  }
}

export function generatePaymentRequirement(input: PaymentRequirementRequest, policy = getStablecoinAcceptancePolicyFromEnv()): PaymentRequirement {
  assertNoRawStablecoinPaymentMaterial(input);
  assertStablecoinProviderCanQuote(input, policy);
  const caip2Network = caip2ForNetwork(input.network)!;
  return {
    providerId: input.providerId as StablecoinProviderId,
    rail: input.rail || PROVIDERS[input.providerId as StablecoinProviderId].rail,
    network: networkForCaip2(caip2Network),
    caip2Network,
    tokenSymbol: 'USDC',
    amount: String(input.amountUsd),
    endpointResourceHash: hashWith0x(input.resource),
    status: 'READY',
    rawPaymentHeaderStored: false,
    signedPayloadStored: false,
  };
}

export function normalizeStablecoinReceiptEvidence(input: StablecoinReceiptEvidenceInput): SafeStablecoinReceiptEvidence {
  assertNoRawStablecoinPaymentMaterial(input);
  const providerId = input.providerId as StablecoinProviderId;
  if (!PROVIDERS[providerId]) throw new SettlementError(`Unsupported stablecoin provider ${input.providerId}`, 404);
  const caip2Network = input.caip2Network || caip2ForNetwork(input.network);
  if (!caip2Network) throw new SettlementError(`Unsupported stablecoin network ${input.network}`, 409);
  if (input.tokenSymbol.toUpperCase() !== 'USDC') throw new SettlementError('Stablecoin receipt evidence is currently USDC-only', 409);

  const receiptHash = normalizeReceiptHash(input.receiptHash) || hashWith0x({
    providerId,
    rail: input.rail,
    network: caip2Network,
    amount: String(input.amount),
    endpoint: input.endpointResourceHash || (input.endpoint ? hashWith0x(input.endpoint) : undefined),
    facilitatorReferenceHash: input.facilitatorReferenceHash || (input.facilitatorReference ? hashWith0x(input.facilitatorReference) : undefined),
    status: input.status,
  });
  const txHash = normalizeHash(input.txHash);
  if (input.txHash && !txHash) throw new SettlementError('Stablecoin receipt txHash is invalid', 400);

  return {
    providerId,
    rail: input.rail,
    network: networkForCaip2(caip2Network),
    caip2Network,
    tokenSymbol: 'USDC',
    amount: String(input.amount),
    endpointResourceHash: input.endpointResourceHash || (input.endpoint ? hashWith0x(input.endpoint) : undefined),
    receiptHash,
    txHash: txHash || undefined,
    facilitatorReferenceHash: input.facilitatorReferenceHash || (input.facilitatorReference ? hashWith0x(input.facilitatorReference) : undefined),
    status: input.status,
    timestamps: {
      createdAt: input.timestamps?.createdAt || new Date().toISOString(),
      settledAt: input.timestamps?.settledAt,
    },
  };
}

export async function assertStablecoinReceiptReferenceAvailable(receiptHash: string, txHash?: string): Promise<void> {
  const normalizedReceiptHash = normalizeReceiptHash(receiptHash);
  if (!normalizedReceiptHash) throw new SettlementError('Stablecoin receiptHash is invalid', 400);
  const normalizedTxHash = normalizeHash(txHash);
  const [existingByReceipt, existingByTx] = await Promise.all([
    prisma.paymentLedger.findUnique({ where: { receiptHash: normalizedReceiptHash } }),
    normalizedTxHash ? prisma.paymentLedger.findUnique({ where: { txHash: normalizedTxHash } }) : Promise.resolve(null),
  ]);
  if (existingByReceipt || existingByTx) {
    throw new SettlementError('Stablecoin receipt reference is already recorded', 409);
  }
}

export function stablecoinPolicySummary(policy = getStablecoinAcceptancePolicyFromEnv()) {
  const x402Policy = getX402PolicyFromEnv();
  return {
    allowedNetworks: policy.allowedNetworks,
    allowedTokens: policy.allowedTokens,
    maxUsd: policy.maxUsd,
    mainnetEnabled: policy.mainnetEnabled,
    x402: {
      sellerEnabled: x402Policy.sellerEnabled,
      buyerEnabled: x402Policy.buyerEnabled,
      facilitatorConfigured: Boolean(x402Policy.facilitatorUrl),
      automaticPaymentHeaders: false,
      rawPaymentHeaderStorage: false,
    },
  };
}
