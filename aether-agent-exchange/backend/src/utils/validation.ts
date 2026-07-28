import { z } from 'zod';

export const ethereumAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
export const bytes32Hex = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid bytes32 hex value');
const settlementRailSchema = z.enum(['standard', 'erc8183', 'offchain', 'x402', 'px402', 'px402-dry-run']);
const chainNetworkSchema = z.enum(['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia', 'monad', 'monad-testnet', 'robinhood', 'robinhood-testnet']);
const x402NetworkSchema = z.enum(['base', 'base-sepolia', 'monad']);
const x402ChainIdSchema = z.union([z.literal(8453), z.literal(84532), z.literal(143)]);
const x402Caip2NetworkSchema = z.enum(['eip155:8453', 'eip155:84532', 'eip155:143']);
const chainIdSchema = z.union([
  z.literal(1),
  z.literal(8453),
  z.literal(84532),
  z.literal(11155111),
  z.literal(143),
  z.literal(10143),
  z.literal(4663),
  z.literal(46630),
]);
const dateTimeOrDateSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.000Z`;
  return value;
}, z.string().datetime());

export const createJobSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  category: z.enum([
    'CODE_DEVELOPMENT', 'CONTENT_WRITING', 'DATA_ANALYSIS',
    'DESIGN_CREATIVE', 'RESEARCH', 'BLOCKCHAIN_WEB3',
    'SYSTEM_ARCHITECTURE', 'AUTOMATION', 'TESTING_QA', 'MICRO_TASKS'
  ]),
  deliverables: z.array(z.string().min(1).max(500)).min(1).max(20),
  acceptanceCriteria: z.string().max(5000).optional(),
  budgetAmount: z.number().positive().max(1_000_000),
  budgetToken: z.enum(['USDC', 'MON', 'ETH']),
  suggestedMin: z.number().positive().optional(),
  suggestedMax: z.number().positive().optional(),
  deadline: dateTimeOrDateSchema.optional(),
  reviewPeriod: z.number().int().min(86400).max(2592000).default(604800),
  escrowAddress: ethereumAddress.optional(),
  settlementRail: settlementRailSchema.default('offchain'),
  network: chainNetworkSchema.optional(),
  chainId: z.number().int().positive().optional(),
  tokenAddress: ethereumAddress.optional(),
  onchainJobId: bytes32Hex.optional(),
  escrowContractVersion: z.enum(['legacy', 'erc8183', 'native-eth']).default('legacy'),
  evaluatorWallet: ethereumAddress.optional(),
  expiredAt: dateTimeOrDateSchema.optional(),
  workspaceProvider: z.enum(['github', 'gitlawb']).default('github'),
});

export const updateJobSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(10000).optional(),
  deliverables: z.array(z.string().min(1).max(500)).min(1).max(20).optional(),
  acceptanceCriteria: z.string().max(5000).optional(),
  deadline: dateTimeOrDateSchema.optional(),
  escrowAddress: ethereumAddress.optional(),
  settlementRail: settlementRailSchema.optional(),
  network: chainNetworkSchema.optional(),
  chainId: z.number().int().positive().optional(),
  tokenAddress: ethereumAddress.optional(),
  onchainJobId: bytes32Hex.optional(),
  escrowContractVersion: z.enum(['legacy', 'erc8183', 'native-eth']).optional(),
  workspaceProvider: z.enum(['github', 'gitlawb']).optional(),
});

export const bidSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  estimatedDuration: z.string().min(1).max(100),
  message: z.string().max(2000).optional(),
});

const serviceOfferCategorySchema = z.enum([
  'CODE_DEVELOPMENT', 'CONTENT_WRITING', 'DATA_ANALYSIS',
  'DESIGN_CREATIVE', 'RESEARCH', 'BLOCKCHAIN_WEB3',
  'SYSTEM_ARCHITECTURE', 'AUTOMATION', 'TESTING_QA', 'MICRO_TASKS'
]);

export const createServiceOfferSchema = z.object({
  agentId: z.string().min(1).max(120),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: serviceOfferCategorySchema,
  deliverables: z.array(z.string().min(1).max(500)).min(1).max(20),
  startingPrice: z.number().positive().max(1_000_000),
  priceToken: z.enum(['USDC', 'MON', 'ETH']),
  pricingUnit: z.enum(['fixed', 'hourly', 'daily', 'milestone']).default('fixed'),
  estimatedDelivery: z.string().max(100).optional(),
  revisionPolicy: z.string().max(1000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).default('ACTIVE'),
});

export const updateServiceOfferSchema = createServiceOfferSchema.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
});

export const registerAgentSchema = z.object({
  agentWallet: ethereumAddress.optional(), // omit for self-register
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  capabilities: z.array(z.string().min(1).max(50)).min(1).max(30),
  models: z.array(z.string().min(1).max(100)).default([]),
  metadataURI: z.string().min(1).max(500),
  avatarUrl: z.string().url().optional(),
  availability: z.string().max(50).default('24/7'),
  responseTime: z.string().max(50).default('< 5 minutes'),
  paymentPrivacyMode: z.enum(['standard', 'x402', 'px402-preferred', 'px402-required']).default('standard'),
  configDisclosureMode: z.enum(['public', 'summary', 'private']).default('summary'),
  modelDisclosureMode: z.enum(['public', 'private']).default('public'),
  apiCallDisclosureMode: z.enum(['summary', 'hashes', 'private']).default('summary'),
  publicConfigSummary: z.string().max(1000).optional(),
  x402EndpointUrl: z.string().url().optional(),
  px402Supported: z.boolean().default(false),
  probePriceUsd: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  probeDescription: z.string().max(1000).optional(),
  probeMethod: z.enum(['GET', 'POST']).default('GET'),
  probeSchemaHash: z.string().max(200).optional(),
});

export const px402DryRunSchema = z.object({
  agentId: z.string().min(1).optional(),
  jobId: z.string().min(1).max(120).optional(),
  url: z.string().url().optional(),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  paymentPrivacyMode: z.enum(['x402', 'px402-preferred', 'px402-required']).optional(),
}).refine(data => Boolean(data.url || data.agentId || data.jobId), {
  message: 'Either url, agentId, or jobId is required',
  path: ['url'],
});

export const x402SettlementReceiptSchema = z.object({
  jobId: z.string().min(1).max(120),
  rail: z.enum(['x402', 'px402']),
  network: x402NetworkSchema,
  chainId: x402ChainIdSchema,
  caip2Network: x402Caip2NetworkSchema.optional(),
  amount: z.union([
    z.number().positive().max(1_000_000),
    z.string().regex(/^\d+(\.\d{1,18})?$/, 'Payment amount must be a positive decimal').refine(value => Number(value) > 0 && Number(value) <= 1_000_000, 'Payment amount out of range'),
  ]),
  tokenSymbol: z.literal('USDC'),
  payerWallet: ethereumAddress.optional(),
  payeeWallet: ethereumAddress.optional(),
  endpoint: z.string().url().optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid tx hash').optional(),
  receiptHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid receipt hash').optional(),
  facilitatorReference: z.string().min(1).max(500).optional(),
  facilitatorReferenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid facilitator reference hash').optional(),
  receipt: z.string().min(1).max(5000),
  status: z.literal('SETTLED').default('SETTLED'),
  providerPayload: z.unknown().optional(),
}).strict();

export const x402SellerResourceParamsSchema = z.object({
  resourceId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9:._-]+$/, 'Invalid x402 resource id'),
});

export const x402BuyerIntentSchema = z.object({
  endpoint: z.string().url(),
  method: z.enum(['GET', 'POST', 'HEAD']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  approved: z.boolean().default(false),
  jobId: z.string().min(1).max(120).optional(),
}).strict();

const mcpSensitiveFieldPattern = /(^data$|^input$|call[-_]?data|raw[-_]?calldata|signature|raw[-_]?signature|signed[-_]?message|payment[-_]?header|x[-_]?payment|x402[-_]?payment[-_]?header|prxvt[-_]?note|private[-_]?key|seed[-_]?phrase|mnemonic|raw[-_]?transaction|serialized[-_]?transaction|authorization|cookie)/i;
const mcpLongHexPattern = /^0x[a-fA-F0-9]{128,}$/;

function findMcpSensitiveMaterial(value: unknown, path: string[] = []): string[] | null {
  if (typeof value === 'string') {
    return mcpLongHexPattern.test(value) ? path : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findMcpSensitiveMaterial(value[index], [...path, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const keyPath = [...path, key];
      if (mcpSensitiveFieldPattern.test(key)) return keyPath;
      const found = findMcpSensitiveMaterial(nested, keyPath);
      if (found) return found;
    }
  }
  return null;
}

const mcpSafePayload = z.unknown().superRefine((value, ctx) => {
  const sensitivePath = findMcpSensitiveMaterial(value);
  if (sensitivePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: sensitivePath,
      message: 'Raw calldata, signatures, payment headers, PRXVT notes, and key material are not accepted',
    });
  }
});

const mcpSafeRecord = z.record(z.unknown()).superRefine((value, ctx) => {
  const sensitivePath = findMcpSensitiveMaterial(value);
  if (sensitivePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: sensitivePath,
      message: 'Raw calldata, signatures, payment headers, PRXVT notes, and key material are not accepted',
    });
  }
});

const settlementProofArgs = z.record(z.unknown()).superRefine((value, ctx) => {
  const sensitivePath = findMcpSensitiveMaterial(value);
  if (sensitivePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: sensitivePath,
      message: 'Raw calldata, signatures, payment headers, PRXVT notes, and key material are not accepted',
    });
  }
});

const settlementVerificationProofSchema = z.object({
  provider: z.literal('fixture').default('fixture'),
  network: chainNetworkSchema,
  chainId: chainIdSchema,
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid tx hash').optional(),
  receiptHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid receipt hash').optional(),
  status: z.union([z.literal('success'), z.literal('succeeded'), z.literal('confirmed'), z.literal('settled'), z.literal('1'), z.literal('0x1'), z.literal('failed'), z.literal('0'), z.literal('0x0'), z.number(), z.boolean()]),
  to: ethereumAddress.optional(),
  from: ethereumAddress.optional(),
  value: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  blockNumber: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
  confirmations: z.number().int().nonnegative().optional(),
  finalityStatus: z.enum(['PENDING', 'FINAL']).optional(),
  condition: z.enum(['funding', 'release', 'payment']).default('release'),
  logs: z.array(z.object({
    address: ethereumAddress.optional(),
    eventName: z.enum([
      'EscrowFunded',
      'JobFunded',
      'Transfer',
      'JobApproved',
      'JobAutoReleased',
      'PaymentReleased',
      'DisputeResolved',
    ]),
    args: settlementProofArgs.default({}),
    logIndex: z.number().int().nonnegative().optional(),
  }).strict()).max(50).default([]),
  contractState: z.object({
    address: ethereumAddress,
    state: z.union([z.string().min(1).max(80), z.number().int().nonnegative()]),
    escrowAmount: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
    balance: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
    nativeBalance: z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).optional(),
    paymentToken: ethereumAddress.optional(),
    tokenAddress: ethereumAddress.optional(),
    jobId: z.string().min(1).max(120).optional(),
    contractVersion: z.enum(['legacy', 'erc8183', 'native-eth']).optional(),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  const sensitivePath = findMcpSensitiveMaterial(value);
  if (sensitivePath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: sensitivePath,
      message: 'Raw calldata, signatures, payment headers, PRXVT notes, and key material are not accepted',
    });
  }
});

export const mcpToolCategorySchema = z.enum(['discovered', 'read', 'write', 'x402']);
export const mcpCallKindSchema = z.enum(['discover', 'read', 'send', 'send_calls', 'swap', 'sign', 'x402']);
const mcpAmountSchema = z.union([z.string().min(1).max(80), z.number().nonnegative()]);
const mcpCallItemSchema = z.object({
  to: ethereumAddress.optional(),
  target: ethereumAddress.optional(),
  value: mcpAmountSchema.optional(),
  amount: mcpAmountSchema.optional(),
  amountUsd: mcpAmountSchema.optional(),
  tokenSymbol: z.string().min(1).max(32).optional(),
  method: z.string().min(1).max(120).optional(),
  summary: z.string().max(1000).optional(),
}).passthrough();

export const mcpPolicyRequestSchema = z.object({
  tool: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    category: mcpToolCategorySchema.optional(),
  }).passthrough().optional(),
  category: mcpToolCategorySchema.optional(),
  operation: mcpCallKindSchema.optional(),
  execute: z.boolean().default(false),
  target: z.object({
    endpoint: z.string().url().max(1000).optional(),
    network: z.string().min(1).max(80).optional(),
    chainId: z.coerce.number().int().positive().optional(),
    address: ethereumAddress.optional(),
    contractAddress: ethereumAddress.optional(),
    method: z.string().min(1).max(120).optional(),
    summary: z.string().max(1000).optional(),
  }).passthrough().optional(),
  call: z.object({
    kind: mcpCallKindSchema,
    endpoint: z.string().url().max(1000).optional(),
    network: z.string().min(1).max(80).optional(),
    chainId: z.coerce.number().int().positive().optional(),
    to: ethereumAddress.optional(),
    target: ethereumAddress.optional(),
    fromToken: z.string().min(1).max(80).optional(),
    toToken: z.string().min(1).max(80).optional(),
    tokenSymbol: z.string().min(1).max(32).optional(),
    value: mcpAmountSchema.optional(),
    amount: mcpAmountSchema.optional(),
    amountUsd: mcpAmountSchema.optional(),
    method: z.string().min(1).max(120).optional(),
    summary: z.string().max(1000).optional(),
    calls: z.array(mcpCallItemSchema).min(1).max(20).optional(),
  }).passthrough().optional(),
}).passthrough();

export const mcpBasePrepareRequestSchema = z.object({
  providerId: z.enum(['base-mcp', 'base']).default('base-mcp'),
  toolName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9:._-]+$/, 'Invalid MCP tool name'),
  action: z.enum(['discover', 'read', 'write', 'x402']).default('write'),
  category: mcpToolCategorySchema.optional(),
  network: z.literal('base-sepolia').default('base-sepolia'),
  chainId: z.literal(84532).default(84532),
  method: z.string().min(1).max(120).optional(),
  idempotencyKey: z.string().min(1).max(300).optional(),
  jobId: z.string().min(1).max(120).optional(),
  request: mcpSafePayload.optional(),
  params: mcpSafeRecord.default({}),
  metadata: mcpSafeRecord.default({}),
  x402Reference: z.string().min(1).max(500).optional(),
});

export const mcpBaseRequestParamsSchema = z.object({
  id: z.string().min(1).max(120).regex(/^[a-zA-Z0-9:._-]+$/, 'Invalid MCP request id'),
});

export const mcpBaseReceiptSchema = z.object({
  status: z.enum(['SUBMITTED', 'CONFIRMED', 'REJECTED', 'FAILED']),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid tx hash').optional(),
  receiptHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid receipt hash').optional(),
  redactedReference: z.string().max(500).optional(),
  redactedReferenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid redacted reference hash').optional(),
  message: z.string().max(1000).optional(),
  errorCode: z.string().min(1).max(120).optional(),
  metadata: mcpSafeRecord.default({}),
});

export const submitDeliverableSchema = z.object({
  deliverableHash: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
});

export const settlementReceiptSchema = z.object({
  receipt: z.string().min(1).max(5000),
  rail: z.enum(['standard', 'erc8183', 'x402', 'px402']),
  amount: z.union([
    z.number().positive().max(1_000_000),
    z.string().regex(/^\d+(\.\d{1,18})?$/, 'Payment amount must be a positive decimal').refine(value => Number(value) > 0 && Number(value) <= 1_000_000, 'Payment amount out of range'),
  ]),
  tokenSymbol: z.enum(['USDC', 'MON', 'ETH']).optional(),
  tokenAddress: ethereumAddress.optional(),
  onchainJobId: bytes32Hex.optional(),
  walletAddress: ethereumAddress.optional(),
  endpoint: z.string().min(1).max(200).optional(),
  escrowAddress: ethereumAddress,
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid tx hash'),
  receiptHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid receipt hash').optional(),
  chainId: z.number().int().positive(),
  network: chainNetworkSchema,
  status: z.enum(['SETTLED']).default('SETTLED'),
  redactedReference: z.string().max(500).optional(),
  redactedReferenceHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid redacted reference hash').optional(),
  redactedReferenceType: z.string().max(80).optional(),
  escrowContractVersion: z.enum(['legacy', 'erc8183', 'native-eth']).optional(),
  condition: z.enum(['funding', 'release', 'payment']).default('release'),
  verificationProof: settlementVerificationProofSchema.optional(),
}).strict();

export const approveJobSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid tx hash').optional(),
  receiptHash: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/, 'Invalid receipt hash').optional(),
  ledgerId: z.string().min(1).optional(),
}).optional();

export const createWorkspaceSchema = z.object({
  provider: z.enum(['github', 'gitlawb']).optional(),
  mode: z.enum(['created', 'linked']).default('created'),
  externalRef: z.object({
    repoUrl: z.string().url().optional(),
    repoOwner: z.string().min(1).max(100).optional(),
    repoName: z.string().min(1).max(160).optional(),
    providerIdentity: z.string().max(200).optional(),
    nodeUrl: z.string().url().optional(),
    repoDid: z.string().min(1).max(200).optional(),
    cloneUrl: z.string().min(1).max(300).optional(),
    defaultBranch: z.string().min(1).max(120).optional(),
    branchRef: z.string().min(1).max(160).optional(),
    prRef: z.string().min(1).max(200).optional(),
    prNumber: z.number().int().positive().optional(),
  }).optional(),
});

export const workspaceEventSchema = z.object({
  eventId: z.string().min(1).max(200).optional(),
  eventType: z.string().min(1).max(120),
  actor: z.string().max(200).optional(),
  actorDid: z.string().max(200).optional(),
  actorProviderId: z.string().max(200).optional(),
  branchRef: z.string().max(160).optional(),
  prRef: z.string().max(200).optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z.string().max(120).optional(),
  treeCid: z.string().max(200).optional(),
  refCertificateCid: z.string().max(200).optional(),
  payload: z.record(z.unknown()).default({}),
});

export const workspaceVerificationSchema = z.object({
  submissionRef: z.string().min(1).max(300),
  branchRef: z.string().max(160).optional(),
  prRef: z.string().max(200).optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z.string().max(120).optional(),
  treeCid: z.string().max(200).optional(),
  refCertificateCid: z.string().max(200).optional(),
  signerDid: z.string().max(200).optional(),
  actorProviderId: z.string().max(200).optional(),
  targetBranch: z.string().max(160).optional(),
  deliverablePaths: z.array(z.string().min(1).max(300)).default([]),
});

const workspaceProvider = z.enum(['github', 'gitlawb']);
const workspaceMode = z.enum(['create', 'link']).default('link');
const workspaceRef = z.string().min(1).max(500);
const workspaceJsonObject = z.record(z.unknown());

export const createOrLinkWorkspaceSchema = z.object({
  provider: workspaceProvider,
  mode: workspaceMode,
  idempotencyKey: z.string().min(1).max(300).optional(),
  repoUrl: z.string().url().max(500).optional(),
  repoOwner: z.string().min(1).max(120).optional(),
  repoName: z.string().min(1).max(160).optional(),
  providerIdentity: z.string().min(1).max(200).optional(),
  nodeUrl: z.string().url().max(500).optional(),
  repoDid: z.string().min(1).max(300).optional(),
  cloneUrl: z.string().min(1).max(500).optional(),
  defaultBranch: z.string().min(1).max(200).optional(),
  branchRef: z.string().min(1).max(300).optional(),
  prRef: z.string().min(1).max(300).optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z.string().min(6).max(128).optional(),
  treeCid: z.string().min(1).max(300).optional(),
  refCertificateCid: z.string().min(1).max(300).optional(),
  actorDids: z.array(z.string().min(1).max(300)).max(20).default([]),
  ucanDelegationRefs: z.array(z.object({
    ref: z.string().min(1).max(300),
    audienceDid: z.string().min(1).max(300).optional(),
    scope: z.array(z.string().min(1).max(200)).max(20).default([]),
    expiresAt: z.string().datetime().optional(),
  })).max(20).default([]),
  participants: z.array(z.object({
    login: z.string().min(1).max(120).optional(),
    permission: z.enum(['pull', 'triage', 'push', 'maintain', 'admin']).optional(),
    did: z.string().min(1).max(300).optional(),
    role: z.string().min(1).max(80).optional(),
  })).max(20).default([]),
  capabilitySummary: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.provider === 'github') {
    if (data.nodeUrl || data.repoDid || data.cloneUrl?.startsWith('gitlawb://')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['provider'], message: 'GitHub workspace cannot use GitLawb node or DID fields' });
    }
    if (data.mode === 'link' && !data.repoUrl && !(data.repoOwner && data.repoName)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repoUrl'], message: 'GitHub link requires repoUrl or repoOwner/repoName' });
    }
  }
  if (data.provider === 'gitlawb') {
    if (data.repoUrl && !data.repoUrl.startsWith('gitlawb://') && !data.cloneUrl?.startsWith('gitlawb://')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repoUrl'], message: 'GitLawb workspace requires a gitlawb:// clone URL or repo DID' });
    }
    if (data.mode === 'link' && !data.repoDid && !data.cloneUrl && !data.repoUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['repoDid'], message: 'GitLawb link requires repoDid, cloneUrl, or repoUrl' });
    }
  }
});

export const ingestWorkspaceEventSchema = z.object({
  eventType: z.string().min(1).max(120),
  providerEventId: z.string().min(1).max(300).optional(),
  deliverySignature: z.string().min(1).max(300).optional(),
  deliverySignatureHash: z.string().min(16).max(128).optional(),
  deliveryTimestamp: z.string().datetime().optional(),
  replayWindowSeconds: z.number().int().positive().max(86400).optional(),
  signatureVerified: z.boolean().optional(),
  replayProtected: z.boolean().optional(),
  actor: z.string().min(1).max(200).optional(),
  actorDid: z.string().min(1).max(300).optional(),
  actorProviderId: z.string().min(1).max(200).optional(),
  branchRef: workspaceRef.optional(),
  prRef: workspaceRef.optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z.string().min(6).max(128).optional(),
  treeCid: workspaceRef.optional(),
  refCertificateCid: workspaceRef.optional(),
  payload: workspaceJsonObject.optional(),
  normalizedData: workspaceJsonObject.optional(),
});

export const verifyWorkspaceSubmissionSchema = z.object({
  submissionRef: z.string().min(1).max(500),
  branchRef: workspaceRef.optional(),
  prRef: workspaceRef.optional(),
  prNumber: z.number().int().positive().optional(),
  commitSha: z.string().min(6).max(128).optional(),
  treeCid: workspaceRef.optional(),
  refCertificateCid: workspaceRef.optional(),
  signerDid: z.string().min(1).max(300).optional(),
  actorProviderId: z.string().min(1).max(200).optional(),
  targetBranch: z.string().min(1).max(200).optional(),
  repoOwner: z.string().min(1).max(120).optional(),
  repoName: z.string().min(1).max(160).optional(),
  repoDid: z.string().min(1).max(300).optional(),
  nodeUrl: z.string().url().max(500).optional(),
  deliverablePaths: z.array(z.string().min(1).max(500)).min(1).max(50),
  checks: z.array(z.object({
    name: z.string().min(1).max(120),
    status: z.enum(['passed', 'failed', 'skipped', 'success', 'failure', 'neutral', 'cancelled', 'timed_out', 'action_required']),
    detail: z.string().max(1000).optional(),
    conclusion: z.string().max(120).optional(),
  })).max(30).default([]),
  evidence: workspaceJsonObject.optional(),
});

export const snapshotWorkspaceEvidenceSchema = z.object({
  snapshotType: z.enum(['interim', 'final']).default('final'),
  verificationResultId: z.string().min(1).optional(),
  evidence: workspaceJsonObject.optional(),
});

export const disputeSchema = z.object({
  reason: z.string().min(10).max(5000),
});

export const disputeEvidenceSchema = z.object({
  contentHash: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
});

export const arbiterVoteSchema = z.object({
  agentBps: z.number().int().min(0).max(10000),
  reasoning: z.string().min(10).max(5000),
});

export const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
