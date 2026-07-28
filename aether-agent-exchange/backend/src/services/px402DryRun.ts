import crypto from 'crypto';

export type PaymentRail = 'x402' | 'px402';
export type ProbeMethod = 'GET' | 'POST' | 'HEAD';

export interface X402RequirementSummary {
  endpoint: string;
  method: ProbeMethod;
  status: 402 | number;
  scheme?: string;
  network?: string;
  chainId?: number;
  currency?: string;
  amount?: string;
  amountAtomic?: string;
  payTo?: string;
  maxTimeoutSeconds?: number;
  rawHeaderPresent: boolean;
  redaction: 'raw-payment-header-omitted';
}

export interface Px402Policy {
  mode: 'dry-run';
  allowedNetworks: string[];
  maxProbeUsd: string;
  allowPlainX402Fallback: boolean;
  endpointAllowlist: string[];
}

export interface BaseMcpX402Lifecycle {
  protocol: 'base-mcp-x402';
  pilot: {
    enabled: false;
    network: 'base-sepolia';
    chainId: 84532;
    guard: 'disabled-by-default';
    guardSatisfied: false;
    guardReasons: string[];
  };
  approval: {
    state: 'disabled';
    requiredAction: string;
    automaticPaymentHeaders: false;
    paidRetries: false;
    rawPaymentHeaderStored: false;
  };
  status: {
    state: 'blocked' | 'quoted';
    display: string;
    mcpStatus: 'blocked_by_policy' | 'dry_run_quote_available';
    nextAction: string;
  };
  redactedReferences: {
    quoteReference: string;
    receiptReference: string;
    receiptReferenceHash: string;
  };
}

export interface Px402DryRunPlan {
  rail: 'px402' | 'x402' | 'unsupported';
  executeDisabled: true;
  requiredApprovals: string[];
  lifecycle: BaseMcpX402Lifecycle;
  redactedReceipt: {
    timestamp: string;
    mode: 'dry-run';
    endpoint: string;
    endpointHash: string;
    method: ProbeMethod;
    httpStatus: number;
    railCandidate: 'px402' | 'x402' | 'unsupported';
    network: string | null;
    chainId: number | null;
    currency: string | null;
    amount: string | null;
    amountAtomic: string | null;
    payToPresent: boolean;
    rawPaymentHeaderStored: false;
    executeDisabled: true;
    nextAction: string;
    policyReasons: string[];
    baseMcpStatus: BaseMcpX402Lifecycle['status'];
    redactedQuoteReference: string;
    redactedReceiptReference: string;
    redactedReceiptReferenceHash: string;
  };
}

export class Px402DryRunError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

const PAYMENT_HEADER_PATTERNS = [
  /^authorization$/i,
  /^proxy-authorization$/i,
  /^x-payment$/i,
  /^x-payment-/i,
  /^payment$/i,
  /^payment-/i,
  /^payment-signature$/i,
];

const CHALLENGE_HEADERS = [
  'payment-required',
  'x-payment-required',
  'www-authenticate',
  'x-402-payment-required',
];

const NETWORK_CHAIN_IDS: Record<string, number> = {
  base: 8453,
  'base-sepolia': 84532,
  polygon: 137,
  'polygon-amoy': 80002,
};
const PROBE_TIMEOUT_MS = 10_000;
const MAX_PROBE_RESPONSE_BYTES = 256 * 1024;

function normalizeNetwork(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim().replace(/_/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function normalizeCurrency(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim().toUpperCase();
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function endpointHash(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function redactedLifecycleReference(prefix: string, values: Record<string, unknown>): {
  reference: string;
  hash: string;
} {
  const hash = endpointHash(JSON.stringify(values));
  const rail = typeof values.rail === 'string' ? values.rail : 'unsupported';
  const network = typeof values.network === 'string' && values.network ? values.network : 'unknown-network';
  return {
    reference: `${prefix}:${rail}:${network}:${hash.slice(0, 16)}`,
    hash: `0x${hash}`,
  };
}

export function redactEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.origin}${url.pathname}`;
}

export function validateNoPaymentHeaders(headers?: Record<string, string>): void {
  for (const key of Object.keys(headers || {})) {
    if (PAYMENT_HEADER_PATTERNS.some(pattern => pattern.test(key))) {
      throw new Px402DryRunError(`Payment or authorization header is not allowed in dry-run: ${key}`, 400);
    }
  }
}

export function getPx402PolicyFromEnv(): Px402Policy {
  const defaultAllowlist = process.env.NODE_ENV === 'production' ? '' : 'http://localhost,http://127.0.0.1';
  return {
    mode: 'dry-run',
    allowedNetworks: (process.env.PX402_ALLOWED_NETWORKS || 'base-sepolia')
      .split(',')
      .map(normalizeNetwork)
      .filter((value): value is string => Boolean(value)),
    maxProbeUsd: process.env.PX402_MAX_PROBE_USD || '0.25',
    allowPlainX402Fallback: process.env.PX402_ALLOW_PLAIN_X402_FALLBACK === 'true',
    endpointAllowlist: (process.env.PX402_ENDPOINT_ALLOWLIST || defaultAllowlist)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  };
}

export function resolveAllowlistedEndpoint(endpoint: string, allowlist: string[]): URL {
  if (allowlist.length === 0) {
    throw new Px402DryRunError('PX402_ENDPOINT_ALLOWLIST is empty; dry-run endpoint is not allowlisted', 403);
  }

  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Px402DryRunError('Dry-run endpoint must be an HTTP(S) URL without credentials or a fragment', 403);
  }

  const allowed = allowlist.some(entry => {
    let configured: URL;
    try {
      configured = new URL(entry);
    } catch {
      return false;
    }

    if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password) {
      return false;
    }

    const configuredPath = configured.pathname.replace(/\/+$/, '') || '/';
    const requestedPath = url.pathname.replace(/\/+$/, '') || '/';
    const pathAllowed = configuredPath === '/'
      || requestedPath === configuredPath
      || requestedPath.startsWith(`${configuredPath}/`);

    return url.protocol === configured.protocol
      && url.hostname.toLowerCase() === configured.hostname.toLowerCase()
      && url.port === configured.port
      && pathAllowed;
  });

  if (!allowed) {
    throw new Px402DryRunError('Dry-run endpoint is not allowlisted', 403);
  }

  return url;
}

export function enforceEndpointAllowlist(endpoint: string, allowlist: string[]): void {
  resolveAllowlistedEndpoint(endpoint, allowlist);
}

function parseJsonMaybe(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function findFirstObject(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.accepts) && record.accepts[0] && typeof record.accepts[0] === 'object') {
    return record.accepts[0] as Record<string, unknown>;
  }

  if (Array.isArray(record.requirements) && record.requirements[0] && typeof record.requirements[0] === 'object') {
    return record.requirements[0] as Record<string, unknown>;
  }

  if (record.paymentRequirements && typeof record.paymentRequirements === 'object') {
    return record.paymentRequirements as Record<string, unknown>;
  }

  return record;
}

function parseAuthenticateHeader(value: string): Record<string, unknown> {
  const parsedJson = parseJsonMaybe(value);
  if (parsedJson && typeof parsedJson === 'object') return parsedJson as Record<string, unknown>;

  const out: Record<string, unknown> = {};
  const schemeMatch = value.match(/^\s*([A-Za-z0-9_-]+)/);
  if (schemeMatch) out.scheme = schemeMatch[1];

  for (const match of value.matchAll(/([A-Za-z0-9_-]+)=("([^"]*)"|[^,\s]+)/g)) {
    out[match[1]] = match[3] ?? match[2];
  }
  return out;
}

async function parseBody(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers.get('content-type') || '';
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROBE_RESPONSE_BYTES) {
    throw new Px402DryRunError('Dry-run response exceeds the configured size limit', 502);
  }

  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROBE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Px402DryRunError('Dry-run response exceeds the configured size limit', 502);
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
  if (!text) return undefined;
  if (contentType.includes('json')) return parseJsonMaybe(text);
  return parseJsonMaybe(text) ?? { description: text.slice(0, 200) };
}

export function parseX402Challenge(input: {
  endpoint: string;
  method: ProbeMethod;
  status: number;
  headers: Headers;
  body?: unknown;
}): X402RequirementSummary {
  const rawHeader = CHALLENGE_HEADERS
    .map(name => input.headers.get(name))
    .find((value): value is string => Boolean(value));
  const headerChallenge = rawHeader ? parseAuthenticateHeader(rawHeader) : undefined;
  const bodyChallenge = findFirstObject(input.body);
  const challenge = { ...(headerChallenge || {}), ...(bodyChallenge || {}) };

  if (input.status !== 402 && !rawHeader && !bodyChallenge) {
    throw new Px402DryRunError('Endpoint did not return x402 payment requirements', 502);
  }

  const network = normalizeNetwork(challenge.network ?? challenge.chain ?? challenge.paymentNetwork);
  const chainId = asNumber(challenge.chainId) ?? (network ? NETWORK_CHAIN_IDS[network] : undefined);
  const currency = normalizeCurrency(
    challenge.currency ?? challenge.token ?? challenge.assetSymbol ?? challenge.asset ?? challenge.assetName
  );
  const amountAtomic = asString(challenge.maxAmountRequired ?? challenge.amountAtomic ?? challenge.amountRequired);
  const amount = asString(challenge.amount ?? challenge.price) ?? normalizeDisplayAmount(amountAtomic, currency);
  const scheme = asString(challenge.scheme ?? challenge.type ?? challenge.protocol) ?? (rawHeader ? 'x402' : undefined);
  const payTo = asString(challenge.payTo ?? challenge.recipient ?? challenge.address);

  return {
    endpoint: redactEndpoint(input.endpoint),
    method: input.method,
    status: input.status,
    scheme,
    network,
    chainId,
    currency,
    amount,
    amountAtomic,
    payTo,
    maxTimeoutSeconds: asNumber(challenge.maxTimeoutSeconds ?? challenge.timeoutSeconds),
    rawHeaderPresent: Boolean(rawHeader),
    redaction: 'raw-payment-header-omitted',
  };
}

function normalizeDisplayAmount(amountAtomic: string | undefined, currency: string | undefined): string | undefined {
  if (!amountAtomic || !/^\d+$/.test(amountAtomic)) return undefined;
  if (currency && currency !== 'USDC' && currency !== 'USD') return undefined;

  const whole = amountAtomic.length > 6 ? amountAtomic.slice(0, -6) : '0';
  const fraction = amountAtomic.padStart(7, '0').slice(-6).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

function amountUsd(requirements: X402RequirementSummary): number | undefined {
  if (requirements.currency && requirements.currency !== 'USDC' && requirements.currency !== 'USD') return undefined;
  const parsed = requirements.amount ? Number(requirements.amount) : undefined;
  if (parsed !== undefined && Number.isFinite(parsed)) return parsed;
  if (requirements.amountAtomic && /^\d+$/.test(requirements.amountAtomic)) {
    return Number(requirements.amountAtomic) / 1_000_000;
  }
  return undefined;
}

export async function discoverX402Requirements(input: {
  url: string;
  endpointAllowlist: string[];
  method?: ProbeMethod;
  headers?: Record<string, string>;
  body?: unknown;
}): Promise<X402RequirementSummary> {
  const method = input.method || 'GET';
  // Keep the allowlist check in the same function that performs the request so
  // callers cannot accidentally bypass the outbound-network policy.
  const endpoint = resolveAllowlistedEndpoint(input.url, input.endpointAllowlist).toString();

  validateNoPaymentHeaders(input.headers);

  const response = await fetch(endpoint, {
    method,
    headers: input.headers,
    body: method === 'POST' && input.body !== undefined ? JSON.stringify(input.body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  const body = await parseBody(response);

  return parseX402Challenge({
    endpoint,
    method,
    status: response.status,
    headers: response.headers,
    body,
  });
}

export function canUsePx402(requirements: X402RequirementSummary, policy: Px402Policy): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const network = normalizeNetwork(requirements.network);
  const maxProbeUsd = Number(policy.maxProbeUsd);
  const requiredAmountUsd = amountUsd(requirements);

  if (!network || !policy.allowedNetworks.includes(network)) {
    reasons.push(`unsupported network: ${requirements.network || 'missing'}`);
  }

  const expectedChainId = network ? NETWORK_CHAIN_IDS[network] : undefined;
  if (expectedChainId !== undefined && requirements.chainId !== expectedChainId) {
    reasons.push(`chainId ${requirements.chainId || 'missing'} does not match network ${network}`);
  }

  if (requiredAmountUsd === undefined) {
    reasons.push(`amount cap cannot be evaluated for currency: ${requirements.currency || 'missing'}`);
  } else if (!Number.isFinite(maxProbeUsd) || requiredAmountUsd > maxProbeUsd) {
    reasons.push(`amount ${requiredAmountUsd} exceeds dry-run cap ${policy.maxProbeUsd}`);
  }

  if (requirements.status !== 402) {
    reasons.push(`expected HTTP 402 challenge, got ${requirements.status}`);
  }

  if (!requirements.payTo) {
    reasons.push('payTo recipient missing');
  }

  return { ok: reasons.length === 0, reasons };
}

export function buildBaseMcpX402Lifecycle(input: {
  requirements: X402RequirementSummary;
  policy: Px402Policy;
  rail: Px402DryRunPlan['rail'];
  policyReasons: string[];
}): BaseMcpX402Lifecycle {
  const network = normalizeNetwork(input.requirements.network);
  const chainId = input.requirements.chainId;
  const baseSepoliaReady = network === 'base-sepolia' && chainId === 84532;
  const guardReasons = [
    'Base MCP x402 Sepolia pilot approval is disabled by default in this build',
    'automatic x402 payment headers are disabled',
    'paid x402 retries are disabled',
  ];

  if (!baseSepoliaReady) {
    guardReasons.push(`Base MCP x402 pilot requires base-sepolia chainId 84532, got ${network || 'missing'} chainId ${chainId || 'missing'}`);
  }

  if (!input.policy.allowedNetworks.includes('base-sepolia')) {
    guardReasons.push('PX402_ALLOWED_NETWORKS does not include base-sepolia');
  }

  const quote = redactedLifecycleReference('base-mcp-x402-quote', {
    rail: input.rail,
    endpoint: input.requirements.endpoint,
    network: input.requirements.network || null,
    chainId: input.requirements.chainId || null,
    currency: input.requirements.currency || null,
    amount: input.requirements.amount || null,
    amountAtomic: input.requirements.amountAtomic || null,
    payToPresent: Boolean(input.requirements.payTo),
  });
  const receipt = redactedLifecycleReference('base-mcp-x402-receipt', {
    quoteReference: quote.reference,
    rail: input.rail,
    policyMode: input.policy.mode,
    policyReasons: input.policyReasons,
    executeDisabled: true,
    automaticPaymentHeaders: false,
    paidRetries: false,
  });

  const blocked = input.rail === 'unsupported' || input.policyReasons.length > 0;

  return {
    protocol: 'base-mcp-x402',
    pilot: {
      enabled: false,
      network: 'base-sepolia',
      chainId: 84532,
      guard: 'disabled-by-default',
      guardSatisfied: false,
      guardReasons,
    },
    approval: {
      state: 'disabled',
      requiredAction: 'operator-approved Sepolia pilot and wallet flow required before live x402 approval',
      automaticPaymentHeaders: false,
      paidRetries: false,
      rawPaymentHeaderStored: false,
    },
    status: {
      state: blocked ? 'blocked' : 'quoted',
      display: blocked
        ? 'Dry-run quote blocked by policy; no payment approval can be attempted.'
        : 'Dry-run quote available; Base MCP x402 approval remains disabled.',
      mcpStatus: blocked ? 'blocked_by_policy' : 'dry_run_quote_available',
      nextAction: 'show quote/status only; do not attach payment headers or retry with payment',
    },
    redactedReferences: {
      quoteReference: quote.reference,
      receiptReference: receipt.reference,
      receiptReferenceHash: receipt.hash,
    },
  };
}

export function buildPx402DryRunPlan(requirements: X402RequirementSummary, policy: Px402Policy): Px402DryRunPlan {
  const decision = canUsePx402(requirements, policy);
  const rail = decision.ok ? 'px402' : policy.allowPlainX402Fallback ? 'x402' : 'unsupported';
  const lifecycle = buildBaseMcpX402Lifecycle({
    requirements,
    policy,
    rail,
    policyReasons: decision.reasons,
  });

  return {
    rail,
    executeDisabled: true,
    requiredApprovals: [
      'operator/test-wallet approval required before live payment',
      'live PRXVT SDK methods disabled in this build',
      'Base MCP x402 Sepolia pilot approval disabled by default',
    ],
    lifecycle,
    redactedReceipt: {
      timestamp: new Date().toISOString(),
      mode: 'dry-run',
      endpoint: requirements.endpoint,
      endpointHash: endpointHash(requirements.endpoint),
      method: requirements.method,
      httpStatus: requirements.status,
      railCandidate: rail,
      network: requirements.network || null,
      chainId: requirements.chainId || null,
      currency: requirements.currency || null,
      amount: requirements.amount || null,
      amountAtomic: requirements.amountAtomic || null,
      payToPresent: Boolean(requirements.payTo),
      rawPaymentHeaderStored: false,
      executeDisabled: true,
      nextAction: 'operator/test-wallet approval required before live payment',
      policyReasons: decision.reasons,
      baseMcpStatus: lifecycle.status,
      redactedQuoteReference: lifecycle.redactedReferences.quoteReference,
      redactedReceiptReference: lifecycle.redactedReferences.receiptReference,
      redactedReceiptReferenceHash: lifecycle.redactedReferences.receiptReferenceHash,
    },
  };
}

export async function runPx402DryRun(input: {
  url: string;
  method?: ProbeMethod;
  headers?: Record<string, string>;
  body?: unknown;
  policy?: Px402Policy;
}): Promise<{ requirements: X402RequirementSummary; plan: Px402DryRunPlan; policy: Px402Policy }> {
  const policy = input.policy || getPx402PolicyFromEnv();
  const requirements = await discoverX402Requirements({
    url: input.url,
    endpointAllowlist: policy.endpointAllowlist,
    method: input.method,
    headers: input.headers,
    body: input.body,
  });
  const plan = buildPx402DryRunPlan(requirements, policy);

  return { requirements, plan, policy };
}
