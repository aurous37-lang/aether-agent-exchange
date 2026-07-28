const API_BASE = '/api';
const AUTH_EXPIRED_EVENT = 'aether-auth-expired';

function clearStoredAuth() {
  localStorage.removeItem('aether_token');
  localStorage.removeItem('aether_user');
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('aether_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers }, credentials: 'include' });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401) {
      clearStoredAuth();
      throw new Error('Session expired. Please reconnect your wallet.');
    }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ─── Auth ──────────────────────────────────────────────────────────

export async function getNonce(walletAddress: string) {
  return api.post<{ nonce: string; message: string }>('/auth/nonce', { walletAddress });
}

export async function verifySignature(walletAddress: string, message: string, signature: string) {
  return api.post<{
    token: string;
    user: { id: string; walletAddress: string; role: string; displayName: string | null; termsAccepted: boolean; policyVersion: string | null };
  }>('/auth/verify', { walletAddress, message, signature });
}

export async function acceptTerms() {
  return api.post<{ termsAccepted: boolean; policyVersion: string; acceptedAt: string }>('/auth/accept-terms');
}

export async function getConsentStatus() {
  return api.get<{
    termsAccepted: boolean;
    acceptedVersion: string | null;
    currentVersion: string;
    acceptedAt: string | null;
    needsReaccept: boolean;
    allAccepted?: boolean;
    missing?: string[];
  }>('/auth/consent-status');
}

export interface PlatformChainInfo {
  key: string;
  name: string;
  chainId: number;
  caip2Network?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorerUrl: string;
  settlementRails: string[];
  confirmationDepth?: number;
  reorgDepth?: number;
  rpcConfigured: boolean;
}

export interface PlatformInfo {
  policyVersion: string;
  platformFeeBps: number;
  platformFeePercent: string;
  supportedTokens: string[];
  network: PlatformChainInfo;
  chains?: PlatformChainInfo[];
  contractAddresses: {
    escrowFactory: string | null;
    nativeEscrowFactory?: string | null;
    erc8183Factory?: string | null;
    agentRegistry: string | null;
    feeCollector: string | null;
  };
  contractAddressesByChain?: Record<string, PlatformInfo['contractAddresses']>;
}

export async function getPlatformInfo() {
  return api.get<PlatformInfo>('/auth/platform-info');
}

export type StablecoinProviderStatus = 'enabled' | 'readiness' | 'disabled';

export interface StablecoinProviderCapability {
  providerId: 'direct-wallet' | 'visa-tap' | 'mastercard-ap4m' | 'x402' | string;
  adapterId: string;
  displayName: string;
  rail: string;
  status: StablecoinProviderStatus;
  enabled: boolean;
  readinessOnly: boolean;
  network: string;
  caip2Network: string;
  tokenSymbols: string[];
  merchantRegistrationReady: boolean;
  quoteGenerationReady: boolean;
  receiptNormalizationReady: boolean;
  settlementVerificationReady: boolean;
  redactionAuditReady: boolean;
  reasons: string[];
}

export interface SettlementProvidersResponse {
  providers: StablecoinProviderCapability[];
  policy: {
    allowedNetworks: string[];
    allowedTokens: string[];
    maxUsd: string;
    mainnetEnabled: boolean;
    x402: {
      sellerEnabled: boolean;
      buyerEnabled: boolean;
      facilitatorConfigured: boolean;
      automaticPaymentHeaders: false;
      rawPaymentHeaderStorage: false;
    };
  };
  storagePolicy: Record<string, unknown>;
}

export async function getSettlementProviders() {
  return api.get<SettlementProvidersResponse>('/settlement/providers');
}

export interface SpotPriceResponse {
  pair: string;
  base: string;
  currency: string;
  amount: string;
  fetchedAt: string;
  cached: boolean;
  source: string;
}

export async function getSpotPrice(pair: 'ETH-USD' | 'MON-USD' | 'USDC-USD') {
  return api.get<SpotPriceResponse>(`/market/spot/${pair}`);
}

export async function getEthUsdSpotPrice() {
  return getSpotPrice('ETH-USD');
}

// ─── Base MCP Rail ────────────────────────────────────────────────

export type McpProviderId = 'base-mcp' | string;
export type McpNetwork = 'base-sepolia';
export type McpToolCategory = 'discovered' | 'read' | 'write' | 'x402';
export type McpToolStatus = 'available' | 'degraded' | 'unavailable' | 'blocked' | 'unknown';
export type McpRequestAction = 'discover' | 'read' | 'write' | 'x402';
export type McpRequestState = 'NO_SESSION' | 'PREPARED' | 'BLOCKED' | 'POLLING' | 'RECORDED' | 'FAILED';
export type McpSnapshotSource = 'local' | 'provider-catalog' | 'operator-import';
export type McpApprovalStatus = 'no-session' | 'pending-approval' | 'approved' | 'failed' | 'receipt-confirmed';

export interface McpChainContext {
  network: McpNetwork;
  chainId: 84532;
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
  providerId: 'base-mcp';
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
  providerId: 'base-mcp';
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
  provider?: McpProviderMetadata;
  warnings?: string[];
}

export interface McpPreparedRequest {
  providerId: 'base-mcp';
  endpoint: string;
  requestId: string;
  idempotencyKey?: string;
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
  redactedRequest?: Record<string, unknown>;
  redactedReference: string;
  x402Reference?: string;
  createdAt: string;
}

export interface McpRequestRecord {
  requestId?: string;
  toolName?: string;
  action?: McpRequestAction | string;
  category?: McpToolCategory | string;
  state?: McpRequestState | string;
  status?: McpToolStatus | string;
  network?: string;
  chainId?: number;
  redactedReference?: string;
  redactedRequest?: Record<string, unknown> | string | null;
  redactedResponse?: Record<string, unknown> | string | null;
  x402Reference?: string | null;
  nextAction?: string | null;
}

export interface McpRequestPollResponse {
  requestId: string;
  state: McpRequestState;
  status?: McpToolStatus | string;
  record?: McpRequestRecord;
}

export interface McpReceiptSummary {
  requestId?: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED' | 'SETTLED' | 'QUOTED' | 'BLOCKED' | string;
  txHash?: string;
  receiptHash?: string;
  redactedReference?: string;
  redactedReferenceHash?: string;
  redactedReferenceType?: string;
  message?: string;
  errorCode?: string;
  createdAt?: string;
  settledAt?: string;
}

export interface BaseMcpStatusResponse {
  provider?: McpProviderMetadata;
  metadata?: McpProviderMetadata;
  providers?: McpProviderMetadata[];
  status?: McpToolStatus;
  snapshot?: McpToolDiscoverySnapshot;
  discovery?: McpToolDiscoverySnapshot;
  persisted?: boolean;
  reason?: string;
  warnings?: string[];
}

export const getBaseMcpStatus = async () => {
  const payload = await api.get<BaseMcpStatusResponse>('/mcp/providers');
  const provider = payload.provider || payload.metadata || payload.providers?.[0];
  return { ...payload, provider, metadata: provider };
};
export const getBaseMcpToolCatalog = () => api.get<McpToolDiscoverySnapshot>('/mcp/base/tools');
export const prepareBaseMcpRequest = async (data: {
  providerId?: McpProviderId;
  toolName: string;
  action?: McpRequestAction;
  category?: McpToolCategory;
  network?: 'base-sepolia';
  chainId?: 84532;
  method?: string;
  idempotencyKey?: string;
  jobId?: string;
  request?: unknown;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  x402Reference?: string;
}) => {
  const payload = await api.post<{ request: McpPreparedRequest; idempotent?: boolean }>('/mcp/base/requests/prepare', data);
  return payload.request;
};
export const getBaseMcpRequest = async (requestId: string) => {
  const payload = await api.get<{ request: McpPreparedRequest }>(`/mcp/base/requests/${encodeURIComponent(requestId)}/status`);
  return {
    requestId: payload.request.requestId,
    state: payload.request.state,
    status: payload.request.status,
    record: payload.request,
  } satisfies McpRequestPollResponse;
};
export const recordBaseMcpReceipt = async (requestId: string, data: {
  status: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'FAILED';
  txHash?: string;
  receiptHash?: string;
  redactedReference?: string;
  redactedReferenceHash?: string;
  message?: string;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}) => {
  const payload = await api.post<{ request: McpPreparedRequest & { receipt?: McpReceiptSummary } }>(`/mcp/base/requests/${encodeURIComponent(requestId)}/receipt`, data);
  return payload.request.receipt || { requestId, status: data.status };
};

// ─── Jobs ──────────────────────────────────────────────────────────

export interface IndexedChainEvent {
  id: string;
  chainKey: string;
  chainId: number;
  caip2Network: string;
  blockNumber: string;
  blockHash: string;
  transactionIndex?: number;
  txHash: string;
  logIndex: number;
  contractAddress: string;
  factoryAddress?: string;
  escrowAddress?: string;
  eventName: string;
  lifecycleType?: string;
  jobId?: string;
  onchainJobId?: string;
  actorAddress?: string;
  clientAddress?: string;
  agentAddress?: string;
  recipientAddress?: string;
  amountGross?: string;
  agentPayout?: string;
  platformFee?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  escrowContractVersion?: string;
  confirmations: number;
  finalityStatus: 'PENDING' | 'FINAL' | 'REORGED' | 'FAILED' | string;
  decodedArgs?: string;
  proofHash?: string;
  indexedAt: string;
  finalizedAt?: string;
  removedAt?: string;
}

export interface EscrowLifecycleState {
  id: string;
  jobId?: string;
  chainKey: string;
  chainId: number;
  caip2Network: string;
  escrowAddress: string;
  factoryAddress?: string;
  onchainJobId?: string;
  escrowContractVersion?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  amountGross?: string;
  agentPayout?: string;
  platformFee?: string;
  clientAddress?: string;
  agentAddress?: string;
  state: string;
  finalityStatus: 'PENDING' | 'FINAL' | 'REORGED' | 'FAILED' | string;
  confirmations: number;
  latestTxHash?: string;
  latestBlockNumber?: string;
  latestLogIndex?: number;
  createdOnchainAt?: string;
  fundedAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  disputedAt?: string;
  resolvedAt?: string;
  lastIndexedAt?: string;
}

export interface EscrowLifecycleEvidence {
  indexerSchemaReady: boolean;
  state: EscrowLifecycleState | null;
  events: IndexedChainEvent[];
  canonicalState:
    | 'UNFUNDED'
    | 'FUNDED_OPEN'
    | 'ACCEPTED_ONCHAIN'
    | 'DELIVERED_ONCHAIN'
    | 'RELEASED_ONCHAIN'
    | 'REFUNDED_ONCHAIN'
    | 'DISPUTED_ONCHAIN'
    | 'RESOLVED_ONCHAIN'
    | 'REORGED'
    | 'FAILED'
    | 'UNKNOWN';
  jobStatusProjection?: string;
  nextRequiredActor: 'client' | 'agent' | 'arbiter' | 'indexer' | 'none';
  nextAction:
    | 'FUND_ESCROW'
    | 'ACCEPT_BID_BACKEND'
    | 'START_WORK_ONCHAIN'
    | 'SUBMIT_DELIVERABLE_ONCHAIN'
    | 'WAIT_INDEXER'
    | 'APPROVE_RELEASE_ONCHAIN'
    | 'OPEN_DISPUTE_ONCHAIN'
    | 'RESOLVE_DISPUTE_ONCHAIN'
    | 'CLAIM_REFUND_ONCHAIN'
    | 'FINALIZED';
  actionAvailability: Record<string, { enabled: boolean; reason?: string }>;
  requiredConfirmations: number;
  currentConfirmations: number;
  finalityStatus: string;
  missingEvidence: string[];
}

export interface Job {
  id: string;
  title: string;
  description: string;
  category: string;
  deliverables: string[];
  acceptanceCriteria?: string;
  budgetAmount: number;
  budgetToken: string;
  deadline?: string;
  reviewPeriod: number;
  status: string;
  escrowAddress?: string;
  settlementRail: 'standard' | 'erc8183' | 'offchain' | 'x402' | 'px402' | 'px402-dry-run';
  network: string;
  chainId: number;
  tokenAddress?: string;
  onchainJobId?: string;
  escrowContractVersion: string;
  evaluatorWallet?: string;
  expiredAt?: string;
  settlementStatus: string;
  completedByEvaluatorAt?: string;
  clientId: string;
  agentId?: string;
  acceptedAt?: string;
  createdAt: string;
  client?: { id: string; displayName?: string; walletAddress: string };
  agent?: {
    id: string;
    agentId?: string;
    name: string;
    avatarUrl?: string;
    walletAddress?: string;
    capabilities?: string[];
    avgRating?: number;
    paymentPrivacyMode?: 'standard' | 'x402' | 'px402-preferred' | 'px402-required';
    px402Supported?: boolean;
    probeMethod?: 'GET' | 'POST';
    probePriceUsd?: string;
    probeDescription?: string;
  };
  bids?: Bid[];
  submissions?: Submission[];
  ratings?: Rating[];
  paymentLedger?: PaymentLedgerEntry[];
  baseMcp?: {
    provider?: McpProviderMetadata;
    status?: McpToolStatus | string;
    catalog?: McpToolDiscoverySnapshot;
    discovery?: McpToolDiscoverySnapshot;
    requests?: Array<McpPreparedRequest | McpRequestRecord>;
    approvalRequests?: Array<McpPreparedRequest | McpRequestRecord>;
    receipts?: McpReceiptSummary[];
  } | null;
  mcp?: {
    provider?: McpProviderMetadata;
    status?: McpToolStatus | string;
    catalog?: McpToolDiscoverySnapshot;
    discovery?: McpToolDiscoverySnapshot;
    requests?: Array<McpPreparedRequest | McpRequestRecord>;
    approvalRequests?: Array<McpPreparedRequest | McpRequestRecord>;
    receipts?: McpReceiptSummary[];
  } | null;
  mcpRequests?: Array<McpPreparedRequest | McpRequestRecord>;
  workspace?: ContractWorkspace | null;
  contractWorkspace?: ContractWorkspace | null;
  workspaceBinding?: ContractWorkspace | null;
  escrowLifecycle?: EscrowLifecycleEvidence;
  _count?: { bids: number; submissions: number };
}

export type WorkspaceProvider = 'github' | 'gitlawb';

export interface WorkspaceEvidenceSnapshot {
  ref?: string;
  url?: string;
  commitSha?: string;
  commitHash?: string;
  treeCid?: string;
  refCertificateCid?: string;
  createdAt?: string;
}

export interface WorkspaceProviderProfile {
  id: WorkspaceProvider;
  provider: WorkspaceProvider;
  label: string;
  summary: string;
  tradeoffs: string;
  liveEnabled: boolean;
  liveCredentialsConfigured: boolean;
  webhookSignatureConfigured: boolean;
  nodeReachabilityConfigured: boolean;
  delegationConfigured: boolean;
  verificationConfigured: boolean;
  publicNodeUrl?: string;
  nodeMetadata?: {
    name?: string;
    network?: string;
    version?: string;
    protocols?: string[];
    did?: string;
    p2pPeerId?: string;
    auth?: string;
    identity?: string;
  };
  nodeReachabilityError?: string;
  warnings?: string[];
}

export interface ContractWorkspace {
  id?: string;
  provider: WorkspaceProvider;
  status?: string;
  liveMode?: boolean;
  verificationStatus?: string;
  verificationState?: string;
  verificationSummary?: string;
  verifiedAt?: string;
  repoUrl?: string;
  repositoryUrl?: string;
  repoDid?: string;
  cloneUrl?: string;
  gitlawbCloneUrl?: string;
  nodeUrl?: string;
  owner?: string;
  name?: string;
  providerIdentity?: string;
  providerUser?: string;
  providerOrg?: string;
  actorDid?: string;
  signerDid?: string;
  branch?: string;
  branchRef?: string;
  pullRequestUrl?: string;
  prUrl?: string;
  pullRequestNumber?: number;
  prNumber?: number;
  pullRequestRef?: string;
  prRef?: string;
  commitSha?: string;
  commitHash?: string;
  treeCid?: string;
  refCertificateCid?: string;
  ucanDelegationRef?: string;
  reviewStatus?: string;
  ciStatus?: string;
  finalSnapshot?: string | WorkspaceEvidenceSnapshot | null;
  finalSnapshotUrl?: string;
  finalSnapshotRef?: string;
  signedEvidencePresent?: boolean;
  readiness?: {
    credentialsReady?: boolean;
    delegationReady?: boolean;
    nodeReady?: boolean;
    webhookReady?: boolean;
    verificationReady?: boolean;
  };
  provisioning?: {
    idempotencyKey?: string;
    attempts?: number;
    lastError?: string;
    liveMode?: boolean;
  };
  verificationResults?: Array<{
    id: string;
    status: string;
    failureReasons?: string[];
    deliverablePaths?: string[];
    checks?: Array<{ name: string; status: string; detail?: string; conclusion?: string }>;
    verifiedAt?: string;
  }>;
  evidenceSnapshots?: Array<{ id: string; evidenceHash: string; snapshotType: string; createdAt: string }>;
  events?: Array<{ id: string; eventType: string; providerEventId?: string; signatureVerified?: boolean; replayProtected?: boolean; createdAt?: string; ingestedAt?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentLedgerEntry {
  id: string;
  rail: string;
  mode?: string;
  amount: string;
  token?: string;
  tokenSymbol?: string;
  wallet?: string;
  walletAddress?: string;
  endpoint?: string;
  escrowAddress?: string;
  txHash?: string;
  receiptHash: string;
  chainId?: number;
  network?: string;
  status: string;
  redactedReference?: string;
  redactedReferenceHash?: string;
  redactedReferenceType?: string;
  redactedPaymentReference?: string;
  createdAt: string;
  settledAt?: string;
}

export interface Bid {
  id: string;
  amount: number;
  estimatedDuration: string;
  message?: string;
  createdAt: string;
  agentId: string;
  selected?: boolean;
  agent?: { id: string; name: string; avatarUrl?: string; avgRating?: number; trustScore?: number; autonomousAccept?: boolean };
}

export interface Submission {
  id: string;
  deliverableHash: string;
  notes?: string;
  createdAt: string;
}

export interface Rating {
  id: string;
  score: number;
  comment?: string;
  createdAt: string;
}

export interface AgentJobHistoryEntry {
  id: string;
  title: string;
  category: string;
  status?: string;
  budgetAmount: number;
  budgetToken: string;
  settlementRail?: string;
  settlementStatus?: string;
  network?: string;
  chainId?: number;
  createdAt: string;
  acceptedAt?: string;
  completedByEvaluatorAt?: string;
  workspace?: ContractWorkspace | null;
  paymentLedger?: PaymentLedgerEntry[];
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const getJobs = (params?: string) => api.get<JobsResponse>(`/jobs${params ? `?${params}` : ''}`);
export const getJob = (id: string) => api.get<Job>(`/jobs/${id}`);
export const createJob = (data: {
  title: string;
  description: string;
  category: string;
  deliverables: string[];
  budgetAmount: number;
  budgetToken: string;
  settlementRail?: 'standard' | 'erc8183' | 'offchain' | 'x402' | 'px402' | 'px402-dry-run';
  network?: string;
  chainId?: number;
  tokenAddress?: string;
  escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth';
  acceptanceCriteria?: string;
  deadline?: string;
  reviewPeriod?: number;
}) => api.post<Job>('/jobs', data);
export const updateJob = (id: string, data: Partial<Job>) => api.put<Job>(`/jobs/${id}`, data);
export const cancelJob = (id: string) => api.delete<Job>(`/jobs/${id}`);
export const acceptJob = (jobId: string, agentId: string, workspace?: {
  workspaceProvider?: WorkspaceProvider;
  workspaceNodeUrl?: string;
}) => api.post<Job>(`/jobs/${jobId}/accept`, { agentId, ...workspace });
export const getWorkspaceProviders = () => api.get<{ providers: WorkspaceProviderProfile[] }>('/workspaces/providers');
export const createWorkspace = (jobId: string, data: {
  provider: WorkspaceProvider;
  mode?: 'create' | 'link';
  nodeUrl?: string;
  participants?: Array<{ login?: string; permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'; role?: string }>;
}) => api.post<ContractWorkspace>(`/jobs/${jobId}/workspace`, { mode: 'create', ...data });
export const requestWorkspaceEvidenceSnapshot = (jobId: string, data: { snapshotType?: 'interim' | 'final'; verificationResultId?: string; evidence?: Record<string, unknown> }) =>
  api.post<{ id: string; evidenceHash: string; snapshotType: string; createdAt: string }>(`/jobs/${jobId}/workspace/evidence-snapshot`, data);
export const verifyWorkspaceSubmission = (jobId: string, data: {
  submissionRef: string;
  branchRef?: string;
  prRef?: string;
  prNumber?: number;
  commitSha?: string;
  treeCid?: string;
  refCertificateCid?: string;
  signerDid?: string;
  targetBranch?: string;
  repoOwner?: string;
  repoName?: string;
  repoDid?: string;
  nodeUrl?: string;
  deliverablePaths: string[];
  checks?: Array<{ name: string; status: 'passed' | 'failed' | 'skipped' | 'success' | 'failure'; detail?: string; conclusion?: string }>;
  evidence?: Record<string, unknown>;
}) => api.post(`/jobs/${jobId}/workspace/verify-submission`, data);
export const submitBid = (jobId: string, data: { agentId: string; amount: number; estimatedDuration: string; message?: string }) =>
  api.post<Bid>(`/jobs/${jobId}/bid`, data);
export const submitDeliverable = (jobId: string, data: { deliverableHash: string; notes?: string }) =>
  api.post<Submission>(`/jobs/${jobId}/submit`, data);
export const approveJob = (jobId: string, data?: { txHash?: string; receiptHash?: string; ledgerId?: string }) => api.post<Job>(`/jobs/${jobId}/approve`, data);
export interface SettlementReceiptVerificationProof {
  provider?: 'fixture';
  network: 'base' | 'base-sepolia' | 'ethereum' | 'ethereum-sepolia' | 'monad' | 'monad-testnet' | 'robinhood' | 'robinhood-testnet';
  chainId: number;
  txHash?: string;
  receiptHash?: string;
  status: string | number | boolean;
  finalityStatus?: 'PENDING' | 'FINAL';
  condition?: 'funding' | 'release' | 'payment';
  logs?: Array<{
    address?: string;
    eventName: 'EscrowFunded' | 'JobFunded' | 'Transfer' | 'JobApproved' | 'JobAutoReleased' | 'PaymentReleased' | 'DisputeResolved';
    args?: Record<string, unknown>;
    logIndex?: number;
  }>;
  contractState?: {
    address: string;
    state: string | number;
    escrowAmount?: string | number;
    balance?: string | number;
    nativeBalance?: string | number;
    paymentToken?: string;
    tokenAddress?: string;
    jobId?: string;
    contractVersion?: 'legacy' | 'erc8183' | 'native-eth';
  };
}

export const recordSettlementReceipt = (jobId: string, data: {
  receipt: string;
  rail: 'standard' | 'erc8183';
  amount: number;
  tokenSymbol?: 'USDC' | 'MON' | 'ETH';
  tokenAddress?: string;
  onchainJobId?: string;
  walletAddress?: string;
  endpoint?: string;
  escrowAddress: string;
  txHash: string;
  chainId: number;
  network: 'base' | 'base-sepolia' | 'ethereum' | 'ethereum-sepolia' | 'monad' | 'monad-testnet' | 'robinhood' | 'robinhood-testnet';
  status: 'SETTLED';
  redactedReference?: string;
  escrowContractVersion?: 'legacy' | 'erc8183' | 'native-eth';
  condition?: 'funding' | 'release' | 'payment';
  verificationProof?: SettlementReceiptVerificationProof;
}) => api.post<{ id: string; receiptHash: string; status: string; settlementStatus: string }>(`/jobs/${jobId}/settlement-receipts`, data);
export const disputeJob = (jobId: string, reason: string) => api.post(`/jobs/${jobId}/dispute`, { reason });
export const rateJob = (jobId: string, score: number, comment?: string) =>
  api.post<Rating>(`/jobs/${jobId}/rate`, { score, comment });

// ─── Agent Service Offers ────────────────────────────────────────

export type ServiceOfferStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ServiceOfferPricingUnit = 'fixed' | 'hourly' | 'daily' | 'milestone';

export interface ServiceOffer {
  id: string;
  agentId: string;
  title: string;
  description: string;
  category: string;
  deliverables: string[];
  startingPrice: number;
  priceToken: 'USDC' | 'MON' | 'ETH';
  pricingUnit: ServiceOfferPricingUnit;
  estimatedDelivery?: string;
  revisionPolicy?: string;
  status: ServiceOfferStatus;
  createdAt: string;
  updatedAt: string;
  agent?: Pick<Agent, 'id' | 'name' | 'avatarUrl' | 'walletAddress' | 'capabilities' | 'avgRating' | 'trustScore' | 'handlerId' | '_count'> & {
    handler?: { id: string; displayName?: string };
  };
}

export interface ServiceOffersResponse {
  offers: ServiceOffer[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const getServiceOffers = (params?: string) => api.get<ServiceOffersResponse>(`/service-offers${params ? `?${params}` : ''}`);
export const getMyServiceOffers = (params?: string) => api.get<ServiceOffersResponse>(`/service-offers/mine${params ? `?${params}` : ''}`);
export const createServiceOffer = (data: {
  agentId: string;
  title: string;
  description: string;
  category: string;
  deliverables: string[];
  startingPrice: number;
  priceToken: 'USDC' | 'MON' | 'ETH';
  pricingUnit?: ServiceOfferPricingUnit;
  estimatedDelivery?: string;
  revisionPolicy?: string;
  status?: 'ACTIVE' | 'PAUSED';
}) => api.post<ServiceOffer>('/service-offers', data);
export const updateServiceOffer = (id: string, data: Partial<ServiceOffer>) => api.put<ServiceOffer>(`/service-offers/${id}`, data);
export const requestServiceOffer = (id: string) => api.post<Job>(`/service-offers/${id}/request`);

// ─── Agents ────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  agentId: string;
  walletAddress: string;
  handlerId: string;
  name: string;
  description: string;
  capabilities: string[];
  models: string[];
  avatarUrl?: string;
  availability: string;
  responseTime: string;
  active: boolean;
  autonomousAccept: boolean;
  paymentPrivacyMode: 'standard' | 'x402' | 'px402-preferred' | 'px402-required';
  configDisclosureMode: 'public' | 'summary' | 'private';
  modelDisclosureMode: 'public' | 'private';
  apiCallDisclosureMode: 'summary' | 'hashes' | 'private';
  publicConfigSummary?: string;
  x402EndpointUrl?: string;
  px402Supported?: boolean;
  probePriceUsd?: string;
  probeDescription?: string;
  probeMethod?: 'GET' | 'POST';
  probeSchemaHash?: string;
  modelDetailsRedacted?: boolean;
  configDetailsRedacted?: boolean;
  avgRating: number;
  trustScore: number;
  createdAt: string;
  handler?: { id: string; displayName?: string };
  acceptedJobs?: AgentJobHistoryEntry[];
  ratings?: Rating[];
  _count?: { acceptedJobs: number; ratings: number };
}

export interface AgentsResponse {
  agents: Agent[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const getAgents = (params?: string) => api.get<AgentsResponse>(`/agents${params ? `?${params}` : ''}`);
export const getAgent = (id: string) => api.get<Agent>(`/agents/${id}`);
export const getAgentJobs = (id: string, params?: string) => api.get<{ jobs: AgentJobHistoryEntry[]; total: number; page: number; limit: number; pages: number }>(`/agents/${id}/jobs${params ? `?${params}` : ''}`);
export const deleteAgent = (id: string) => api.delete<{ success: boolean; message: string }>(`/agents/${id}`);
export const registerAgent = (data: {
  name: string;
  description: string;
  capabilities: string[];
  models: string[];
  metadataURI: string;
  agentWallet?: string;
  avatarUrl?: string;
  availability?: string;
  responseTime?: string;
  paymentPrivacyMode?: 'standard' | 'x402' | 'px402-preferred' | 'px402-required';
  configDisclosureMode?: 'public' | 'summary' | 'private';
  modelDisclosureMode?: 'public' | 'private';
  apiCallDisclosureMode?: 'summary' | 'hashes' | 'private';
  publicConfigSummary?: string;
  x402EndpointUrl?: string;
  px402Supported?: boolean;
  probePriceUsd?: string;
  probeDescription?: string;
  probeMethod?: 'GET' | 'POST';
  probeSchemaHash?: string;
}) => api.post<Agent>('/agents', data);

// ─── px402 Dry-Run Quotes ────────────────────────────────────────

export interface Px402DryRunQuote {
  timestamp: string;
  mode: 'dry-run';
  endpoint: string;
  endpointHash: string;
  method: 'GET' | 'POST' | 'HEAD';
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
  baseMcpStatus?: {
    state: 'blocked' | 'quoted';
    display: string;
    mcpStatus: 'blocked_by_policy' | 'dry_run_quote_available';
    nextAction: string;
  };
  redactedQuoteReference?: string;
  redactedReceiptReference?: string;
  redactedReceiptReferenceHash?: string;
}

export interface Px402DryRunResponse {
  ledgerId: string;
  jobId?: string;
  quote: Px402DryRunQuote;
  requirements: {
    endpoint: string;
    method: 'GET' | 'POST' | 'HEAD';
    status: number;
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
  };
  policy: {
    mode: 'dry-run';
    allowedNetworks: string[];
    maxProbeUsd: string;
    allowPlainX402Fallback: boolean;
  };
  executeDisabled: true;
  requiredApprovals: string[];
}

export const dryRunPx402Quote = (data: {
  agentId?: string;
  jobId?: string;
  url?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  paymentPrivacyMode?: 'x402' | 'px402-preferred' | 'px402-required';
}) => api.post<Px402DryRunResponse>('/px402/dry-run', data);

export interface Px402ProbeQuote {
  rail: 'px402-dry-run';
  endpoint: string;
  network: string;
  chainId: number;
  amount: number;
  tokenSymbol?: string;
  receiptHash: string;
  redactedReference: string;
}

export const probePx402Quote = (endpoint: string, method: 'GET' | 'HEAD' = 'GET') =>
  api.post<Px402ProbeQuote>('/px402/probe-quote', { endpoint, method });

// ─── Handler ───────────────────────────────────────────────────────

export interface DashboardData {
  agents: number;
  activeJobs: number;
  completedJobs: number;
  pendingReview: number;
  disputedJobs: number;
  totalEarnings: number;
  postedJobs: Array<Pick<Job, 'id' | 'title' | 'status' | 'budgetAmount' | 'budgetToken' | 'deadline' | 'createdAt' | 'acceptedAt' | 'agent' | 'settlementRail' | 'settlementStatus' | 'network' | 'chainId' | 'escrowAddress' | 'onchainJobId' | 'workspace' | 'paymentLedger'> & {
    selectedBid?: Bid | null;
    _count?: { bids: number; submissions: number };
  }>;
  serviceOffers: ServiceOffer[];
  notifications: Array<{ id: string; type: string; title: string; message: string; read: boolean; createdAt: string }>;
}

export const getHandlerDashboard = () => api.get<DashboardData>('/handler/dashboard');
export const getHandlerAgents = () => api.get<Agent[]>('/handler/agents');

// ─── Disputes ─────────────────────────────────────────────────────

export interface DisputeEvidence {
  id: string;
  disputeId: string;
  submittedBy: string;
  contentHash: string;
  description: string;
  createdAt: string;
}

export interface ArbiterVote {
  id: string;
  disputeId: string;
  arbiterWallet: string;
  agentBps: number;
  reasoning: string;
  createdAt: string;
}

export interface Dispute {
  id: string;
  jobId: string;
  reason: string;
  openedBy: string;
  status: string;
  resolution?: string;
  agentBps?: number;
  resolvedAt?: string;
  createdAt: string;
  job: Job & {
    client?: { id: string; displayName?: string; walletAddress: string };
    agent?: { id: string; name: string; walletAddress?: string };
    submissions?: Submission[];
  };
  evidence: DisputeEvidence[];
  votes: ArbiterVote[];
}

export const getDispute = (id: string) => api.get<Dispute>(`/disputes/${id}`);
export const submitEvidence = (disputeId: string, data: { contentHash: string; description: string }) =>
  api.post<DisputeEvidence>(`/disputes/${disputeId}/evidence`, data);

// ─── Agent Earnings ───────────────────────────────────────────────

export interface AgentEarnings {
  totalJobs: number;
  earnings: { USDC: number; MON: number; ETH: number };
  gross: { USDC: number; MON: number; ETH: number };
  platformFeeBps: number;
}

export const getAgentEarnings = (id: string) => api.get<AgentEarnings>(`/agents/${id}/earnings`);

// ─── Reports (content moderation) ────────────────────────────────

export type ReportReason = 'PROHIBITED_CONTENT' | 'FRAUD' | 'IP_VIOLATION' | 'PRIVACY_VIOLATION' | 'OTHER';

export const reportJob = (jobId: string, reason: ReportReason, description: string) =>
  api.post(`/reports/jobs/${jobId}/report`, { reason, description });
