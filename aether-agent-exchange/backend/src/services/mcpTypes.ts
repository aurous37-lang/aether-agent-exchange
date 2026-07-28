export const BASE_MCP_PROVIDER_ID = 'base-mcp' as const;
export const BASE_MCP_ENDPOINT = 'https://mcp.base.org/' as const;
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const BASE_SEPOLIA_NETWORK = 'base-sepolia' as const;

export type McpProviderId = typeof BASE_MCP_PROVIDER_ID | string;
export type McpNetwork = typeof BASE_SEPOLIA_NETWORK;
export type McpToolCategory = 'discovered' | 'read' | 'write' | 'x402';
export type McpToolStatus = 'available' | 'degraded' | 'unavailable' | 'blocked' | 'unknown';
export type McpRequestAction = 'discover' | 'read' | 'write' | 'x402';
export type McpRequestState = 'PREPARED' | 'BLOCKED' | 'POLLING' | 'RECORDED' | 'FAILED';
export type McpSnapshotSource = 'local' | 'provider-catalog' | 'operator-import';

export interface McpChainContext {
  network: McpNetwork;
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  nativeGasToken: 'ETH';
  mainnet: false;
}

export interface McpFeatureFlags {
  catalogReadEnabled: boolean;
  liveDiscoveryEnabled: boolean;
  writesEnabled: boolean;
  x402ExecutionEnabled: boolean;
  mainnetEnabled: boolean;
}

export interface McpProviderMetadata {
  providerId: typeof BASE_MCP_PROVIDER_ID;
  displayName: string;
  endpoint: string;
  activeChain: McpChainContext;
  supportedChains: McpChainContext[];
  categories: McpToolCategory[];
  featureFlags: McpFeatureFlags;
  policy: {
    privateKeyHandling: 'disabled';
    automaticPaymentHeaders: 'disabled';
    rawPaymentHeaderStorage: 'disabled';
    rawSignatureStorage: 'disabled';
    liveExecution: 'disabled' | 'operator-flagged-prepare-only';
  };
}

export interface McpToolSummary {
  name: string;
  title?: string;
  description?: string;
  category: McpToolCategory;
  status: McpToolStatus;
  readOnly: boolean;
  requiresWrite: boolean;
  requiresX402: boolean;
  requiresMainnet: boolean;
  chain: McpChainContext;
  inputSchemaHash?: string;
  outputSchemaHash?: string;
  redactedReference?: string;
}

export interface McpToolDiscoverySnapshot {
  providerId: typeof BASE_MCP_PROVIDER_ID;
  endpoint: string;
  activeChain: McpChainContext;
  source: McpSnapshotSource;
  status: McpToolStatus;
  categories: Record<McpToolCategory, McpToolSummary[]>;
  tools: McpToolSummary[];
  counts: Record<McpToolCategory, number>;
  snapshotHash: string;
  discoveredAt: string;
  redaction: 'schemas-hashed-payment-material-omitted';
}

export interface McpPrepareRequestInput {
  providerId?: McpProviderId;
  toolName: string;
  action: McpRequestAction;
  category?: McpToolCategory;
  chainId?: number;
  network?: string;
  method?: string;
  idempotencyKey?: string;
  actor?: string;
  request?: unknown;
  headers?: Record<string, string | undefined>;
  x402Reference?: string;
}

export interface McpPreparedRequest {
  providerId: typeof BASE_MCP_PROVIDER_ID;
  endpoint: string;
  requestId: string;
  idempotencyKey: string;
  toolName: string;
  action: McpRequestAction;
  category: McpToolCategory;
  state: McpRequestState;
  status: McpToolStatus;
  activeChain: McpChainContext;
  flags: McpFeatureFlags;
  allowed: boolean;
  reasons: string[];
  nextAction: string;
  redactedRequest: Record<string, unknown>;
  redactedReference: string;
  x402Reference?: string;
  createdAt: string;
}

export interface McpProviderRequestRecord {
  requestId: string;
  providerId: typeof BASE_MCP_PROVIDER_ID;
  endpoint: string;
  toolName: string;
  action: McpRequestAction;
  category: McpToolCategory;
  state: McpRequestState;
  status: McpToolStatus;
  chainId: number;
  network: string;
  idempotencyKey: string;
  redactedReference: string;
  redactedRequest: Record<string, unknown>;
  redactedResponse?: Record<string, unknown>;
  x402Reference?: string;
  actor?: string;
}

export interface McpPersistenceResult {
  persisted: boolean;
  modelName: 'McpProvider' | 'McpToolCatalog' | 'McpSession' | 'McpApprovalRequest' | 'McpReceipt';
  recordId?: string;
  recordIds?: string[];
  reason?: string;
}
