import { expect, test, type Page } from '@playwright/test';

const clientUser = {
  id: 'client-1',
  walletAddress: '0x1111111111111111111111111111111111111111',
  role: 'CLIENT',
  displayName: 'Client',
  termsAccepted: true,
};

const handlerAgent = {
  id: 'agent-1',
  name: 'Herman',
  avatarUrl: null,
  avgRating: 5,
  trustScore: 0.91,
};

function baseJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-direct-wallet-ui',
    title: 'Direct wallet lifecycle browser regression',
    description: 'Browser-level regression fixture for direct-wallet lifecycle gates.',
    category: 'CODE_DEVELOPMENT',
    deliverables: ['Lifecycle evidence'],
    budgetAmount: 0.0005,
    budgetToken: 'ETH',
    deadline: new Date(Date.now() + 86400_000).toISOString(),
    reviewPeriod: 604800,
    settlementRail: 'standard',
    settlementStatus: 'FUNDED',
    network: 'base',
    chainId: 8453,
    escrowAddress: '0x26C228bf05Df468fC000b4053bBf9eDC82053a7b',
    escrowContractVersion: 'native-eth',
    clientId: clientUser.id,
    agentId: null,
    acceptedAt: null,
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    client: clientUser,
    bids: [
      {
        id: 'bid-1',
        amount: 0.0005,
        estimatedDuration: '1 day',
        message: 'Ready when escrow is finalized.',
        agentId: handlerAgent.id,
        agent: handlerAgent,
      },
    ],
    submissions: [],
    ratings: [],
    paymentLedger: [],
    escrowLifecycle: {
      canonicalState: 'UNFUNDED',
      finalityStatus: 'PENDING',
      nextRequiredActor: 'indexer',
      nextAction: 'WAIT_INDEXER',
      requiredConfirmations: 12,
      currentConfirmations: 0,
      missingEvidence: ['funding event not finalized'],
      actionAvailability: {
        acceptBidBackend: { enabled: false, reason: 'Waiting for finalized funded escrow evidence.' },
        approveReleaseOnchain: { enabled: false, reason: 'Waiting for deliverable evidence.' },
      },
      state: null,
      events: [],
      indexerSchemaReady: true,
    },
    _count: { bids: 1, submissions: 0 },
    ...overrides,
  };
}

async function primeAuth(page: Page) {
  await page.addInitScript((user) => {
    window.localStorage.setItem('aether_token', 'browser-regression-token');
    window.localStorage.setItem('aether_user', JSON.stringify(user));
  }, clientUser);
}

async function routeJob(page: Page, job: Record<string, unknown>) {
  await page.route('**/api/jobs/job-direct-wallet-ui', route => route.fulfill({ json: job }));
  await page.route('**/api/handler/agents', route => route.fulfill({ json: [] }));
  await page.route('**/api/consent-status', route => route.fulfill({ json: { allAccepted: true, termsAccepted: true, needsReaccept: false, currentVersion: 'test', acceptedVersion: 'test', acceptedAt: new Date().toISOString(), missing: [] } }));
  await page.route('**/api/mcp/providers', route => route.fulfill({ json: { status: 'unavailable', warnings: ['mocked in browser regression'] } }));
  await page.route('**/api/mcp/base/tools', route => route.fulfill({ json: { tools: [], categories: { discovered: [], read: [], write: [], x402: [] }, counts: { discovered: 0, read: 0, write: 0, x402: 0 } } }));
  await page.route('**/api/workspaces/providers', route => route.fulfill({ json: { providers: [] } }));
}

test('direct-wallet bid acceptance stays disabled until indexed funded evidence finalizes', async ({ page }) => {
  await primeAuth(page);
  await routeJob(page, baseJob());

  await page.goto('/jobs/job-direct-wallet-ui');

  await expect(page.getByText('Fund escrow and wait for indexed finality before accepting a bid.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Accept Bid/i })).toBeDisabled();
});

test('failed workspace exposes explicit retry without hiding prior failure state', async ({ page }) => {
  await primeAuth(page);
  await routeJob(page, baseJob({
    status: 'FUNDED',
    agentId: handlerAgent.id,
    acceptedAt: new Date().toISOString(),
    agent: handlerAgent,
    workspace: {
      id: 'workspace-1',
      provider: 'github',
      status: 'FAILED',
      verificationStatus: 'UNVERIFIED',
      provisioning: { attempts: 1, lastError: 'Live GitHub provisioning disabled', liveMode: false },
      readiness: { credentialsReady: false, delegationReady: true, nodeReady: true, webhookReady: false, verificationReady: true },
    },
  }));

  await page.goto('/jobs/job-direct-wallet-ui');

  await expect(page.getByRole('heading', { name: 'Retry Workspace' })).toBeVisible();
  await expect(page.getByText('Choose one workspace platform for collaboration evidence.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry Workspace' })).toBeEnabled();
});

test('direct-wallet approval remains disabled until indexed release evidence can be recorded', async ({ page }) => {
  await primeAuth(page);
  await routeJob(page, baseJob({
    status: 'PENDING_REVIEW',
    agentId: handlerAgent.id,
    acceptedAt: new Date().toISOString(),
    agent: handlerAgent,
    submissions: [{ id: 'submission-1', deliverableHash: 'ipfs://deliverable', createdAt: new Date().toISOString() }],
    escrowLifecycle: {
      canonicalState: 'DELIVERED_ONCHAIN',
      finalityStatus: 'FINAL',
      nextRequiredActor: 'client',
      nextAction: 'APPROVE_RELEASE_ONCHAIN',
      requiredConfirmations: 12,
      currentConfirmations: 12,
      missingEvidence: [],
      actionAvailability: {
        approveReleaseOnchain: { enabled: false, reason: 'Release is waiting on finalized indexed deliverable evidence.' },
      },
      state: { latestTxHash: '0x' + '1'.repeat(64) },
      events: [],
      indexerSchemaReady: true,
    },
  }));

  await page.goto('/jobs/job-direct-wallet-ui');

  await expect(page.getByRole('button', { name: /Release Escrow On-Chain|Approve Deliverable/i })).toBeDisabled();
  await expect(page.getByText('DELIVERED_ONCHAIN')).toBeVisible();
});
