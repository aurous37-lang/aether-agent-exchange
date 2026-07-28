import { createHash } from 'crypto';
import prisma from '../lib/prisma';
import {
  BaseMcpX402Lifecycle,
  buildBaseMcpX402Lifecycle,
  getPx402PolicyFromEnv,
  ProbeMethod,
  Px402Policy,
  resolveAllowlistedEndpoint,
} from './px402DryRun';

export interface Px402QuoteRequest {
  endpoint: string;
  method?: string;
}

export interface Px402Quote {
  rail: 'px402-dry-run';
  endpoint: string;
  network: string;
  chainId: number;
  amount: number;
  tokenSymbol?: string;
  receiptHash: string;
  redactedReference: string;
  lifecycle: BaseMcpX402Lifecycle;
}

const SUPPORTED_NETWORKS = new Map([
  ['base-sepolia', 84532],
]);
const PROBE_TIMEOUT_MS = 10_000;
const MAX_PROBE_RESPONSE_BYTES = 256 * 1024;

function maxAmount(policy: Px402Policy): number {
  return Number(policy.maxProbeUsd);
}

function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function hashQuote(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function ensureAllowedEndpoint(endpoint: string, policy: Px402Policy): URL {
  return resolveAllowlistedEndpoint(endpoint, policy.endpointAllowlist);
}

function parseHeaderChallenge(headers: Headers): any | null {
  const raw = headers.get('payment-required') || headers.get('x-402-payment-required') || headers.get('x-payment-required');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Malformed 402 payment challenge');
  }
}

function parseWwwAuthenticate(headers: Headers): any | null {
  const raw = headers.get('www-authenticate');
  if (!raw || !raw.toLowerCase().startsWith('x402')) return null;

  const challenge: Record<string, string> = {};
  for (const part of raw.replace(/^x402\s*/i, '').split(',')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key || rest.length === 0) continue;
    challenge[key] = rest.join('=').replace(/^"|"$/g, '');
  }
  return challenge;
}

function normalizeChallenge(challenge: any, policy: Px402Policy) {
  const network = String(challenge.network || challenge.chain || challenge.resourceNetwork || '').toLowerCase();
  const chainId = Number(challenge.chainId || SUPPORTED_NETWORKS.get(network));
  const amount = Number(challenge.amount || challenge.maxAmount || challenge.price);
  const tokenSymbol = challenge.tokenSymbol || challenge.asset || challenge.token;
  const payTo = challenge.payTo || challenge.recipient || challenge.address;

  if (!network || !SUPPORTED_NETWORKS.has(network)) {
    throw new Error('Unsupported px402 network');
  }
  if (!policy.allowedNetworks.includes(network)) {
    throw new Error('Unsupported px402 network');
  }
  if (chainId !== SUPPORTED_NETWORKS.get(network)) {
    throw new Error('px402 challenge chainId does not match network');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Malformed px402 amount');
  }
  if (!Number.isFinite(maxAmount(policy)) || amount > maxAmount(policy)) {
    throw new Error('px402 amount exceeds configured cap');
  }

  return { network, chainId, amount, tokenSymbol, payTo };
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROBE_RESPONSE_BYTES) {
    throw new Error('px402 response exceeds the configured size limit');
  }

  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROBE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('px402 response exceeds the configured size limit');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);
  return text ? JSON.parse(text) : null;
}

export async function probePx402Quote(input: Px402QuoteRequest): Promise<Px402Quote> {
  const policy = getPx402PolicyFromEnv();
  const endpoint = ensureAllowedEndpoint(input.endpoint, policy);

  const response = await fetch(endpoint.toString(), {
    method: input.method || 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AAE-px402-dry-run',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  if (response.status !== 402) {
    throw new Error(`Expected 402 Payment Required, got ${response.status}`);
  }

  let challenge = parseHeaderChallenge(response.headers) || parseWwwAuthenticate(response.headers);
  if (!challenge) {
    const body = await readLimitedJson(response).catch(() => null) as any;
    challenge = body?.payment || body?.x402 || body;
  }
  if (!challenge) {
    throw new Error('Missing px402 payment challenge');
  }

  const normalized = normalizeChallenge(challenge, policy);
  const redactedEndpoint = redactEndpoint(endpoint.toString());
  const receiptHash = hashQuote({
    rail: 'px402-dry-run',
    endpoint: redactedEndpoint,
    network: normalized.network,
    chainId: normalized.chainId,
    amount: String(normalized.amount),
    tokenSymbol: normalized.tokenSymbol,
  });
  const redactedReference = `px402:${normalized.network}:${receiptHash.slice(0, 12)}`;
  const lifecycle = buildBaseMcpX402Lifecycle({
    requirements: {
      endpoint: redactedEndpoint,
      method: (input.method || 'GET') as ProbeMethod,
      status: response.status,
      scheme: 'x402',
      network: normalized.network,
      chainId: normalized.chainId,
      currency: normalized.tokenSymbol,
      amount: String(normalized.amount),
      payTo: normalized.payTo,
      rawHeaderPresent: true,
      redaction: 'raw-payment-header-omitted',
    },
    policy,
    rail: 'px402',
    policyReasons: [],
  });

  await prisma.paymentLedger.upsert({
    where: { receiptHash },
    update: { status: 'QUOTED' },
    create: {
      receipt: 'redacted-px402-quote',
      rail: 'px402-dry-run',
      mode: 'probe',
      amount: String(normalized.amount),
      token: normalized.tokenSymbol,
      tokenSymbol: normalized.tokenSymbol,
      endpoint: redactedEndpoint,
      receiptHash,
      chainId: normalized.chainId,
      network: normalized.network,
      status: 'QUOTED',
      redactedReference,
      redactedReferenceHash: `0x${receiptHash}`,
      redactedReferenceType: 'base-mcp-x402-dry-run-quote',
      redactedPaymentReference: redactedReference,
    },
  });

  return {
    rail: 'px402-dry-run',
    endpoint: redactedEndpoint,
    network: normalized.network,
    chainId: normalized.chainId,
    amount: normalized.amount,
    tokenSymbol: normalized.tokenSymbol,
    receiptHash,
    redactedReference,
    lifecycle,
  };
}

export function createLivePx402PaymentHeader(): never {
  throw new Error('Live px402 payment headers are disabled in dry-run mode');
}

export function submitLivePx402Payment(): never {
  throw new Error('Live px402 payment submission is disabled in dry-run mode');
}
