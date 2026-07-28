import crypto from 'crypto';
import { z } from 'zod';

import { mcpPolicyRequestSchema } from '../utils/validation';

export type McpToolCategory = 'discovered' | 'read' | 'write' | 'x402';
export type McpCallKind = 'discover' | 'read' | 'send' | 'send_calls' | 'swap' | 'sign' | 'x402';
export type McpPolicyRequest = z.infer<typeof mcpPolicyRequestSchema>;

export type McpPolicyErrorCode =
  | 'MCP_SCHEMA_INVALID'
  | 'MCP_DANGEROUS_TOOL'
  | 'MCP_RAW_SECRET_OR_CALLDATA'
  | 'MCP_ENDPOINT_NOT_ALLOWLISTED'
  | 'MCP_NETWORK_NOT_ALLOWLISTED'
  | 'MCP_CHAIN_MISMATCH'
  | 'MCP_EXECUTION_DISABLED'
  | 'MCP_AMOUNT_CAP_EXCEEDED'
  | 'MCP_AMOUNT_CAP_UNEVALUATED'
  | 'MCP_TARGET_INVALID'
  | 'MCP_UNSUPPORTED_OPERATION';

export interface McpPolicyViolation {
  code: McpPolicyErrorCode;
  message: string;
  path?: string;
  statusCode: number;
  detail?: Record<string, unknown>;
}

export interface McpPolicyConfig {
  allowedNetworks: string[];
  endpointAllowlist: string[];
  maxProbeUsd: string;
  allowPlainX402Fallback: boolean;
  writeExecutionEnabled: boolean;
  x402ExecutionEnabled: boolean;
}

export interface McpSanitizedCallSummary {
  category: McpToolCategory;
  operation: McpCallKind;
  executeRequested: boolean;
  endpoint?: string;
  endpointHash?: string;
  network?: string;
  chainId?: number;
  targetAddress?: string;
  method?: string;
  amountUsd?: string;
  tokenSymbol?: string;
  callCount?: number;
  rawCalldataStored: false;
  rawPaymentHeaderStored: false;
}

export interface McpPolicyDecision {
  allowed: boolean;
  statusCode: number;
  errors: McpPolicyViolation[];
  warnings: string[];
  config: {
    allowedNetworks: string[];
    endpointAllowlistConfigured: boolean;
    maxProbeUsd: string;
    writeExecutionEnabled: boolean;
    x402ExecutionEnabled: boolean;
  };
  sanitizedSummary?: McpSanitizedCallSummary;
}

export class McpPolicyRejection extends Error {
  constructor(public decision: McpPolicyDecision) {
    super(decision.errors[0]?.message || 'MCP policy rejected request');
  }
}

const BASE_SEPOLIA_NETWORK = 'base-sepolia';
const BASE_SEPOLIA_CHAIN_ID = 84532;
const NETWORK_CHAIN_IDS: Record<string, number> = {
  [BASE_SEPOLIA_NETWORK]: BASE_SEPOLIA_CHAIN_ID,
  'monad-testnet': 10143,
};
const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

const DANGEROUS_TOOL_PATTERNS = [
  /\bsign(er|ature|_?typed|_?message|_?transaction)?\b/i,
  /\bprivate[-_\s]?key\b/i,
  /\bseed[-_\s]?phrase\b/i,
  /\bmnemonic\b/i,
  /\bdelegat(e|ion|or)\b/i,
  /\bucan\b/i,
  /\braw[-_\s]?(payment[-_\s]?)?header\b/i,
  /\bx[-_]?payment\b/i,
  /\bauthorization[-_\s]?header\b/i,
  /\bpayment[-_\s]?signature\b/i,
  /\bprxvt[-_\s]?note\b/i,
];

const RAW_FIELD_PATTERNS = [
  /^authorization$/i,
  /^proxyAuthorization$/i,
  /^proxy-authorization$/i,
  /^headers?$/i,
  /^paymentHeader$/i,
  /^payment-header$/i,
  /^xPayment$/i,
  /^x-payment$/i,
  /^x402Header$/i,
  /^raw(Header|Payment|Calldata|Transaction|Signature)?$/i,
  /^calldata$/i,
  /^callData$/i,
  /^data$/i,
  /^input$/i,
  /^signed(Transaction|Message)?$/i,
  /^signature$/i,
  /^privateKey$/i,
  /^seedPhrase$/i,
  /^mnemonic$/i,
  /^ucan$/i,
  /^delegation$/i,
];

const WRITE_OPERATIONS = new Set<McpCallKind>(['send', 'send_calls', 'swap']);

function normalizeNetwork(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim().replace(/_/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function parseList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.origin}${url.pathname}`;
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function violation(
  code: McpPolicyErrorCode,
  message: string,
  path?: string,
  statusCode = 403,
  detail?: Record<string, unknown>,
): McpPolicyViolation {
  return { code, message, path, statusCode, detail };
}

export function getMcpPolicyConfigFromEnv(): McpPolicyConfig {
  const defaultAllowlist = process.env.NODE_ENV === 'production' ? '' : 'http://localhost,http://127.0.0.1';
  return {
    allowedNetworks: parseList(process.env.PX402_ALLOWED_NETWORKS || BASE_SEPOLIA_NETWORK)
      .map(normalizeNetwork)
      .filter((value): value is string => Boolean(value)),
    endpointAllowlist: parseList(process.env.PX402_ENDPOINT_ALLOWLIST || defaultAllowlist),
    maxProbeUsd: process.env.PX402_MAX_PROBE_USD || '0.25',
    allowPlainX402Fallback: process.env.PX402_ALLOW_PLAIN_X402_FALLBACK === 'true',
    writeExecutionEnabled: parseBoolean(process.env.AAE_ENABLE_MCP_WRITE_EXECUTION),
    x402ExecutionEnabled: parseBoolean(process.env.AAE_ENABLE_MCP_X402_EXECUTION),
  };
}

export function classifyMcpTool(input: Pick<McpPolicyRequest, 'tool' | 'category' | 'operation' | 'call'>): McpToolCategory {
  if (input.category) return input.category;
  if (input.tool?.category) return input.tool.category;
  const operation = input.call?.kind || input.operation;
  if (operation === 'x402') return 'x402';
  if (operation && WRITE_OPERATIONS.has(operation)) return 'write';
  if (operation === 'discover') return 'discovered';
  return 'read';
}

function inferOperation(input: McpPolicyRequest): McpCallKind {
  return input.call?.kind || input.operation || (classifyMcpTool(input) === 'discovered' ? 'discover' : 'read');
}

function containsDangerousToolName(input: McpPolicyRequest): string | undefined {
  const haystack = [
    input.tool?.name,
    input.tool?.description,
    input.target?.method,
    input.call?.method,
    input.call?.summary,
    input.target?.summary,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');
  return haystack.find(value => DANGEROUS_TOOL_PATTERNS.some(pattern => pattern.test(value)));
}

function containsRawSensitiveField(value: unknown, path = '$'): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = containsRawSensitiveField(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return undefined;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (RAW_FIELD_PATTERNS.some(pattern => pattern.test(key))) return `${path}.${key}`;
    const found = containsRawSensitiveField(child, `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
}

export function isEndpointAllowlisted(endpoint: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return false;
  const url = new URL(endpoint);
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  return allowlist.some(entry => {
    const normalizedEntry = entry.endsWith('/') ? entry.slice(0, -1) : entry;
    return url.origin === normalizedEntry || normalizedEndpoint.startsWith(normalizedEntry);
  });
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringifyAmount(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return undefined;
}

function amountUsdFromSummary(summary: Record<string, unknown>): number | undefined {
  const direct = coerceNumber(summary.amountUsd);
  if (direct !== undefined) return direct;

  const token = typeof summary.tokenSymbol === 'string' ? summary.tokenSymbol.toUpperCase() : undefined;
  if (token === 'USDC' || token === 'USD') {
    return coerceNumber(summary.amount);
  }

  return undefined;
}

function hasValueRequest(summary: Record<string, unknown>): boolean {
  return summary.value !== undefined || summary.amount !== undefined || summary.amountUsd !== undefined;
}

function evaluateAmountCaps(input: McpPolicyRequest, config: McpPolicyConfig, errors: McpPolicyViolation[]): string | undefined {
  const maxProbeUsd = coerceNumber(config.maxProbeUsd);
  const summaries: Array<{ path: string; summary: Record<string, unknown> }> = [];
  if (input.call) summaries.push({ path: 'call', summary: input.call as Record<string, unknown> });
  for (const [index, call] of (input.call?.calls || []).entries()) {
    summaries.push({ path: `call.calls[${index}]`, summary: call as Record<string, unknown> });
  }

  let firstAmountUsd: string | undefined;
  for (const item of summaries) {
    if (!hasValueRequest(item.summary)) continue;

    const amountUsd = amountUsdFromSummary(item.summary);
    if (amountUsd === undefined) {
      errors.push(violation(
        'MCP_AMOUNT_CAP_UNEVALUATED',
        'Value or payment amount cannot be evaluated against PX402_MAX_PROBE_USD',
        item.path,
        400,
      ));
      continue;
    }

    firstAmountUsd = firstAmountUsd || String(amountUsd);
    if (maxProbeUsd === undefined || !Number.isFinite(maxProbeUsd) || amountUsd > maxProbeUsd) {
      errors.push(violation(
        'MCP_AMOUNT_CAP_EXCEEDED',
        `Amount ${amountUsd} exceeds configured cap ${config.maxProbeUsd}`,
        item.path,
        403,
        { maxProbeUsd: config.maxProbeUsd },
      ));
    }
  }

  return firstAmountUsd;
}

function validateNetworkChain(
  network: string | undefined,
  chainId: number | undefined,
  config: McpPolicyConfig,
  errors: McpPolicyViolation[],
): void {
  const normalizedNetwork = normalizeNetwork(network);
  if (!normalizedNetwork) {
    errors.push(violation('MCP_NETWORK_NOT_ALLOWLISTED', 'Network is required for MCP write or x402 policy checks', 'network', 400));
    return;
  }

  if (!config.allowedNetworks.includes(normalizedNetwork)) {
    errors.push(violation(
      'MCP_NETWORK_NOT_ALLOWLISTED',
      `Network ${normalizedNetwork} is not allowlisted`,
      'network',
      403,
      { allowedNetworks: config.allowedNetworks },
    ));
  }

  const expectedChainId = NETWORK_CHAIN_IDS[normalizedNetwork];
  if (expectedChainId !== undefined && chainId !== expectedChainId) {
    errors.push(violation(
      'MCP_CHAIN_MISMATCH',
      `Network ${normalizedNetwork} requires chainId ${expectedChainId}`,
      'chainId',
      400,
      { network: normalizedNetwork, chainId: expectedChainId },
    ));
  }
}

function validateBaseSepoliaWrite(network: string | undefined, chainId: number | undefined, errors: McpPolicyViolation[]): void {
  const normalizedNetwork = normalizeNetwork(network);
  if (normalizedNetwork !== BASE_SEPOLIA_NETWORK || chainId !== BASE_SEPOLIA_CHAIN_ID) {
    errors.push(violation(
      'MCP_CHAIN_MISMATCH',
      `Base MCP writes require network ${BASE_SEPOLIA_NETWORK} and chainId ${BASE_SEPOLIA_CHAIN_ID}`,
      'chainId',
      400,
      { network: BASE_SEPOLIA_NETWORK, chainId: BASE_SEPOLIA_CHAIN_ID },
    ));
  }
}

function firstAddress(input: McpPolicyRequest): string | undefined {
  return input.call?.to || input.call?.target || input.target?.address || input.target?.contractAddress;
}

function validateAddress(address: string | undefined, operation: McpCallKind, errors: McpPolicyViolation[]): void {
  if (!WRITE_OPERATIONS.has(operation)) return;
  if (!address || !ETHEREUM_ADDRESS_PATTERN.test(address)) {
    errors.push(violation('MCP_TARGET_INVALID', 'Write operation requires a valid target address', 'target', 400));
  }
}

function validateEndpoint(endpoint: string | undefined, config: McpPolicyConfig, errors: McpPolicyViolation[]): string | undefined {
  if (!endpoint) return undefined;
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!isEndpointAllowlisted(endpoint, config.endpointAllowlist)) {
    errors.push(violation(
      'MCP_ENDPOINT_NOT_ALLOWLISTED',
      'MCP endpoint is not in PX402_ENDPOINT_ALLOWLIST',
      'endpoint',
      403,
      { endpoint: normalizedEndpoint },
    ));
  }
  return normalizedEndpoint;
}

function buildSanitizedSummary(
  input: McpPolicyRequest,
  category: McpToolCategory,
  operation: McpCallKind,
  executeRequested: boolean,
  amountUsd?: string,
): McpSanitizedCallSummary {
  const endpoint = input.call?.endpoint || input.target?.endpoint;
  const normalizedEndpoint = endpoint ? normalizeEndpoint(endpoint) : undefined;
  const network = normalizeNetwork(input.call?.network || input.target?.network);
  const targetAddress = firstAddress(input);

  return {
    category,
    operation,
    executeRequested,
    ...(normalizedEndpoint && { endpoint: normalizedEndpoint, endpointHash: hashValue(normalizedEndpoint) }),
    ...(network && { network }),
    ...((input.call?.chainId || input.target?.chainId) && { chainId: input.call?.chainId || input.target?.chainId }),
    ...(targetAddress && { targetAddress }),
    ...((input.call?.method || input.target?.method) && { method: input.call?.method || input.target?.method }),
    ...(amountUsd && { amountUsd }),
    ...(input.call?.tokenSymbol && { tokenSymbol: input.call.tokenSymbol.toUpperCase() }),
    ...(input.call?.calls && { callCount: input.call.calls.length }),
    rawCalldataStored: false,
    rawPaymentHeaderStored: false,
  };
}

export function validateMcpPolicy(
  request: unknown,
  config: McpPolicyConfig = getMcpPolicyConfigFromEnv(),
): McpPolicyDecision {
  const parsed = mcpPolicyRequestSchema.safeParse(request);
  const schemaErrors: McpPolicyViolation[] = parsed.success
    ? []
    : parsed.error.errors.map(err => violation(
      'MCP_SCHEMA_INVALID',
      err.message,
      err.path.join('.'),
      400,
    ));

  const input: McpPolicyRequest = parsed.success ? parsed.data : { execute: false };
  const errors: McpPolicyViolation[] = [...schemaErrors];
  const warnings: string[] = [];
  const category = classifyMcpTool(input);
  const operation = inferOperation(input);
  const executeRequested = input.execute === true;

  const dangerousToolMatch = containsDangerousToolName(input);
  if (dangerousToolMatch || operation === 'sign') {
    errors.push(violation(
      'MCP_DANGEROUS_TOOL',
      'MCP tools for signing, private keys, delegation, or raw payment headers are disabled',
      dangerousToolMatch ? 'tool' : 'call.kind',
      403,
    ));
  }

  const rawFieldPath = containsRawSensitiveField(input);
  if (rawFieldPath) {
    errors.push(violation(
      'MCP_RAW_SECRET_OR_CALLDATA',
      'Raw calldata, signatures, private material, or payment headers are not accepted by MCP policy',
      rawFieldPath,
      400,
    ));
  }

  if (!['discover', 'read', 'send', 'send_calls', 'swap', 'sign', 'x402'].includes(operation)) {
    errors.push(violation('MCP_UNSUPPORTED_OPERATION', `Unsupported MCP operation: ${operation}`, 'call.kind', 400));
  }

  const endpoint = input.call?.endpoint || input.target?.endpoint;
  const normalizedEndpoint = validateEndpoint(endpoint, config, errors);
  const network = input.call?.network || input.target?.network;
  const chainId = input.call?.chainId || input.target?.chainId;

  if (category === 'write' || category === 'x402' || WRITE_OPERATIONS.has(operation)) {
    validateNetworkChain(network, chainId, config, errors);
  }

  if (WRITE_OPERATIONS.has(operation)) {
    validateBaseSepoliaWrite(network, chainId, errors);
    validateAddress(firstAddress(input), operation, errors);
  }

  if (operation === 'send_calls') {
    for (const [index, call] of (input.call?.calls || []).entries()) {
      const address = call.to || call.target;
      if (!address || !ETHEREUM_ADDRESS_PATTERN.test(address)) {
        errors.push(violation('MCP_TARGET_INVALID', 'send_calls item requires a valid target address', `call.calls[${index}]`, 400));
      }
    }
  }

  if (operation === 'swap' && (!input.call?.fromToken || !input.call?.toToken)) {
    errors.push(violation('MCP_TARGET_INVALID', 'Swap summary requires fromToken and toToken', 'call', 400));
  }

  if ((category === 'x402' || operation === 'x402' || operation === 'swap') && input.call && !hasValueRequest(input.call as Record<string, unknown>)) {
    errors.push(violation(
      'MCP_AMOUNT_CAP_UNEVALUATED',
      'x402 and swap summaries require an amountUsd or USD/USDC amount for cap enforcement',
      'call.amountUsd',
      400,
    ));
  }

  const amountUsd = evaluateAmountCaps(input, config, errors);

  if (executeRequested && (category === 'write' || WRITE_OPERATIONS.has(operation)) && !config.writeExecutionEnabled) {
    errors.push(violation(
      'MCP_EXECUTION_DISABLED',
      'MCP write execution is disabled; set AAE_ENABLE_MCP_WRITE_EXECUTION=true only for controlled testnet use',
      'execute',
      403,
    ));
  }

  if (executeRequested && (category === 'x402' || operation === 'x402') && !config.x402ExecutionEnabled) {
    errors.push(violation(
      'MCP_EXECUTION_DISABLED',
      'MCP x402 execution is disabled; dry-run summaries only',
      'execute',
      403,
    ));
  }

  if ((category === 'x402' || operation === 'x402') && executeRequested && !config.allowPlainX402Fallback) {
    warnings.push('Plain x402 fallback is disabled by PX402_ALLOW_PLAIN_X402_FALLBACK');
  }

  const sanitizedSummary = buildSanitizedSummary(input, category, operation, executeRequested, amountUsd);
  const statusCode = errors.length > 0 ? Math.max(...errors.map(error => error.statusCode)) : 200;

  if (normalizedEndpoint && sanitizedSummary.endpoint !== normalizedEndpoint) {
    sanitizedSummary.endpoint = normalizedEndpoint;
    sanitizedSummary.endpointHash = hashValue(normalizedEndpoint);
  }

  return {
    allowed: errors.length === 0,
    statusCode,
    errors,
    warnings,
    config: {
      allowedNetworks: config.allowedNetworks,
      endpointAllowlistConfigured: config.endpointAllowlist.length > 0,
      maxProbeUsd: config.maxProbeUsd,
      writeExecutionEnabled: config.writeExecutionEnabled,
      x402ExecutionEnabled: config.x402ExecutionEnabled,
    },
    sanitizedSummary,
  };
}

export function assertMcpPolicy(
  request: unknown,
  config: McpPolicyConfig = getMcpPolicyConfigFromEnv(),
): McpPolicyDecision {
  const decision = validateMcpPolicy(request, config);
  if (!decision.allowed) {
    throw new McpPolicyRejection(decision);
  }
  return decision;
}
