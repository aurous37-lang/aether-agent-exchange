import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireConsent } from '../middleware/consent';
import { validate } from '../middleware/validate';
import { auditLog } from '../services/audit';
import {
  BASE_MCP_ENDPOINT,
  BASE_MCP_PROVIDER_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_NETWORK,
  McpRequestAction,
  McpToolCategory,
} from '../services/mcpTypes';
import {
  buildLocalMcpToolDiscoverySnapshot,
  getBaseMcpProviderMetadata,
  mcpProviderService,
  normalizeMcpStatus,
  redactMcpPayload,
} from '../services/mcp';
import { validateMcpPolicy } from '../services/mcpPolicy';
import { recordConfirmedBaseMcpSettlementReceipt } from '../services/mcpSettlement';
import { SettlementError } from '../services/settlement';
import { AuthRequest } from '../types';
import {
  mcpBasePrepareRequestSchema,
  mcpBaseReceiptSchema,
  mcpBaseRequestParamsSchema,
} from '../utils/validation';

const router = Router();

type RequestState = 'PREPARED' | 'BLOCKED' | 'POLLING' | 'RECORDED' | 'FAILED';

interface RequestRecord {
  requestId: string;
  userId: string;
  walletAddress: string;
  jobId?: string;
  toolName: string;
  action: McpRequestAction;
  category: McpToolCategory;
  state: RequestState;
  allowed: boolean;
  reasons: string[];
  idempotencyKey: string;
  redactedReference: string;
  createdAt: string;
  updatedAt: string;
  statusPolledAt?: string;
  settlementLedgerId?: string;
  receipt?: Record<string, unknown>;
}

const requests = new Map<string, RequestRecord>();
const idempotencyIndex = new Map<string, string>();

function providerTool(name: string, category: McpToolCategory, description: string, readOnly: boolean) {
  return {
    name,
    title: name,
    description,
    category,
    status: category === 'write' || category === 'x402' ? 'blocked' as const : 'available' as const,
    readOnly,
    requiresWrite: category === 'write',
    requiresX402: category === 'x402',
    requiresMainnet: false,
    chain: {
      network: BASE_SEPOLIA_NETWORK,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nativeGasToken: 'ETH' as const,
      mainnet: false as const,
    },
    redactedReference: `mcp-tool:${name}`,
  };
}

function baseToolSnapshot() {
  return buildLocalMcpToolDiscoverySnapshot({
    tools: [
      providerTool('base.account.summary', 'read', 'Read-only Base Sepolia account summary', true),
      providerTool('base.contract.read', 'read', 'Read-only Base Sepolia contract call summary', true),
      providerTool('base.contract.write.prepare', 'write', 'Prepare a controlled Base Sepolia write approval request', false),
      providerTool('base.x402.quote.dry_run', 'x402', 'Redacted Base MCP x402 quote/status lifecycle', true),
    ],
  });
}

function actionToPolicyOperation(action: McpRequestAction, method?: string): 'discover' | 'read' | 'send' | 'send_calls' | 'swap' | 'sign' | 'x402' {
  if (action === 'discover') return 'discover';
  if (action === 'read') return 'read';
  if (action === 'x402') return 'x402';
  const normalized = (method || '').toLowerCase();
  if (normalized === 'send_calls' || normalized === 'swap' || normalized === 'sign') return normalized;
  return 'send';
}

function recordResponse(record: RequestRecord) {
  return {
    providerId: BASE_MCP_PROVIDER_ID,
    endpoint: BASE_MCP_ENDPOINT,
    requestId: record.requestId,
    toolName: record.toolName,
    action: record.action,
    category: record.category,
    state: record.state,
    status: record.allowed ? 'available' : 'blocked',
    activeChain: {
      network: BASE_SEPOLIA_NETWORK,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      nativeGasToken: 'ETH',
      mainnet: false,
    },
    flags: getBaseMcpProviderMetadata().featureFlags,
    allowed: record.allowed,
    reasons: record.reasons,
    nextAction: record.state === 'BLOCKED'
      ? 'resolve policy blockers before preparing provider execution'
      : record.state === 'PREPARED'
        ? 'poll request status before recording a sanitized receipt'
        : record.state === 'POLLING'
          ? 'submit a sanitized receipt after external approval/execution'
          : 'no further MCP action is pending',
    redactedReference: record.redactedReference,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    statusPolledAt: record.statusPolledAt,
    settlementLedgerId: record.settlementLedgerId,
    receipt: record.receipt,
  };
}

function requestIdParam(req: AuthRequest): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function assertOwner(req: AuthRequest, record: RequestRecord, res: Response): boolean {
  if (record.userId !== req.auth!.userId) {
    res.status(404).json({ error: 'MCP request not found' });
    return false;
  }
  return true;
}

router.get('/providers', async (_req, res): Promise<void> => {
  const metadata = getBaseMcpProviderMetadata();
  await mcpProviderService.recordProviderStatus(metadata.featureFlags.catalogReadEnabled ? 'available' : 'blocked', {
    endpoint: metadata.endpoint,
    rawSecretsStored: false,
  });
  res.json({
    providers: [{
      id: metadata.providerId,
      providerId: metadata.providerId,
      displayName: metadata.displayName,
      endpoint: metadata.endpoint,
      activeChain: metadata.activeChain,
      supportedChains: metadata.supportedChains,
      categories: metadata.categories,
      featureFlags: metadata.featureFlags,
      policy: metadata.policy,
      warnings: [
        'Base MCP pilot is Base Sepolia only.',
        'Write and x402 execution are disabled unless explicit operator flags are enabled.',
        'Raw signatures, payment headers, private keys, and PRXVT note material are never stored.',
      ],
    }],
  });
});

router.get('/base/tools', async (_req, res): Promise<void> => {
  const snapshot = baseToolSnapshot();
  await mcpProviderService.recordDiscoverySnapshot(snapshot);
  res.json(snapshot);
});

router.post('/base/requests/prepare', requireAuth, requireConsent, validate(mcpBasePrepareRequestSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as {
    providerId: 'base-mcp' | 'base';
    toolName: string;
    action: McpRequestAction;
    category?: McpToolCategory;
    network: string;
    chainId: number;
    method?: string;
    idempotencyKey?: string;
    jobId?: string;
    request?: unknown;
    params: Record<string, unknown>;
    metadata: Record<string, unknown>;
    x402Reference?: string;
  };

  const category = body.category || (body.action === 'discover' ? 'discovered' : body.action === 'read' ? 'read' : body.action === 'x402' ? 'x402' : 'write');
  const endpointForPolicy = category === 'write' || category === 'x402' ? BASE_MCP_ENDPOINT : undefined;
  const policy = validateMcpPolicy({
    tool: { name: body.toolName, category },
    category,
    operation: actionToPolicyOperation(body.action, body.method),
    execute: body.action === 'write' || body.action === 'x402',
    target: {
      endpoint: endpointForPolicy,
      network: body.network,
      chainId: body.chainId,
      address: typeof body.metadata.targetAddress === 'string' ? body.metadata.targetAddress : undefined,
      contractAddress: typeof body.metadata.contractAddress === 'string' ? body.metadata.contractAddress : undefined,
      method: body.method,
      summary: typeof body.metadata.summary === 'string' ? body.metadata.summary : undefined,
    },
    call: {
      kind: actionToPolicyOperation(body.action, body.method),
      endpoint: endpointForPolicy,
      network: body.network,
      chainId: body.chainId,
      to: typeof body.metadata.to === 'string' ? body.metadata.to : undefined,
      target: typeof body.metadata.target === 'string' ? body.metadata.target : undefined,
      fromToken: typeof body.metadata.fromToken === 'string' ? body.metadata.fromToken : undefined,
      toToken: typeof body.metadata.toToken === 'string' ? body.metadata.toToken : undefined,
      tokenSymbol: typeof body.metadata.tokenSymbol === 'string' ? body.metadata.tokenSymbol : undefined,
      amount: typeof body.metadata.amount === 'string' || typeof body.metadata.amount === 'number' ? body.metadata.amount : undefined,
      amountUsd: typeof body.metadata.amountUsd === 'string' || typeof body.metadata.amountUsd === 'number' ? body.metadata.amountUsd : undefined,
      method: body.method,
      summary: typeof body.metadata.summary === 'string' ? body.metadata.summary : undefined,
    },
  });

  const prepared = mcpProviderService.prepareRequest({
    providerId: body.providerId === 'base' ? BASE_MCP_PROVIDER_ID : body.providerId,
    toolName: body.toolName,
    action: body.action,
    category,
    chainId: body.chainId,
    network: body.network,
    method: body.method,
    idempotencyKey: body.idempotencyKey,
    actor: req.auth!.walletAddress,
    request: {
      request: body.request,
      params: body.params,
      metadata: body.metadata,
      policySummary: policy.sanitizedSummary,
    },
    x402Reference: body.x402Reference,
  });

  const idempotencyKey = prepared.idempotencyKey;
  const idempotencyScope = `${req.auth!.userId}:${idempotencyKey}`;
  const existingId = idempotencyIndex.get(idempotencyScope);
  if (existingId) {
    const existing = requests.get(existingId);
    if (existing) {
      res.json({ request: recordResponse(existing), idempotent: true });
      return;
    }
  }

  const now = new Date().toISOString();
  const allowed = policy.allowed && prepared.allowed;
  const record: RequestRecord = {
    requestId: prepared.requestId,
    userId: req.auth!.userId,
    walletAddress: req.auth!.walletAddress,
    jobId: body.jobId,
    toolName: body.toolName,
    action: body.action,
    category,
    state: allowed ? 'PREPARED' : 'BLOCKED',
    allowed,
    reasons: [...policy.errors.map(error => error.message), ...prepared.reasons],
    idempotencyKey,
    redactedReference: prepared.redactedReference,
    createdAt: now,
    updatedAt: now,
  };

  await mcpProviderService.recordPreparedRequest({
    ...prepared,
    allowed,
    state: record.state,
    status: normalizeMcpStatus(allowed ? 'available' : 'blocked'),
    reasons: record.reasons,
  }, {
    policyAllowed: policy.allowed,
    policyWarnings: policy.warnings,
    sanitizedSummary: policy.sanitizedSummary,
    rawPaymentHeadersStored: false,
    rawCalldataStored: false,
  }, req.auth!.walletAddress);

  requests.set(record.requestId, record);
  idempotencyIndex.set(idempotencyScope, record.requestId);

  auditLog(req.auth!.walletAddress, 'MCP_REQUEST_PREPARED', 'MCP_REQUEST', record.requestId, {
    providerId: BASE_MCP_PROVIDER_ID,
    toolName: record.toolName,
    action: record.action,
    category: record.category,
    state: record.state,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    network: BASE_SEPOLIA_NETWORK,
    rawCalldataStored: false,
    rawSignaturesStored: false,
    rawPaymentHeadersStored: false,
    prxvtNotesStored: false,
  });

  res.status(201).json({ request: recordResponse(record), idempotent: false });
});

router.get('/base/requests/:id/status', requireAuth, requireConsent, validate(mcpBaseRequestParamsSchema, 'params'), async (req: AuthRequest, res: Response): Promise<void> => {
  const record = requests.get(requestIdParam(req));
  if (!record) {
    res.status(404).json({ error: 'MCP request not found' });
    return;
  }
  if (!assertOwner(req, record, res)) return;

  if (record.state === 'PREPARED') {
    record.state = 'POLLING';
    record.statusPolledAt = new Date().toISOString();
    record.updatedAt = record.statusPolledAt;
  }
  await mcpProviderService.pollRequestState(record.requestId);

  auditLog(req.auth!.walletAddress, 'MCP_REQUEST_STATUS_POLLED', 'MCP_REQUEST', record.requestId, {
    providerId: BASE_MCP_PROVIDER_ID,
    toolName: record.toolName,
    state: record.state,
    allowed: record.allowed,
  });

  res.json({ request: recordResponse(record) });
});

router.post('/base/requests/:id/receipt', requireAuth, requireConsent, validate(mcpBaseRequestParamsSchema, 'params'), validate(mcpBaseReceiptSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  const record = requests.get(requestIdParam(req));
  if (!record) {
    res.status(404).json({ error: 'MCP request not found' });
    return;
  }
  if (!assertOwner(req, record, res)) return;

  const receipt = req.body as {
    status: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED';
    txHash?: string;
    receiptHash?: string;
    redactedReference?: string;
    redactedReferenceHash?: string;
    message?: string;
    errorCode?: string;
    metadata: Record<string, unknown>;
  };
  const positiveReceipt = receipt.status === 'SUBMITTED' || receipt.status === 'CONFIRMED';
  if (positiveReceipt && !record.allowed) {
    res.status(409).json({ error: 'MCP request is blocked by policy and cannot record an execution receipt' });
    return;
  }
  if (positiveReceipt && !record.statusPolledAt) {
    res.status(409).json({ error: 'MCP request status must be polled before recording an execution receipt' });
    return;
  }

  let settlementLedgerId: string | undefined;
  if (receipt.status === 'CONFIRMED' && record.jobId) {
    try {
      const ledger = await recordConfirmedBaseMcpSettlementReceipt(record.jobId, {
        ...redactMcpPayload(receipt.metadata) as Record<string, unknown>,
        jobId: record.jobId,
        status: 'confirmed',
        txHash: receipt.txHash,
        receiptHash: receipt.receiptHash,
        network: BASE_SEPOLIA_NETWORK,
        chainId: BASE_SEPOLIA_CHAIN_ID,
        method: record.category === 'x402' ? 'x402' : record.toolName.includes('send_calls') ? 'send_calls' : 'send',
      }, {
        walletAddress: req.auth!.walletAddress,
        endpoint: BASE_MCP_ENDPOINT,
      });
      settlementLedgerId = ledger.id;
    } catch (error: any) {
      res.status(error instanceof SettlementError ? error.statusCode : 400).json({ error: error.message || 'Base MCP settlement receipt rejected' });
      return;
    }
  }

  const now = new Date().toISOString();
  record.state = positiveReceipt ? 'RECORDED' : 'FAILED';
  record.allowed = record.allowed && positiveReceipt;
  record.updatedAt = now;
  record.settlementLedgerId = settlementLedgerId || record.settlementLedgerId;
  record.receipt = {
    status: receipt.status,
    txHash: receipt.txHash,
    receiptHash: receipt.receiptHash,
    redactedReference: receipt.redactedReference,
    redactedReferenceHash: receipt.redactedReferenceHash,
    message: receipt.message,
    errorCode: receipt.errorCode,
    metadataHash: receipt.metadata ? 'metadata-redacted-and-hashed-by-policy' : undefined,
    settlementLedgerId,
    recordedAt: now,
  };

  await mcpProviderService.recordReceiptReference({
    requestId: record.requestId,
    toolName: record.toolName,
    receiptRef: receipt.redactedReference || record.redactedReference,
    receiptType: record.category,
    status: receipt.status === 'CONFIRMED' ? 'SETTLED' : receipt.status,
    result: record.receipt,
    paymentReference: receipt.redactedReferenceHash || receipt.receiptHash,
  });

  auditLog(req.auth!.walletAddress, 'MCP_REQUEST_RECEIPT_RECORDED', 'MCP_REQUEST', record.requestId, {
    providerId: BASE_MCP_PROVIDER_ID,
    toolName: record.toolName,
    state: record.state,
    receiptStatus: receipt.status,
    txHash: receipt.txHash,
    receiptHash: receipt.receiptHash,
    redactedReferenceHash: receipt.redactedReferenceHash,
    settlementLedgerId,
    rawCalldataStored: false,
    rawSignaturesStored: false,
    rawPaymentHeadersStored: false,
    prxvtNotesStored: false,
  });

  res.json({ request: recordResponse(record) });
});

export default router;
