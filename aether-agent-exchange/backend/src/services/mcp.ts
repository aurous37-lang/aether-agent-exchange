import crypto from 'crypto';
import prisma from '../lib/prisma';
import {
  BASE_MCP_ENDPOINT,
  BASE_MCP_PROVIDER_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK,
  McpChainContext,
  McpFeatureFlags,
  McpPersistenceResult,
  McpPrepareRequestInput,
  McpPreparedRequest,
  McpProviderMetadata,
  McpProviderRequestRecord,
  McpRequestAction,
  McpRequestState,
  McpSnapshotSource,
  McpToolCategory,
  McpToolDiscoverySnapshot,
  McpToolStatus,
  McpToolSummary,
} from './mcpTypes';

type JsonDelegate = {
  create(args: { data: Record<string, unknown> }): Promise<{ id?: string }>;
  upsert?(args: {
    where: Record<string, unknown>;
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  }): Promise<{ id?: string }>;
  findUnique?(args: { where: Record<string, unknown> }): Promise<unknown | null>;
};

type IntendedMcpPrisma = {
  mcpProvider?: JsonDelegate;
  mcpSession?: JsonDelegate;
  mcpToolCatalog?: JsonDelegate;
  mcpApprovalRequest?: JsonDelegate;
  mcpReceipt?: JsonDelegate;
};

const ACTIVE_CHAIN: McpChainContext = {
  network: BASE_SEPOLIA_NETWORK,
  chainId: BASE_SEPOLIA_CHAIN_ID,
  nativeGasToken: 'ETH',
  mainnet: false,
};

const CATEGORY_BY_ACTION: Record<McpRequestAction, McpToolCategory> = {
  discover: 'discovered',
  read: 'read',
  write: 'write',
  x402: 'x402',
};

const SENSITIVE_HEADER_PATTERNS = [
  /^authorization$/i,
  /^proxy-authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-api-key$/i,
  /^x-payment/i,
  /^payment/i,
  /^payment-signature$/i,
  /^signature$/i,
];

const SENSITIVE_KEY_PATTERNS = [
  /private.*key/i,
  /seed/i,
  /mnemonic/i,
  /secret/i,
  /api.*key/i,
  /access.*token/i,
  /refresh.*token/i,
  /authorization/i,
  /payment.*header/i,
  /x[-_]?payment/i,
  /wallet.*signature/i,
  /raw.*signature/i,
  /prxvt/i,
  /note.*material/i,
  /raw.*ucan/i,
  /ucan.*secret/i,
];

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function hashValue(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashString(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function shortHash(value: unknown): string {
  return hashValue(value).slice(0, 16);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function normalizeEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  return `${url.origin}${url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`}`;
}

function redactUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function hashUrl(value: string): string {
  return hashString(redactUrl(value));
}

function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER_PATTERNS.some(pattern => pattern.test(name));
}

function isSensitiveKey(name: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(name));
}

function redactString(value: string): string {
  if (/(Bearer\s+|X-PAYMENT|raw-(payment|signature|ucan|prxvt|private)|should-not-persist)/i.test(value)) {
    return '[REDACTED]';
  }
  return value.length > 500 ? `${value.slice(0, 500)}...[truncated]` : value;
}

export function redactMcpHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined) continue;
    output[key] = isSensitiveHeader(key) ? '[REDACTED]' : redactString(value);
  }
  return output;
}

export function redactMcpPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactMcpPayload);
  if (typeof value === 'string') return redactString(value);
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = redactMcpPayload(entry);
  }
  return output;
}

export function normalizeMcpStatus(value: unknown): McpToolStatus {
  const status = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '-');
  if (['ok', 'online', 'ready', 'available', 'healthy', 'success', 'succeeded'].includes(status)) {
    return 'available';
  }
  if (['degraded', 'partial', 'rate-limited', 'retry', 'pending', 'unknown-availability'].includes(status)) {
    return 'degraded';
  }
  if (['unavailable', 'offline', 'down', 'error', 'failed', 'timeout'].includes(status)) {
    return 'unavailable';
  }
  if (['blocked', 'disabled', 'forbidden', 'payment-required', 'x402-required', 'write-disabled'].includes(status)) {
    return 'blocked';
  }
  return 'unknown';
}

export function getMcpFeatureFlagsFromEnv(): McpFeatureFlags {
  return {
    catalogReadEnabled: envFlag('AAE_ENABLE_MCP_CATALOG_READ', true),
    liveDiscoveryEnabled: envFlag('AAE_ENABLE_MCP_LIVE_DISCOVERY', false),
    writesEnabled: envFlag('AAE_ENABLE_MCP_WRITES', false),
    x402ExecutionEnabled: envFlag('AAE_ENABLE_MCP_X402_EXECUTION', false),
    mainnetEnabled: envFlag('AAE_ENABLE_MCP_MAINNET', false),
  };
}

export function getBaseMcpProviderMetadata(flags = getMcpFeatureFlagsFromEnv()): McpProviderMetadata {
  return {
    providerId: BASE_MCP_PROVIDER_ID,
    displayName: 'Base MCP',
    endpoint: normalizeEndpoint(process.env.BASE_MCP_ENDPOINT || BASE_MCP_ENDPOINT),
    activeChain: ACTIVE_CHAIN,
    supportedChains: [ACTIVE_CHAIN],
    categories: ['discovered', 'read', 'write', 'x402'],
    featureFlags: flags,
    policy: {
      privateKeyHandling: 'disabled',
      automaticPaymentHeaders: 'disabled',
      rawPaymentHeaderStorage: 'disabled',
      rawSignatureStorage: 'disabled',
      liveExecution: flags.writesEnabled || flags.x402ExecutionEnabled
        ? 'operator-flagged-prepare-only'
        : 'disabled',
    },
  };
}

function summarizeProviderTool(raw: Record<string, unknown>, fallbackCategory: McpToolCategory): McpToolSummary {
  const annotations = raw.annotations && typeof raw.annotations === 'object'
    ? raw.annotations as Record<string, unknown>
    : {};
  const name = String(raw.name || raw.id || `unnamed-${shortHash(raw)}`);
  const requiresX402 = Boolean(raw.requiresX402 || raw.x402 || annotations.requiresX402);
  const readOnly = Boolean(raw.readOnlyHint ?? annotations.readOnlyHint ?? annotations.readOnly);
  const requiresWrite = Boolean(raw.requiresWrite || annotations.requiresWrite || (!readOnly && fallbackCategory === 'write'));
  const category = requiresX402 ? 'x402' : requiresWrite ? 'write' : readOnly ? 'read' : fallbackCategory;

  return {
    name,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 300) : undefined,
    category,
    status: normalizeMcpStatus(raw.status || 'available'),
    readOnly,
    requiresWrite,
    requiresX402,
    requiresMainnet: Boolean(raw.requiresMainnet || annotations.requiresMainnet),
    chain: ACTIVE_CHAIN,
    inputSchemaHash: raw.inputSchema ? shortHash(raw.inputSchema) : undefined,
    outputSchemaHash: raw.outputSchema ? shortHash(raw.outputSchema) : undefined,
    redactedReference: `mcp-tool:${name}:${shortHash({ name, category })}`,
  };
}

function emptyCategories(): Record<McpToolCategory, McpToolSummary[]> {
  return {
    discovered: [],
    read: [],
    write: [],
    x402: [],
  };
}

function buildSnapshotHash(input: {
  providerId: string;
  endpoint: string;
  source: McpSnapshotSource;
  tools: McpToolSummary[];
  discoveredAt: string;
}): string {
  return hashValue({
    providerId: input.providerId,
    endpoint: input.endpoint,
    source: input.source,
    tools: input.tools.map(tool => ({
      name: tool.name,
      category: tool.category,
      status: tool.status,
      inputSchemaHash: tool.inputSchemaHash,
      outputSchemaHash: tool.outputSchemaHash,
    })),
    discoveredAt: input.discoveredAt,
  });
}

export function buildLocalMcpToolDiscoverySnapshot(input: {
  metadata?: McpProviderMetadata;
  source?: McpSnapshotSource;
  tools?: Array<Record<string, unknown> | McpToolSummary>;
  status?: unknown;
  discoveredAt?: Date;
} = {}): McpToolDiscoverySnapshot {
  const metadata = input.metadata || getBaseMcpProviderMetadata();
  const discoveredAt = (input.discoveredAt || new Date()).toISOString();
  const tools = (input.tools || []).map(tool =>
    'category' in tool && 'chain' in tool
      ? tool as McpToolSummary
      : summarizeProviderTool(tool as Record<string, unknown>, 'discovered')
  );
  const categories = emptyCategories();
  for (const tool of tools) {
    categories.discovered.push({ ...tool, category: 'discovered' });
    categories[tool.category].push(tool);
  }
  const counts = {
    discovered: categories.discovered.length,
    read: categories.read.length,
    write: categories.write.length,
    x402: categories.x402.length,
  };
  const snapshotHash = buildSnapshotHash({
    providerId: metadata.providerId,
    endpoint: metadata.endpoint,
    source: input.source || 'local',
    tools,
    discoveredAt,
  });

  return {
    providerId: metadata.providerId,
    endpoint: metadata.endpoint,
    activeChain: metadata.activeChain,
    source: input.source || 'local',
    status: normalizeMcpStatus(input.status || (metadata.featureFlags.catalogReadEnabled ? 'available' : 'blocked')),
    categories,
    tools,
    counts,
    snapshotHash,
    discoveredAt,
    redaction: 'schemas-hashed-payment-material-omitted',
  };
}

function assertBaseProvider(providerId?: string): void {
  if (providerId && providerId !== BASE_MCP_PROVIDER_ID) {
    throw Object.assign(new Error('Unsupported MCP provider'), { statusCode: 400 });
  }
}

function assertBaseSepolia(input: { network?: string; chainId?: number }, flags: McpFeatureFlags): string[] {
  const reasons: string[] = [];
  if (input.network && input.network !== BASE_SEPOLIA_NETWORK) {
    reasons.push(`unsupported network: ${input.network}`);
  }
  if (input.chainId && input.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    reasons.push(`unsupported chainId: ${input.chainId}`);
  }
  if (!flags.mainnetEnabled && (input.network === 'base' || input.chainId === 8453)) {
    reasons.push('Base mainnet MCP access is disabled');
  }
  return reasons;
}

function validateNoPaymentOrSigningHeaders(headers?: Record<string, string | undefined>): void {
  for (const key of Object.keys(headers || {})) {
    if (isSensitiveHeader(key)) {
      throw Object.assign(new Error(`MCP request cannot include payment, signing, or authorization header: ${key}`), {
        statusCode: 400,
      });
    }
  }
}

function requestState(allowed: boolean): McpRequestState {
  return allowed ? 'PREPARED' : 'BLOCKED';
}

function intendedPrisma(): IntendedMcpPrisma {
  return prisma as unknown as IntendedMcpPrisma;
}

async function createRecord(
  modelName: McpPersistenceResult['modelName'],
  delegate: JsonDelegate | undefined,
  data: Record<string, unknown>,
): Promise<McpPersistenceResult> {
  if (!delegate) {
    return {
      persisted: false,
      modelName,
      reason: `${modelName} Prisma model is not available in the generated client yet`,
    };
  }
  const created = await delegate.create({ data });
  return { persisted: true, modelName, recordId: created.id };
}

async function ensureMcpProvider(metadata: McpProviderMetadata): Promise<{
  persisted: boolean;
  providerId?: string;
  result?: McpPersistenceResult;
}> {
  const delegate = intendedPrisma().mcpProvider;
  const capabilitySummary = safeJson({
    categories: metadata.categories,
    featureFlags: metadata.featureFlags,
    policy: metadata.policy,
    redaction: 'endpoint-query-omitted',
  });
  const data = {
    providerKey: metadata.providerId,
    displayName: metadata.displayName,
    status: metadata.featureFlags.catalogReadEnabled ? 'ACTIVE' : 'DISABLED',
    network: metadata.activeChain.network,
    chainId: metadata.activeChain.chainId,
    endpointRef: redactUrl(metadata.endpoint),
    endpointHash: hashUrl(metadata.endpoint),
    capabilitySummary,
  };

  if (!delegate) {
    return {
      persisted: false,
      result: {
        persisted: false,
        modelName: 'McpProvider',
        reason: 'McpProvider Prisma model is not available in the generated client yet',
      },
    };
  }
  if (delegate.upsert) {
    const provider = await delegate.upsert({
      where: { providerKey: metadata.providerId },
      update: data,
      create: data,
    }) as { id?: string };
    return { persisted: true, providerId: provider.id };
  }
  const provider = await delegate.create({ data }) as { id?: string };
  return { persisted: true, providerId: provider.id };
}

export class McpProviderService {
  getProviderMetadata(): McpProviderMetadata {
    return getBaseMcpProviderMetadata();
  }

  getLocalDiscoverySnapshot(): McpToolDiscoverySnapshot {
    return buildLocalMcpToolDiscoverySnapshot({ metadata: this.getProviderMetadata() });
  }

  prepareRequest(input: McpPrepareRequestInput): McpPreparedRequest {
    assertBaseProvider(input.providerId);
    validateNoPaymentOrSigningHeaders(input.headers);

    const flags = getMcpFeatureFlagsFromEnv();
    const metadata = getBaseMcpProviderMetadata(flags);
    const category = input.category || CATEGORY_BY_ACTION[input.action];
    const reasons = assertBaseSepolia({ network: input.network, chainId: input.chainId }, flags);

    if (!flags.catalogReadEnabled && (input.action === 'discover' || input.action === 'read')) {
      reasons.push('MCP catalog/read access is disabled');
    }
    if ((input.action === 'write' || category === 'write') && !flags.writesEnabled) {
      reasons.push('MCP write preparation is disabled');
    }
    if ((input.action === 'x402' || category === 'x402') && !flags.x402ExecutionEnabled) {
      reasons.push('MCP x402 execution is disabled');
    }

    const allowed = reasons.length === 0;
    const redactedRequest = {
      method: input.method || input.action,
      headers: redactMcpHeaders(input.headers),
      body: redactMcpPayload(input.request),
      rawPaymentHeadersStored: false,
      privateKeyHandling: 'disabled',
      automaticPaymentHeaders: false,
    };
    const idempotencyKey = input.idempotencyKey || `mcp:${input.toolName}:${shortHash(redactedRequest)}`;
    const requestId = `mcp_req_${shortHash({
      providerId: metadata.providerId,
      endpoint: metadata.endpoint,
      toolName: input.toolName,
      action: input.action,
      category,
      idempotencyKey,
      redactedRequest,
    })}`;

    return {
      providerId: metadata.providerId,
      endpoint: metadata.endpoint,
      requestId,
      idempotencyKey,
      toolName: input.toolName,
      action: input.action,
      category,
      state: requestState(allowed),
      status: allowed ? 'available' : 'blocked',
      activeChain: metadata.activeChain,
      flags,
      allowed,
      reasons,
      nextAction: allowed
        ? 'record prepared request state; operator-controlled execution remains external'
        : 'resolve policy blockers before preparing provider execution',
      redactedRequest,
      redactedReference: `mcp:${metadata.providerId}:${requestId}`,
      x402Reference: input.x402Reference ? String(redactMcpPayload(input.x402Reference)) : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  async recordProviderStatus(status: unknown, details: Record<string, unknown> = {}): Promise<McpPersistenceResult> {
    const metadata = this.getProviderMetadata();
    const result = await ensureMcpProvider({
      ...metadata,
      featureFlags: {
        ...metadata.featureFlags,
        catalogReadEnabled: normalizeMcpStatus(status) !== 'blocked',
      },
    });
    if (result.result) return result.result;
    return {
      persisted: true,
      modelName: 'McpProvider',
      recordId: result.providerId,
      reason: safeJson(redactMcpPayload(details)),
    };
  }

  async recordDiscoverySnapshot(snapshot = this.getLocalDiscoverySnapshot()): Promise<McpPersistenceResult> {
    const providerResult = await ensureMcpProvider(this.getProviderMetadata());
    if (!providerResult.persisted || !providerResult.providerId) {
      return providerResult.result || {
        persisted: false,
        modelName: 'McpToolCatalog',
        reason: 'McpProvider could not be created before recording tool catalog',
      };
    }

    const delegate = intendedPrisma().mcpToolCatalog;
    if (!delegate) {
      return {
        persisted: false,
        modelName: 'McpToolCatalog',
        reason: 'McpToolCatalog Prisma model is not available in the generated client yet',
      };
    }

    const recordIds: string[] = [];
    for (const tool of snapshot.tools) {
      const schemaHash = hashValue({
        inputSchemaHash: tool.inputSchemaHash,
        outputSchemaHash: tool.outputSchemaHash,
        category: tool.category,
      });
      const data = {
        providerId: providerResult.providerId,
        toolName: tool.name,
        toolVersion: 'default',
        status: tool.status === 'available' ? 'ACTIVE' : tool.status.toUpperCase(),
        schemaHash,
        capabilitySummary: safeJson(redactMcpPayload({
          title: tool.title,
          description: tool.description,
          category: tool.category,
          readOnly: tool.readOnly,
          requiresWrite: tool.requiresWrite,
          requiresX402: tool.requiresX402,
          requiresMainnet: tool.requiresMainnet,
          chain: tool.chain,
          redactedReference: tool.redactedReference,
          snapshotHash: snapshot.snapshotHash,
          source: snapshot.source,
          redaction: snapshot.redaction,
        })),
        calldataSummary: safeJson({
          persistedRawCalldata: false,
          persistedRawSchemas: false,
          inputSchemaHash: tool.inputSchemaHash,
          outputSchemaHash: tool.outputSchemaHash,
        }),
        lastSeenAt: new Date(snapshot.discoveredAt),
      };
      if (delegate.upsert) {
        const record = await delegate.upsert({
          where: {
            providerId_toolName_toolVersion: {
              providerId: providerResult.providerId,
              toolName: tool.name,
              toolVersion: 'default',
            },
          },
          update: data,
          create: data,
        });
        if (record.id) recordIds.push(record.id);
      } else {
        const record = await delegate.create({ data });
        if (record.id) recordIds.push(record.id);
      }
    }

    return {
      persisted: true,
      modelName: 'McpToolCatalog',
      recordIds,
      reason: snapshot.tools.length === 0 ? 'No tools in local snapshot; provider metadata only' : undefined,
    };
  }

  async recordPreparedRequest(
    prepared: McpPreparedRequest,
    response?: Record<string, unknown>,
    actor?: string,
  ): Promise<McpPersistenceResult> {
    const record: McpProviderRequestRecord = {
      requestId: prepared.requestId,
      providerId: prepared.providerId,
      endpoint: prepared.endpoint,
      toolName: prepared.toolName,
      action: prepared.action,
      category: prepared.category,
      state: response ? 'RECORDED' : prepared.state,
      status: response ? normalizeMcpStatus(response.status || prepared.status) : prepared.status,
      chainId: prepared.activeChain.chainId,
      network: prepared.activeChain.network,
      idempotencyKey: prepared.idempotencyKey,
      redactedReference: prepared.redactedReference,
      redactedRequest: prepared.redactedRequest,
      redactedResponse: response ? redactMcpPayload(response) as Record<string, unknown> : undefined,
      x402Reference: prepared.x402Reference,
      actor,
    };
    const providerResult = await ensureMcpProvider(this.getProviderMetadata());
    if (!providerResult.persisted || !providerResult.providerId) {
      return providerResult.result || {
        persisted: false,
        modelName: 'McpSession',
        reason: 'McpProvider could not be created before recording request state',
      };
    }

    const sessionData = {
      providerId: providerResult.providerId,
      sessionRef: record.redactedReference,
      sessionHash: hashValue({
        requestId: record.requestId,
        idempotencyKey: record.idempotencyKey,
        redactedRequest: record.redactedRequest,
      }),
      requestId: record.requestId,
      status: record.state,
      chainId: record.chainId,
      network: record.network,
      scopeSummary: safeJson(redactMcpPayload({
        toolName: record.toolName,
        action: record.action,
        category: record.category,
        status: record.status,
        allowed: prepared.allowed,
        reasons: prepared.reasons,
        redactedRequest: record.redactedRequest,
        redactedResponse: record.redactedResponse,
        x402ReferenceHash: record.x402Reference ? hashString(record.x402Reference) : undefined,
        actor,
      })),
      startedAt: new Date(prepared.createdAt),
    };
    const sessionDelegate = intendedPrisma().mcpSession;
    if (!sessionDelegate) {
      return {
        persisted: false,
        modelName: 'McpSession',
        reason: 'McpSession Prisma model is not available in the generated client yet',
      };
    }

    const session = sessionDelegate.upsert
      ? await sessionDelegate.upsert({
        where: {
          providerId_requestId: {
            providerId: providerResult.providerId,
            requestId: record.requestId,
          },
        },
        update: sessionData,
        create: sessionData,
      })
      : await sessionDelegate.create({ data: sessionData });

    if (record.category !== 'write' && record.category !== 'x402') {
      return { persisted: true, modelName: 'McpSession', recordId: session.id };
    }

    const approvalDelegate = intendedPrisma().mcpApprovalRequest;
    if (!approvalDelegate) {
      return {
        persisted: true,
        modelName: 'McpSession',
        recordId: session.id,
        reason: 'McpApprovalRequest Prisma model is not available in the generated client yet',
      };
    }
    const approvalData = {
      providerId: providerResult.providerId,
      sessionId: session.id,
      requestId: record.requestId,
      status: record.state === 'BLOCKED' ? 'BLOCKED' : 'PENDING',
      chainId: record.chainId,
      network: record.network,
      toolName: record.toolName,
      callTargetRef: redactUrl(record.endpoint),
      calldataSummary: safeJson(redactMcpPayload({
        action: record.action,
        category: record.category,
        redactedRequest: record.redactedRequest,
        rawCalldataStored: false,
      })),
      valueSummary: safeJson({
        x402ReferenceHash: record.x402Reference ? hashString(record.x402Reference) : undefined,
        automaticPaymentHeaders: false,
        privateKeyHandling: 'disabled',
      }),
      requestedAt: new Date(prepared.createdAt),
    };
    const approval = approvalDelegate.upsert
      ? await approvalDelegate.upsert({
        where: {
          providerId_requestId: {
            providerId: providerResult.providerId,
            requestId: record.requestId,
          },
        },
        update: approvalData,
        create: approvalData,
      })
      : await approvalDelegate.create({ data: approvalData });

    return {
      persisted: true,
      modelName: 'McpApprovalRequest',
      recordId: approval.id,
      recordIds: [session.id, approval.id].filter((id): id is string => Boolean(id)),
    };
  }

  async recordReceiptReference(input: {
    requestId?: string;
    toolName?: string;
    receiptRef?: string;
    receiptType?: string;
    status?: string;
    result?: Record<string, unknown>;
    paymentReference?: string;
  }): Promise<McpPersistenceResult> {
    const metadata = this.getProviderMetadata();
    const providerResult = await ensureMcpProvider(metadata);
    if (!providerResult.persisted || !providerResult.providerId) {
      return providerResult.result || {
        persisted: false,
        modelName: 'McpReceipt',
        reason: 'McpProvider could not be created before recording receipt reference',
      };
    }

    const delegate = intendedPrisma().mcpReceipt;
    const receiptRef = input.receiptRef || `mcp:${metadata.providerId}:${input.requestId || shortHash(input)}`;
    const data = {
      providerId: providerResult.providerId,
      requestId: input.requestId,
      receiptRef: String(redactMcpPayload(receiptRef)),
      receiptHash: hashString(receiptRef),
      receiptType: input.receiptType || 'tool',
      status: input.status || 'PENDING',
      chainId: metadata.activeChain.chainId,
      network: metadata.activeChain.network,
      toolName: input.toolName,
      resultSummary: input.result ? safeJson(redactMcpPayload(input.result)) : undefined,
      paymentReferenceHash: input.paymentReference ? hashString(input.paymentReference) : undefined,
      observedAt: new Date(),
    };
    if (delegate?.upsert) {
      const receipt = await delegate.upsert({
        where: { receiptHash: data.receiptHash },
        update: data,
        create: data,
      });
      return { persisted: true, modelName: 'McpReceipt', recordId: receipt.id };
    }
    return createRecord('McpReceipt', delegate, data);
  }

  async pollRequestState(requestId: string): Promise<{ requestId: string; state: McpRequestState; record?: unknown }> {
    const providerDelegate = intendedPrisma().mcpProvider;
    const sessionDelegate = intendedPrisma().mcpSession;
    if (!providerDelegate?.findUnique || !sessionDelegate?.findUnique) {
      return { requestId, state: 'POLLING' };
    }
    const provider = await providerDelegate.findUnique({ where: { providerKey: BASE_MCP_PROVIDER_ID } }) as { id?: string } | null;
    if (!provider?.id) return { requestId, state: 'POLLING' };
    const record = await sessionDelegate.findUnique({
      where: { providerId_requestId: { providerId: provider.id, requestId } },
    });
    return {
      requestId,
      state: record ? 'RECORDED' : 'POLLING',
      record: record ? redactMcpPayload(record) : undefined,
    };
  }
}

export const mcpProviderService = new McpProviderService();
