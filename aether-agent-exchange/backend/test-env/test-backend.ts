#!/usr/bin/env npx tsx
// ─── Backend API Test Suite ─────────────────────────────────────
// Tests all backend endpoints against the running server.
// Run: npx tsx test-env/test-backend.ts

import {
  WALLET_ALICE, WALLET_BOB,
  authenticateWallet, ApiClient, API,
  logHeader, logStep, logSuccess, logError, logDim,
  baseSepoliaFundingProof, hashForFixture,
  seedEscrowLifecycleProjection,
  seedIndexedErc8183EscrowFunded,
  seedIndexedEscrowDelivered,
  seedIndexedEscrowFunded,
  seedIndexedEscrowReleased,
  seedIndexedEscrowStarted,
} from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const BASE_SEPOLIA_USDC_TOKEN = '0x7D60207c8b23Df81c4512cC2ffcd30DED775AA0f';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ${GREEN}✓${RESET} ${name}`);
  } catch (e: any) {
    failed++;
    console.log(`  ${RED}✗${RESET} ${name}`);
    console.log(`    ${RED}${e.message}${RESET}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function txHashFor(seed: string, fill: string): string {
  const hexSeed = seed.replace(/[^a-fA-F0-9]/g, '');
  return `0x${(hexSeed + fill.repeat(64)).slice(0, 64)}`;
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Aether Backend API Tests ━━━${RESET}\n`);

  // ─── Health ───────────────────────────────────────────────────

  logHeader('Health & Basics');

  await test('GET /api/health returns ok', async () => {
    const res = await fetch(`${API}/health`);
    const data = await res.json();
    assert(data.status === 'ok', 'status should be ok');
    assert(typeof data.timestamp === 'number', 'should have timestamp');
  });

  // ─── Auth ─────────────────────────────────────────────────────

  logHeader('Authentication');

  let aliceToken = '';
  let aliceUser: any;

  await test('POST /api/auth/nonce returns nonce and message', async () => {
    const res = await fetch(`${API}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_ALICE.address }),
    });
    const data = await res.json();
    assert(typeof data.nonce === 'string', 'should return nonce');
    assert(data.message.includes('Aether Agent Exchange'), 'message should mention platform');
    assert(data.message.includes(data.nonce), 'message should contain nonce');
  });

  await test('POST /api/auth/nonce rejects invalid wallet', async () => {
    const res = await fetch(`${API}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: 'not-a-wallet' }),
    });
    assert(res.status === 400, 'should return 400');
  });

  await test('POST /api/auth/verify with valid signature returns JWT', async () => {
    const auth = await authenticateWallet(WALLET_ALICE);
    aliceToken = auth.token;
    aliceUser = auth.user;
    assert(typeof aliceToken === 'string' && aliceToken.length > 0, 'should return token');
    assert(typeof aliceUser.id === 'string', 'should return user id');
    assert(aliceUser.walletAddress.toLowerCase() === WALLET_ALICE.address.toLowerCase(), 'wallet should match');
  });

  await test('POST /api/auth/verify rejects invalid signature', async () => {
    // Get a fresh nonce
    const nonceRes = await fetch(`${API}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_ALICE.address }),
    });
    const nonceData = await nonceRes.json();

    const res = await fetch(`${API}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: WALLET_ALICE.address,
        message: nonceData.message,
        signature: '0x' + '00'.repeat(65),
      }),
    });
    assert(res.status === 401, `should return 401, got ${res.status}`);
  });

  const aliceApi = new ApiClient(aliceToken);

  // ─── Jobs ─────────────────────────────────────────────────────

  logHeader('Jobs API');

  let testJobId = '';

  await test('GET /api/jobs returns paginated jobs', async () => {
    const data = await aliceApi.get('/jobs');
    assert(Array.isArray(data.jobs), 'should return jobs array');
    assert(typeof data.total === 'number', 'should return total count');
    assert(typeof data.page === 'number', 'should return page');
    assert(typeof data.pages === 'number', 'should return pages');
  });

  await test('GET /api/jobs supports pagination', async () => {
    const data = await aliceApi.get('/jobs?page=1&limit=2');
    assert(data.jobs.length <= 2, 'should respect limit');
    assert(data.limit === 2, 'limit should be 2');
  });

  await test('GET /api/jobs supports category filter', async () => {
    const data = await aliceApi.get('/jobs?category=BLOCKCHAIN_WEB3');
    for (const job of data.jobs) {
      assert(job.category === 'BLOCKCHAIN_WEB3', 'all jobs should match category');
    }
  });

  await test('GET /api/jobs supports search', async () => {
    const data = await aliceApi.get('/jobs?search=Solidity');
    assert(data.jobs.length >= 0, 'search should return results array');
  });

  await test('POST /api/jobs creates a new job', async () => {
    const job = await aliceApi.post('/jobs', {
      title: 'Test Job — API Test Suite',
      description: 'This job was created by the automated test suite.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['Test deliverable'],
      budgetAmount: 50,
      budgetToken: 'USDC',
      settlementRail: 'offchain',
      reviewPeriod: 604800,
    });
    testJobId = job.id;
    assert(typeof job.id === 'string', 'should return job id');
    assert(job.title === 'Test Job — API Test Suite', 'title should match');
    assert(job.status === 'OPEN', 'status should be OPEN');
  });

  await test('POST /api/jobs direct wallet escrow sets seven-day acceptance expiry', async () => {
    const job = await aliceApi.post('/jobs', {
      title: 'Direct Wallet Escrow Job',
      description: 'This direct wallet escrow job should lock funds before acceptance.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['Escrow funded deliverable'],
      budgetAmount: 25,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    assert(job.settlementRail === 'standard', 'standard rail should represent direct wallet escrow');
    assert(typeof job.deadline === 'string', 'direct wallet job should get an acceptance deadline');
    assert(typeof job.expiredAt === 'string', 'direct wallet job should get a refund expiry marker');
    assert(new Date(job.expiredAt).getTime() === new Date(job.deadline).getTime(), 'refund marker should match acceptance deadline');
  });

  await test('POST /api/jobs direct wallet escrow accepts browser date and rejects overlong windows', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const job = await aliceApi.post('/jobs', {
      title: 'Direct Wallet Date Input Job',
      description: 'This direct wallet escrow job uses the browser date-only deadline format.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['Escrow funded deliverable'],
      budgetAmount: 25,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      deadline: tomorrow,
      reviewPeriod: 604800,
    });
    assert(job.deadline.startsWith(tomorrow), 'date-only deadline should be accepted and normalized');

    try {
      await aliceApi.post('/jobs', {
        title: 'Overlong Direct Wallet Escrow Job',
        description: 'This direct wallet escrow job should be rejected because the acceptance window is too long.',
        category: 'CODE_DEVELOPMENT',
        deliverables: ['Escrow funded deliverable'],
        budgetAmount: 25,
        budgetToken: 'USDC',
        settlementRail: 'standard',
        tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
        deadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
        reviewPeriod: 604800,
      });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('400'), 'should reject direct wallet deadlines after seven days');
    }
  });

  await test('GET /api/jobs/:id returns job detail', async () => {
    const job = await aliceApi.get(`/jobs/${testJobId}`);
    assert(job.id === testJobId, 'id should match');
    assert(job.client?.id === aliceUser.id, 'client should be Alice');
    assert(Array.isArray(job.bids), 'should include bids');
    assert(Array.isArray(job.submissions), 'should include submissions');
  });

  await test('PUT /api/jobs/:id updates the job', async () => {
    const job = await aliceApi.put(`/jobs/${testJobId}`, {
      title: 'Test Job — Updated Title',
    });
    assert(job.title === 'Test Job — Updated Title', 'title should be updated');
  });

  await test('PUT /api/jobs/:id rejects non-owner', async () => {
    const bobAuth = await authenticateWallet(WALLET_BOB);
    const bobApi = new ApiClient(bobAuth.token);
    try {
      await bobApi.put(`/jobs/${testJobId}`, { title: 'Hacked!' });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('403'), 'should be forbidden');
    }
  });

  await test('GET /api/jobs/:id returns 404 for missing job', async () => {
    try {
      await aliceApi.get('/jobs/nonexistent-id');
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('404'), 'should be 404');
    }
  });

  // ─── Agents ───────────────────────────────────────────────────

  logHeader('Agents API');

  await test('GET /api/agents returns paginated agents', async () => {
    const data = await aliceApi.get('/agents');
    assert(Array.isArray(data.agents), 'should return agents array');
    assert(typeof data.total === 'number', 'should return total');
  });

  await test('GET /api/agents supports search', async () => {
    const data = await aliceApi.get('/agents?search=Herman');
    assert(data.agents.length >= 0, 'search should work');
  });

  await test('GET /api/agents supports sorting', async () => {
    const data = await aliceApi.get('/agents?sortBy=rating');
    assert(Array.isArray(data.agents), 'should return sorted agents');
  });

  await test('GET /api/agents/:id returns agent detail', async () => {
    const data = await aliceApi.get('/agents');
    if (data.agents.length > 0) {
      const agent = await aliceApi.get(`/agents/${data.agents[0].id}`);
      assert(typeof agent.name === 'string', 'should have name');
      assert(typeof agent.walletAddress === 'string', 'should have wallet');
    }
  });

  await test('GET /api/agents/:id/jobs returns job history', async () => {
    const data = await aliceApi.get('/agents');
    if (data.agents.length > 0) {
      const jobs = await aliceApi.get(`/agents/${data.agents[0].id}/jobs`);
      assert(Array.isArray(jobs.jobs), 'should return jobs array');
    }
  });

  await test('GET /api/agents/:id/earnings returns earnings', async () => {
    const data = await aliceApi.get('/agents');
    if (data.agents.length > 0) {
      const earnings = await aliceApi.get(`/agents/${data.agents[0].id}/earnings`);
      assert(typeof earnings.totalJobs === 'number', 'should have totalJobs');
      assert(typeof earnings.earnings === 'object', 'should have earnings');
    }
  });

  // ─── Bidding Flow ─────────────────────────────────────────────

  logHeader('Bidding & Job Lifecycle');

  let bobToken = '';
  let bobAgentId = '';

  await test('Bob registers as handler and creates agent', async () => {
    const bobAuth = await authenticateWallet(WALLET_BOB);
    bobToken = bobAuth.token;
    const bobApi = new ApiClient(bobToken);

    try {
      const agent = await bobApi.post('/agents', {
        name: 'TestBot-API',
        description: 'Test agent for API tests',
        capabilities: ['testing', 'automation'],
        models: ['test-model'],
        metadataURI: 'ipfs://QmTestBotMeta',
        agentWallet: WALLET_BOB.address,
        availability: '24/7',
        responseTime: '< 1 minute',
      });
      bobAgentId = agent.id;
    } catch (e: any) {
      // Already registered — find it
      if (e.message.includes('409')) {
        const agents = await bobApi.get('/handler/agents');
        bobAgentId = agents[0]?.id;
        assert(bobAgentId, 'should find existing agent');
      } else {
        throw e;
      }
    }
  });

  await test('Agent bids on job', async () => {
    assert(bobAgentId !== '', 'bobAgentId should be set');
    const bobApi = new ApiClient(bobToken);
    const bid = await bobApi.post(`/jobs/${testJobId}/bid`, {
      agentId: bobAgentId,
      amount: 45,
      estimatedDuration: '1 day',
      message: 'Test bid from API test suite',
    });
    assert(typeof bid.id === 'string', 'should return bid id');
    assert(bid.amount === 45, 'amount should match');
  });

  await test('Client accepts bid', async () => {
    const result = await aliceApi.post(`/jobs/${testJobId}/accept`, {
      agentId: bobAgentId,
    });
    assert(result.status === 'IN_PROGRESS', 'status should be IN_PROGRESS');
  });

  await test('Client binds GitHub workspace after job start', async () => {
    const workspace = await aliceApi.post(`/jobs/${testJobId}/workspace`, {
      provider: 'github',
      mode: 'link',
      repoUrl: 'https://github.com/aae-test/contracts-workspace',
      repoOwner: 'aae-test',
      repoName: 'contracts-workspace',
      providerIdentity: 'aae-test-org',
      defaultBranch: 'main',
      branchRef: 'aae/job-api-test',
      prRef: 'refs/pull/42/head',
      prNumber: 42,
      commitSha: 'abc123def456',
    });
    assert(workspace.provider === 'github', 'provider should be github');
    assert(workspace.jobId === testJobId, 'workspace should be explicitly bound to job');
    assert(workspace.latestVerificationStatus === 'UNVERIFIED', 'verification should be separate from job status');
  });

  await test('Workspace event ingestion is idempotent and redacts secrets', async () => {
    const first = await aliceApi.post(`/jobs/${testJobId}/workspace/events`, {
      eventType: 'pull_request.merged',
      providerEventId: 'gh-delivery-001',
      actorProviderId: 'octocat',
      branchRef: 'aae/job-api-test',
      prRef: 'refs/pull/42/head',
      prNumber: 42,
      commitSha: 'abc123def456',
      payload: {
        action: 'closed',
        merged: true,
        authorization: 'Bearer should-not-persist',
        privateKey: 'should-not-persist',
      },
    });
    assert(first.idempotent === false, 'first event should create a log row');
    assert(!JSON.stringify(first).includes('Bearer should-not-persist'), 'authorization value should not be rendered');
    assert(!JSON.stringify(first).includes('should-not-persist'), 'private key value should not be rendered');

    const second = await aliceApi.post(`/jobs/${testJobId}/workspace/events`, {
      eventType: 'pull_request.merged',
      providerEventId: 'gh-delivery-001',
      commitSha: 'abc123def456',
    });
    assert(second.idempotent === true, 'duplicate provider event should be idempotent');

    const job = await aliceApi.get(`/jobs/${testJobId}`);
    assert(job.status === 'IN_PROGRESS', 'workspace merge event must not complete the job');
  });

  await test('Workspace verification and snapshot are separate evidence records', async () => {
    const verification = await aliceApi.post(`/jobs/${testJobId}/workspace/verify-submission`, {
      submissionRef: 'github-pr-42',
      branchRef: 'aae/job-api-test',
      prRef: 'refs/pull/42/head',
      prNumber: 42,
      commitSha: 'abc123def456',
      deliverablePaths: ['src/index.ts', 'test/index.test.ts'],
      checks: [{ name: 'ci', status: 'passed' }, { name: 'review', status: 'passed' }],
      evidence: { ciStatus: 'success', reviewStatus: 'approved', token: 'should-not-persist' },
    });
    assert(['PASSED', 'VERIFIED'].includes(verification.status), 'GitHub verification should pass with PR, commit, paths, and checks');
    assert(Array.isArray(verification.deliverablePaths), 'deliverable paths should be parsed as an array');

    const snapshot = await aliceApi.post(`/jobs/${testJobId}/workspace/evidence-snapshot`, {
      snapshotType: 'final',
      verificationResultId: verification.id,
      evidence: { finalTree: 'mocked-tree' },
    });
    assert(typeof snapshot.evidenceHash === 'string' && snapshot.evidenceHash.length === 64, 'snapshot should have evidence hash');

    const workspace = await aliceApi.get(`/jobs/${testJobId}/workspace`);
    assert(workspace.latestVerificationStatus === 'PASSED', 'workspace should track latest verification status');
    assert(workspace.evidenceSnapshots.length >= 1, 'workspace should include evidence snapshots');
  });

  await test('Failed workspace creation can be retried explicitly without replacing job state', async () => {
    const retryJob = await aliceApi.post('/jobs', {
      title: 'Workspace Retry API Test',
      description: 'This job verifies failed workspace provisioning can be retried explicitly.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['workspace retry deliverable'],
      budgetAmount: 12,
      budgetToken: 'USDC',
      settlementRail: 'offchain',
      reviewPeriod: 604800,
    });
    const bobApi = new ApiClient(bobToken);
    await bobApi.post(`/jobs/${retryJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 12,
      estimatedDuration: '1 day',
      message: 'Workspace retry bid',
    });
    const accepted = await aliceApi.post(`/jobs/${retryJob.id}/accept`, { agentId: bobAgentId });
    assert(accepted.status === 'IN_PROGRESS', 'retry fixture job should be accepted');

    const first = await aliceApi.post(`/jobs/${retryJob.id}/workspace`, {
      provider: 'github',
      mode: 'create',
      idempotencyKey: 'workspace-retry-api-test',
    });
    assert(first.status === 'FAILED', 'metadata-only GitHub create should fail when live provisioning is disabled');
    assert(first.provisioning?.attempts === 1 || first.provisioningAttempts === 1, 'first failed create should record one attempt');

    const retried = await aliceApi.post(`/jobs/${retryJob.id}/workspace`, {
      provider: 'github',
      mode: 'create',
      idempotencyKey: 'workspace-retry-api-test',
      repoOwner: 'aae-test',
      repoName: `retry-${retryJob.id.slice(0, 8)}`,
    });
    const attempts = retried.provisioning?.attempts ?? retried.provisioningAttempts;
    assert(retried.id === first.id, 'retry should update the existing failed workspace record');
    assert(attempts >= 2, 'retry should increment provisioning attempts');

    const detail = await aliceApi.get(`/jobs/${retryJob.id}`);
    assert(detail.status === 'IN_PROGRESS', 'workspace retry must not change job lifecycle status');
  });

  await test('Agent submits deliverable', async () => {
    const bobApi = new ApiClient(bobToken);
    const submission = await bobApi.post(`/jobs/${testJobId}/submit`, {
      deliverableHash: 'ipfs://QmTestDeliverable123',
      notes: 'Test deliverable from API test suite',
    });
    assert(typeof submission.id === 'string', 'should return submission id');
  });

  await test('Client approves offchain deliverable', async () => {
    const result = await aliceApi.post(`/jobs/${testJobId}/approve`);
    assert(result.status === 'COMPLETED', 'status should be COMPLETED');
    assert(result.settlementStatus === 'SETTLED', 'settlement should be SETTLED');
  });

  await test('Completed offchain job rejects duplicate approval', async () => {
    try {
      await aliceApi.post(`/jobs/${testJobId}/approve`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('400'), 'should reject non-pending-review job');
    }
  });

  await test('Paid direct-wallet rail rejects client escrow metadata without factory creation evidence', async () => {
    const metadataOnlyJob = await aliceApi.post('/jobs', {
      title: 'Direct Wallet Metadata Only Test',
      description: 'Client-supplied escrow metadata must not unlock direct wallet progression.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['metadata-only escrow deliverable'],
      budgetAmount: 25,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    const escrowAddress = '0x0000000000000000000000000000000000007101';
    const onchainJobId = hashForFixture(metadataOnlyJob.id, 'd');
    await aliceApi.put(`/jobs/${metadataOnlyJob.id}`, {
      escrowAddress,
      onchainJobId,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'legacy',
    });

    const bobApi = new ApiClient(bobToken);
    await bobApi.post(`/jobs/${metadataOnlyJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 25,
      estimatedDuration: '1 day',
      message: 'Metadata-only direct wallet bid',
    });
    await seedEscrowLifecycleProjection({ ...metadataOnlyJob, escrowAddress, onchainJobId }, 'FUNDED', {
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      amountGross: '25000000',
    });

    try {
      await aliceApi.post(`/jobs/${metadataOnlyJob.id}/accept`, { agentId: bobAgentId });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('EscrowCreated'), 'client metadata plus projected state should require factory EscrowCreated evidence');
    }
  });

  await test('Paid direct-wallet rail rejects indexed lifecycle metadata mismatch', async () => {
    const mismatchJob = await aliceApi.post('/jobs', {
      title: 'Direct Wallet Mismatch Test',
      description: 'Indexed escrow metadata must match the backend job before progression.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['mismatched escrow deliverable'],
      budgetAmount: 26,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    const jobEscrowAddress = '0x0000000000000000000000000000000000007102';
    const indexedEscrowAddress = '0x0000000000000000000000000000000000007103';
    const onchainJobId = hashForFixture(mismatchJob.id, 'e');
    await aliceApi.put(`/jobs/${mismatchJob.id}`, {
      escrowAddress: jobEscrowAddress,
      onchainJobId,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'legacy',
    });

    const bobApi = new ApiClient(bobToken);
    await bobApi.post(`/jobs/${mismatchJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 26,
      estimatedDuration: '1 day',
      message: 'Mismatched direct wallet bid',
    });
    await seedEscrowLifecycleProjection({ ...mismatchJob, escrowAddress: indexedEscrowAddress, onchainJobId }, 'FUNDED', {
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      amountGross: '26000000',
    });

    try {
      await aliceApi.post(`/jobs/${mismatchJob.id}/accept`, { agentId: bobAgentId });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('does not match job escrowAddress'), 'indexed escrow mismatch should block bid acceptance');
    }
  });

  await test('ERC-8183 direct-wallet rail accepts verified factory-bound creation evidence', async () => {
    const erc8183Job = await aliceApi.post('/jobs', {
      title: 'ERC-8183 Direct Wallet Factory Binding Test',
      description: 'ERC-8183 escrow progression must use verified factory-bound lifecycle evidence.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['erc8183 escrow deliverable'],
      budgetAmount: 27,
      budgetToken: 'USDC',
      settlementRail: 'erc8183',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'erc8183',
      reviewPeriod: 604800,
    });
    const escrowAddress = '0x0000000000000000000000000000000000007104';
    const onchainJobId = hashForFixture(erc8183Job.id, '8');
    await aliceApi.put(`/jobs/${erc8183Job.id}`, {
      escrowAddress,
      onchainJobId,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'erc8183',
    });

    const bobApi = new ApiClient(bobToken);
    await bobApi.post(`/jobs/${erc8183Job.id}/bid`, {
      agentId: bobAgentId,
      amount: 27,
      estimatedDuration: '1 day',
      message: 'ERC-8183 factory-bound direct wallet bid',
    });

    await seedEscrowLifecycleProjection({ ...erc8183Job, escrowAddress, onchainJobId, escrowContractVersion: 'erc8183' }, 'FUNDED', {
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'erc8183',
      amountGross: '27000000',
    });
    try {
      await aliceApi.post(`/jobs/${erc8183Job.id}/accept`, { agentId: bobAgentId });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('JobCreated'), 'ERC-8183 projected state should require verified factory JobCreated evidence');
    }

    await seedIndexedErc8183EscrowFunded(
      { ...erc8183Job, escrowAddress, onchainJobId, escrowContractVersion: 'erc8183', tokenAddress: BASE_SEPOLIA_USDC_TOKEN },
      { createdBlockNumber: 21_000, blockNumber: 21_001 },
    );
    const accepted = await aliceApi.post(`/jobs/${erc8183Job.id}/accept`, { agentId: bobAgentId });
    assert(accepted.status === 'FUNDED', 'ERC-8183 job should pass the same factory-bound funded gate');

    const detail = await aliceApi.get(`/jobs/${erc8183Job.id}`);
    assert(detail.escrowLifecycle?.state?.factoryBound === true, 'ERC-8183 lifecycle state should be factory-bound');
    assert(detail.escrowLifecycle?.state?.escrowContractVersion === 'erc8183', 'ERC-8183 lifecycle should preserve escrow contract version');
    assert(detail.escrowLifecycle?.nextAction === 'SUBMIT_DELIVERABLE_ONCHAIN', 'ERC-8183 funded accepted jobs should go directly to on-chain deliverable submission');
    assert(detail.escrowLifecycle?.actionAvailability?.startWorkOnchain?.enabled === false, 'ERC-8183 must not expose legacy startWork as the next wallet action');
    assert(detail.escrowLifecycle?.actionAvailability?.submitDeliverableOnchain?.enabled === true, 'ERC-8183 should enable on-chain deliverable submission after backend acceptance');
    assert(
      !String(detail.escrowLifecycle?.actionAvailability?.submitDeliverableOnchain?.reason || '').includes('work start'),
      'ERC-8183 submit availability must not mention work-start evidence',
    );
  });

  await test('Paid direct-wallet rail requires indexed escrow lifecycle finality', async () => {
    const standardJob = await aliceApi.post('/jobs', {
      title: 'Standard Rail Receipt Test',
      description: 'This paid chain job should require a settled ledger receipt.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['receipt-gated deliverable'],
      budgetAmount: 60,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });

    const escrowAddress = '0x0000000000000000000000000000000000008183';
    const wrongChainTxHash = txHashFor(standardJob.id, '3');
    const settledTxHash = txHashFor(standardJob.id, '5');
    const settledReceiptHash = hashForFixture(standardJob.id, '6');
    await aliceApi.put(`/jobs/${standardJob.id}`, { escrowAddress });

    const bobApi = new ApiClient(bobToken);
    await bobApi.post(`/jobs/${standardJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 60,
      estimatedDuration: '1 day',
      message: 'Receipt-gated bid',
    });
    try {
      await aliceApi.post(`/jobs/${standardJob.id}/accept`, { agentId: bobAgentId });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('409'), 'acceptance should require indexed funded escrow evidence');
    }

    await seedIndexedEscrowFunded({ ...standardJob, escrowAddress });
    const acceptedPaid = await aliceApi.post(`/jobs/${standardJob.id}/accept`, { agentId: bobAgentId });
    assert(acceptedPaid.status === 'FUNDED', 'funded paid job should wait for on-chain start after bid acceptance');
    await seedIndexedEscrowStarted({ ...standardJob, escrowAddress }, bobAgentId);

    const gitlawbSignerDid = 'did:key:z6Mktestagent';
    const gitlawbWorkspace = await aliceApi.post(`/jobs/${standardJob.id}/workspace`, {
      provider: 'gitlawb',
      mode: 'create',
      repoDid: `did:gitlawb:${standardJob.id}`,
      defaultBranch: 'main',
      branchRef: 'aae/paid-chain-test',
      actorDids: [gitlawbSignerDid],
      ucanDelegationRefs: [{
        ref: 'ucan-ref-redacted-test',
        audienceDid: gitlawbSignerDid,
        scope: ['workspace:write', 'branch:aae/paid-chain-test'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }],
      treeCid: 'bafybeigdyrmocktreecid',
      refCertificateCid: 'bafybeigrefcertmockcid',
    });
    assert(gitlawbWorkspace.provider === 'gitlawb', 'provider should be gitlawb');
    assert(gitlawbWorkspace.nodeUrl, 'GitLawb workspace should record selected public node URL');

    const gitlawbEvent = await aliceApi.post(`/jobs/${standardJob.id}/workspace/events`, {
      eventType: 'gitlawb.pr.merged',
      providerEventId: 'gitlawb-event-001',
      actorDid: gitlawbSignerDid,
      branchRef: 'aae/paid-chain-test',
      prRef: 'gitlawb-pr-1',
      commitSha: 'def456abc123',
      treeCid: 'bafybeigdyrmocktreecid',
      refCertificateCid: 'bafybeigrefcertmockcid',
      payload: { rawUcanSecret: 'should-not-persist', refCertificateCid: 'bafybeigrefcertmockcid' },
    });
    assert(!JSON.stringify(gitlawbEvent).includes('should-not-persist'), 'GitLawb raw UCAN secret should not be rendered');

    const gitlawbVerification = await aliceApi.post(`/jobs/${standardJob.id}/workspace/verify-submission`, {
      submissionRef: 'gitlawb-pr-1',
      branchRef: 'aae/paid-chain-test',
      prRef: 'gitlawb-pr-1',
      commitSha: 'def456abc123',
      treeCid: 'bafybeigdyrmocktreecid',
      refCertificateCid: 'bafybeigrefcertmockcid',
      signerDid: gitlawbSignerDid,
      targetBranch: 'main',
      deliverablePaths: ['contracts/Job.sol'],
      checks: [{ name: 'ref-certificate', status: 'passed' }],
    });
    assert(['PASSED', 'VERIFIED'].includes(gitlawbVerification.status), 'GitLawb verification should pass with signer, delegation, cert, and paths');

    try {
      await bobApi.post(`/jobs/${standardJob.id}/submit`, {
        deliverableHash: 'ipfs://QmReceiptGatedDeliverable',
        notes: 'Ready for receipt-gated approval',
      });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('409'), 'backend deliverable submission should require indexed on-chain deliverable evidence');
    }

    await seedIndexedEscrowDelivered({ ...standardJob, escrowAddress }, 'ipfs://QmReceiptGatedDeliverable');
    await bobApi.post(`/jobs/${standardJob.id}/submit`, {
      deliverableHash: 'ipfs://QmReceiptGatedDeliverable',
      notes: 'Ready for receipt-gated approval',
    });

    try {
      await aliceApi.post(`/jobs/${standardJob.id}/approve`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('409'), 'approval should require settled receipt');
    }

    try {
      await bobApi.post(`/jobs/${standardJob.id}/approve`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('403'), 'only the client should pass the explicit approval gate');
    }

    try {
      await aliceApi.post(`/jobs/${standardJob.id}/settlement-receipts`, {
        receipt: 'wrong-chain-receipt',
        rail: 'standard',
        amount: 60,
        tokenSymbol: 'USDC',
        tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
        walletAddress: WALLET_ALICE.address,
        escrowAddress,
        txHash: wrongChainTxHash,
        chainId: 10143,
        network: 'monad-testnet',
        status: 'SETTLED',
      });
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('400'), 'wrong chain receipt should be rejected');
    }

    const receipt = await aliceApi.post(`/jobs/${standardJob.id}/settlement-receipts`, {
      receipt: 'matching-standard-receipt',
      rail: 'standard',
      amount: 60,
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      walletAddress: WALLET_ALICE.address,
      escrowAddress,
      txHash: settledTxHash,
      receiptHash: settledReceiptHash,
      chainId: 84532,
      network: 'base-sepolia',
      status: 'SETTLED',
      escrowContractVersion: 'legacy',
      redactedReference: 'standard-receipt-test',
      verificationProof: baseSepoliaFundingProof({
        jobId: standardJob.id,
        txHash: settledTxHash,
        receiptHash: settledReceiptHash,
        escrowAddress,
        amountAtomic: '60000000',
        tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
        condition: 'release',
      }),
    });
    assert(receipt.status === 'SETTLED', 'receipt should be SETTLED');

    const afterReceipt = await aliceApi.get(`/jobs/${standardJob.id}`);
    assert(afterReceipt.status === 'PENDING_REVIEW', 'settled ledger row should not directly complete the job');
    assert(afterReceipt.settlementStatus === 'SETTLED', 'receipt ingestion may mark settlement settled without approving deliverables');

    await seedEscrowLifecycleProjection({ ...standardJob, escrowAddress }, 'COMPLETED', {
      txHash: txHashFor(standardJob.id, '7'),
      blockNumber: 10_004,
      index: 4,
      tokenSymbol: 'USDC',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'legacy',
    });
    try {
      await aliceApi.post(`/jobs/${standardJob.id}/approve`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('409'), 'approval should require a ledger tied to the indexed release transaction');
    }

    await seedIndexedEscrowReleased({ ...standardJob, escrowAddress }, { txHash: settledTxHash, index: 5 });
    const completed = await aliceApi.post(`/jobs/${standardJob.id}/approve`, { txHash: settledTxHash });
    assert(completed.status === 'COMPLETED', 'paid chain job should complete after matching receipt');
    assert(completed.settlementStatus === 'SETTLED', 'settlement should be SETTLED');
  });

  await test('Client rates completed job', async () => {
    const rating = await aliceApi.post(`/jobs/${testJobId}/rate`, {
      score: 5,
      comment: 'Test rating from API test suite',
    });
    assert(rating.score === 5, 'score should be 5');
  });

  // ─── Job Cancellation ────────────────────────────────────────

  logHeader('Job Cancellation');

  await test('Client can cancel their own open job', async () => {
    const job = await aliceApi.post('/jobs', {
      title: 'Job to cancel',
      description: 'This will be cancelled',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['nothing'],
      budgetAmount: 10,
      budgetToken: 'USDC',
      settlementRail: 'offchain',
      reviewPeriod: 604800,
    });
    const result = await aliceApi.del(`/jobs/${job.id}`);
    assert(result.status === 'CANCELLED', 'status should be CANCELLED');
  });

  await test('Close-job eligibility rejects non-owner, non-open, and escrow-backed open jobs', async () => {
    const bobApi = new ApiClient(bobToken);

    const ownerJob = await aliceApi.post('/jobs', {
      title: 'Close Eligibility Owner Test',
      description: 'Only the posting client can close this open job.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['owner close check'],
      budgetAmount: 11,
      budgetToken: 'USDC',
      settlementRail: 'offchain',
      reviewPeriod: 604800,
    });
    try {
      await bobApi.del(`/jobs/${ownerJob.id}`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('403'), 'non-owner close should be forbidden');
    }

    const acceptedJob = await aliceApi.post('/jobs', {
      title: 'Close Eligibility Accepted Test',
      description: 'Accepted jobs should not be closed through the open-job close route.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['accepted close check'],
      budgetAmount: 13,
      budgetToken: 'USDC',
      settlementRail: 'offchain',
      reviewPeriod: 604800,
    });
    await bobApi.post(`/jobs/${acceptedJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 13,
      estimatedDuration: '1 day',
      message: 'Close eligibility bid',
    });
    await aliceApi.post(`/jobs/${acceptedJob.id}/accept`, { agentId: bobAgentId });
    try {
      await aliceApi.del(`/jobs/${acceptedJob.id}`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('400'), 'accepted job close should require open status');
    }

    const escrowBackedJob = await aliceApi.post('/jobs', {
      title: 'Close Eligibility Escrow Test',
      description: 'Escrow-backed direct wallet jobs require wallet refund evidence before closure.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['escrow close check'],
      budgetAmount: 14,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    await aliceApi.put(`/jobs/${escrowBackedJob.id}`, {
      escrowAddress: '0x0000000000000000000000000000000000007701',
      onchainJobId: hashForFixture(escrowBackedJob.id, 'c'),
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      escrowContractVersion: 'legacy',
    });
    try {
      await aliceApi.del(`/jobs/${escrowBackedJob.id}`);
      throw new Error('Should have thrown');
    } catch (e: any) {
      assert(e.message.includes('409'), 'escrow-backed open job close should require wallet refund/cancel evidence');
    }
  });

  // ─── Handler Dashboard ───────────────────────────────────────

  logHeader('Handler Dashboard');

  await test('GET /api/handler/dashboard returns stats', async () => {
    const bobApi = new ApiClient(bobToken);
    const dash = await bobApi.get('/handler/dashboard');
    assert(typeof dash.agents === 'number', 'should have agent count');
    assert(typeof dash.activeJobs === 'number', 'should have activeJobs');
    assert(typeof dash.completedJobs === 'number', 'should have completedJobs');
    assert(typeof dash.totalEarnings === 'number', 'should have totalEarnings');
  });

  await test('GET /api/handler/agents returns handler agents', async () => {
    const bobApi = new ApiClient(bobToken);
    const agents = await bobApi.get('/handler/agents');
    assert(Array.isArray(agents), 'should return array');
    assert(agents.length > 0, 'should have at least one agent');
  });

  await test('GET /api/handler/notifications returns notifications', async () => {
    const bobApi = new ApiClient(bobToken);
    const notifs = await bobApi.get('/handler/notifications');
    assert(Array.isArray(notifs), 'should return array');
  });

  // ─── Auth Edge Cases ──────────────────────────────────────────

  logHeader('Auth Edge Cases');

  await test('Requests without auth token are rejected', async () => {
    const res = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized' }),
    });
    assert(res.status === 401, 'should return 401');
  });

  await test('Requests with invalid token are rejected', async () => {
    const res = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.token.here',
      },
      body: JSON.stringify({ title: 'Bad token' }),
    });
    assert(res.status === 401, 'should return 401');
  });

  // ─── Results ──────────────────────────────────────────────────

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`Test suite crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
