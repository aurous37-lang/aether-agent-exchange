#!/usr/bin/env npx tsx
// Contract-bound workspace acceptance tests.
//
// Run through the controlled runner with:
//   $env:AAE_ENABLE_WORKSPACE_CONTRACT_TESTS='true'; npm run test:all -- --skip-sim
//
// These tests intentionally use mocked GitHub/GitLawb metadata only. They do
// not require provider credentials and they must not send live payment headers,
// PRXVT notes, raw UCAN secrets, or private keys.

import {
  WALLET_ALICE,
  WALLET_BOB,
  authenticateWallet,
  ApiClient,
  API,
  logHeader,
  logError,
  seedIndexedEscrowDelivered,
  seedIndexedEscrowFunded,
  seedIndexedEscrowStarted,
} from './helpers';
import crypto from 'crypto';

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

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg}; expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function raw(method: string, path: string, token: string, body?: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function rawWebhook(path: string, headers: Record<string, string>, body: any): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function must(method: string, path: string, token: string, body?: any): Promise<any> {
  const result = await raw(method, path, token, body);
  if (result.status < 200 || result.status >= 300) {
    const hint = result.status === 404
      ? 'workspace contract route is not implemented or not mounted'
      : JSON.stringify(result.data);
    throw new Error(`${method} ${path} -> ${result.status}: ${hint}`);
  }
  return result.data;
}

function txHashFor(seed: string, fill: string): string {
  const hexSeed = seed.replace(/[^a-fA-F0-9]/g, '');
  return `0x${(hexSeed + fill.repeat(64)).slice(0, 64)}`;
}

function deepText(value: unknown): string {
  return JSON.stringify(value, Object.keys(flattenKeys(value)).sort());
}

function deepStringValues(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) deepStringValues(item, out);
    return out;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepStringValues(child, out);
  }
  return out;
}

function webhookSignature(secret: string, payload: unknown): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
}

function flattenKeys(value: unknown, out: Record<string, true> = {}): Record<string, true> {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) flattenKeys(item, out);
    return out;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = true;
    flattenKeys(child, out);
  }
  return out;
}

function assertNoSensitiveMaterial(rendered: unknown, sentinels: string[]): void {
  const text = JSON.stringify(rendered);
  for (const sentinel of sentinels) {
    assert(!text.includes(sentinel), `response persisted or rendered sensitive sentinel ${sentinel}`);
  }
  assert(!text.includes('X-PAYMENT raw-'), 'response rendered a raw payment header value');
  assert(!text.includes('raw-prxvt-note-'), 'response rendered a raw PRXVT note value');
  assert(!text.includes('raw-ucan-secret-'), 'response rendered a raw UCAN secret value');
  assert(!text.includes('raw-wallet-key-'), 'response rendered a raw private key value');
}

function workspaceId(workspace: any): string {
  const id = workspace?.id || workspace?.workspaceId || workspace?.workspace?.id;
  assert(typeof id === 'string' && id.length > 0, 'workspace response should include id');
  return id;
}

function workspaceEvents(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.workspaceEvents)) return value.workspaceEvents;
  if (Array.isArray(value?.workspace?.events)) return value.workspace.events;
  throw new Error('workspace event response should include an events array');
}

function providerFrom(value: any): string | undefined {
  return value?.provider || value?.workspaceProvider || value?.workspace?.provider;
}

function statusFrom(value: any): string | undefined {
  return value?.status || value?.workspaceStatus || value?.workspace?.status;
}

function assertWorkspaceBound(workspace: any, jobId: string, provider: 'github' | 'gitlawb'): void {
  assertEqual(providerFrom(workspace), provider, 'workspace provider should match selected provider');
  assert(
    workspace?.jobId === jobId || workspace?.job?.id === jobId || workspace?.contractJobId === jobId,
    'workspace should be explicitly bound to job'
  );
  assert(typeof workspaceId(workspace) === 'string', 'workspace should include an id');
  assert(['ACTIVE', 'READY', 'LINKED', 'CREATED'].includes(statusFrom(workspace) || ''), 'workspace should be active/linked');
}

function githubWorkspacePayload(jobId: string) {
  const suffix = jobId.slice(0, 8);
  return {
    provider: 'github',
    mode: 'link',
    repoUrl: `https://github.com/aae-test/job-${suffix}`,
    repoOwner: 'aae-test',
    repoName: `job-${suffix}`,
    providerIdentity: 'org:aae-test',
    defaultBranch: 'main',
    branchRef: `aae/job-${suffix}`,
    prRef: `https://github.com/aae-test/job-${suffix}/pull/17`,
    prNumber: 17,
  };
}

function gitlawbWorkspacePayload(jobId: string) {
  const suffix = jobId.slice(0, 8);
  return {
    provider: 'gitlawb',
    mode: 'link',
    nodeUrl: 'https://node.gitlawb.example/public',
    repoDid: `did:gitlawb:test:${suffix}`,
    actorDids: ['did:key:z6MkpzMockProviderActor'],
    ucanDelegationRefs: [{
      ref: `ucan:delegation:${suffix}`,
      audienceDid: 'did:key:z6MkpzMockProviderActor',
      scope: [`branch:aae/job-${suffix}`, `push:aae/job-${suffix}`],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }],
    defaultBranch: 'main',
    branchRef: `aae/job-${suffix}`,
    prRef: `refs/pr/${suffix}`,
  };
}

async function createLifecycleJob(
  clientApi: ApiClient,
  handlerApi: ApiClient,
  agentId: string,
  overrides: Record<string, unknown> = {}
): Promise<any> {
  const job = await clientApi.post('/jobs', {
    title: `Workspace Contract Test ${Date.now()}`,
    description: 'Created by contract-bound workspace acceptance tests.',
    category: 'CODE_DEVELOPMENT',
    deliverables: ['workspace evidence snapshot'],
    budgetAmount: 50,
    budgetToken: 'USDC',
    settlementRail: 'offchain',
    reviewPeriod: 604800,
    ...overrides,
  });

  await handlerApi.post(`/jobs/${job.id}/bid`, {
    agentId,
    amount: Number(overrides.budgetAmount || 50),
    estimatedDuration: '1 day',
    message: 'Workspace acceptance test bid',
  });
  await clientApi.post(`/jobs/${job.id}/accept`, { agentId });
  return job;
}

async function getOrCreateAgent(handlerApi: ApiClient): Promise<string> {
  const name = `WorkspaceTestBot-${Date.now()}`;
  try {
    const agent = await handlerApi.post('/agents', {
      name,
      description: 'Mock handler agent for contract-bound workspace tests.',
      capabilities: ['testing', 'workspace-evidence'],
      models: ['mock'],
      metadataURI: `ipfs://QmWorkspaceTest${Date.now()}`,
      agentWallet: WALLET_BOB.address,
      availability: '24/7',
      responseTime: '< 1 minute',
    });
    return agent.id;
  } catch (e: any) {
    if (!String(e.message).includes('409')) throw e;
    const agents = await handlerApi.get('/handler/agents');
    const agent = agents[0];
    assert(agent?.id, 'handler should have an existing agent after duplicate registration');
    return agent.id;
  }
}

async function ingestWorkspaceEvent(token: string, jobId: string, event: any): Promise<any> {
  return must('POST', `/jobs/${jobId}/workspace/events`, token, event);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Contract-Bound Workspace Tests ━━━${RESET}\n`);

  const aliceAuth = await authenticateWallet(WALLET_ALICE);
  const bobAuth = await authenticateWallet(WALLET_BOB);
  const aliceApi = new ApiClient(aliceAuth.token);
  const bobApi = new ApiClient(bobAuth.token);
  const bobAgentId = await getOrCreateAgent(bobApi);

  logHeader('Provider Selection');

  await test('GET /api/workspaces/providers exposes GitHub and GitLawb tradeoffs', async () => {
    const providers = await must('GET', '/workspaces/providers', aliceAuth.token);
    const list = Array.isArray(providers) ? providers : providers.providers;
    assert(Array.isArray(list), 'providers response should include a providers array');

    const github = list.find((provider: any) => provider.id === 'github');
    const gitlawb = list.find((provider: any) => provider.id === 'gitlawb');
    assert(github, 'GitHub provider should be selectable');
    assert(gitlawb, 'GitLawb provider should be selectable');
    assert(String(github.tradeoffs || github.description || '').toLowerCase().includes('centralized'), 'GitHub tradeoffs should mention centralized custody/platform tradeoff');
    assert(String(gitlawb.tradeoffs || gitlawb.description || '').toLowerCase().includes('alpha'), 'GitLawb tradeoffs should mention alpha/tooling risk');
    assert(gitlawb.publicNodeUrl === 'https://node.gitlawb.com' || String(gitlawb.publicNodeUrl || '').startsWith('https://'), 'GitLawb provider should expose a public HTTPS node URL');
    assert(gitlawb.liveEnabled === false, 'GitLawb live writes should remain disabled by default');
    assert(gitlawb.delegationConfigured === false, 'GitLawb delegation should remain disabled until live workspace writes are explicitly enabled');
    if (gitlawb.nodeMetadata) {
      assert(typeof gitlawb.nodeMetadata === 'object', 'GitLawb public node metadata should be an object when present');
      assert(!gitlawb.nodeMetadata.token && !gitlawb.nodeMetadata.secret, 'GitLawb public node metadata should not expose secret fields');
      if (gitlawb.nodeMetadata.protocols) {
        assert(Array.isArray(gitlawb.nodeMetadata.protocols), 'GitLawb public node protocols should be an array');
      }
    }
  });

  await test('invalid workspace provider is rejected', async () => {
    const job = await createLifecycleJob(aliceApi, bobApi, bobAgentId);
    const result = await raw('POST', `/jobs/${job.id}/workspace`, aliceAuth.token, {
      provider: 'gitlab',
      mode: 'link',
      repoUrl: 'https://gitlab.example/aae/job',
    });
    assert(result.status === 400, `invalid provider should return 400, got ${result.status}`);
  });

  logHeader('Job Binding');

  let githubJob: any;
  let githubWorkspace: any;
  let gitlawbJob: any;
  let gitlawbWorkspace: any;

  await test('GitHub workspace can be selected and bound after job start', async () => {
    githubJob = await createLifecycleJob(aliceApi, bobApi, bobAgentId);
    githubWorkspace = await must('POST', `/jobs/${githubJob.id}/workspace`, aliceAuth.token, githubWorkspacePayload(githubJob.id));

    assertWorkspaceBound(githubWorkspace, githubJob.id, 'github');
    assert(
      deepStringValues(githubWorkspace).includes(githubWorkspacePayload(githubJob.id).repoUrl),
      'GitHub repo URL should be stored as evidence metadata'
    );

    const fromJob = await aliceApi.get(`/jobs/${githubJob.id}`);
    assert(fromJob.status === 'IN_PROGRESS', 'workspace binding should not change job status');
  });

  await test('GitLawb workspace can be selected and bound after job start', async () => {
    gitlawbJob = await createLifecycleJob(aliceApi, bobApi, bobAgentId);
    gitlawbWorkspace = await must('POST', `/jobs/${gitlawbJob.id}/workspace`, aliceAuth.token, gitlawbWorkspacePayload(gitlawbJob.id));

    assertWorkspaceBound(gitlawbWorkspace, gitlawbJob.id, 'gitlawb');
    const text = deepText(gitlawbWorkspace);
    assert(text.includes('gitlawb://did:gitlawb:test:'), 'GitLawb clone URL should be stored');
    assert(text.includes('did:gitlawb:test:'), 'GitLawb repo DID should be stored');
    assert(
      deepStringValues(gitlawbWorkspace).includes(gitlawbWorkspacePayload(gitlawbJob.id).nodeUrl),
      'selected public node URL should be stored'
    );
  });

  logHeader('Append-Only Events');

  await test('workspace event ingestion is idempotent by provider delivery id', async () => {
    assert(githubJob?.id, 'GitHub job should be initialized');
    const deliveryId = `gh-delivery-${githubJob.id}`;
    const event = {
      provider: 'github',
      providerEventId: deliveryId,
      eventType: 'pull_request',
      action: 'synchronize',
      occurredAt: new Date().toISOString(),
      payload: {
        repoUrl: githubWorkspacePayload(githubJob.id).repoUrl,
        pullRequest: { number: 17, targetBranch: 'main', merged: false },
        commitSha: txHashFor(githubJob.id, 'a'),
      },
    };

    const first = await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, event);
    const second = await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, event);
    const events = workspaceEvents(await must('GET', `/jobs/${githubJob.id}/workspace/events`, aliceAuth.token));
    const matching = events.filter((item: any) => item.providerEventId === deliveryId);

    assert(matching.length === 1, `duplicate delivery should create one event, got ${matching.length}`);
    assert(
      first.id === second.id || second.duplicate === true || second.idempotent === true,
      'second ingestion should return same event or explicit duplicate/idempotent marker'
    );
  });

  await test('signed GitHub webhook ingestion rejects invalid signatures and deduplicates replays', async () => {
    assert(githubJob?.id, 'GitHub job should be initialized');
    const payload = {
      action: 'synchronize',
      repository: { name: `job-${githubJob.id.slice(0, 8)}`, owner: { login: 'aae-test' } },
      pull_request: { number: 17, base: { ref: 'main' }, head: { ref: githubWorkspacePayload(githubJob.id).branchRef } },
      after: txHashFor(githubJob.id, '1'),
    };
    const invalid = await rawWebhook('/workspaces/webhooks/github', {
      'X-GitHub-Delivery': `gh-webhook-invalid-${githubJob.id}`,
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': 'sha256=bad',
    }, payload);
    assertEqual(invalid.status, 401, 'invalid GitHub webhook signature should be rejected');

    const headers = {
      'X-GitHub-Delivery': `gh-webhook-valid-${githubJob.id}`,
      'X-GitHub-Event': 'pull_request',
      'X-Hub-Signature-256': webhookSignature('test-github-workspace-webhook-secret', payload),
    };
    const first = await rawWebhook('/workspaces/webhooks/github', headers, payload);
    const replay = await rawWebhook('/workspaces/webhooks/github', headers, payload);
    assert([200, 202].includes(first.status), `valid GitHub webhook should ingest, got ${first.status}`);
    assertEqual(replay.status, 200, 'replayed GitHub webhook should be idempotent');
    assert(replay.data?.duplicate === true || replay.data?.idempotent === true, 'replayed webhook should be marked duplicate/idempotent');
    assert(replay.data?.signatureVerified === true, 'webhook event should record signature verification');
    assert(replay.data?.replayProtected === true, 'webhook event should record replay protection');
  });

  await test('stale signed workspace event is rejected by replay window', async () => {
    assert(githubJob?.id, 'GitHub job should be initialized');
    const result = await raw('POST', `/jobs/${githubJob.id}/workspace/events`, aliceAuth.token, {
      provider: 'github',
      providerEventId: `gh-stale-${githubJob.id}`,
      eventType: 'push',
      deliverySignature: `stale-signature-${githubJob.id}`,
      deliveryTimestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      replayWindowSeconds: 60,
      payload: { branchRef: githubWorkspacePayload(githubJob.id).branchRef },
    });
    assertEqual(result.status, 409, 'stale workspace delivery should be rejected');
  });

  logHeader('Evidence Flows');

  await test('final evidence snapshot requires passing provider verification', async () => {
    assert(githubJob?.id, 'GitHub job should be initialized');
    const result = await raw('POST', `/jobs/${githubJob.id}/workspace/evidence-snapshot`, aliceAuth.token, {
      snapshotType: 'final',
      evidence: { source: 'missing-verification' },
    });
    assertEqual(result.status, 409, 'final snapshot without provider verification should be rejected');

    const interim = await must('POST', `/jobs/${githubJob.id}/workspace/evidence-snapshot`, aliceAuth.token, {
      snapshotType: 'interim',
      evidence: { source: 'interim-before-verification' },
    });
    assert(typeof interim.evidenceHash === 'string', 'interim snapshot should still be available');
  });

  await test('mock GitHub commits, review, CI, and merge are captured as evidence', async () => {
    assert(githubJob?.id, 'GitHub job should be initialized');
    const commitSha = txHashFor(githubJob.id, 'b');
    const prefix = `gh-evidence-${githubJob.id}`;

    await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, {
      provider: 'github',
      providerEventId: `${prefix}-push`,
      eventType: 'push',
      occurredAt: new Date().toISOString(),
      payload: {
        branchRef: githubWorkspacePayload(githubJob.id).branchRef,
        commits: [{ sha: commitSha, message: 'Implement requested workspace deliverable' }],
      },
    });
    await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, {
      provider: 'github',
      providerEventId: `${prefix}-check`,
      eventType: 'check_suite',
      occurredAt: new Date().toISOString(),
      payload: {
        commitSha,
        conclusion: 'success',
        status: 'completed',
      },
    });
    await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, {
      provider: 'github',
      providerEventId: `${prefix}-review`,
      eventType: 'pull_request_review',
      occurredAt: new Date().toISOString(),
      payload: {
        pullRequestNumber: 17,
        reviewer: 'aae-client',
        state: 'APPROVED',
        commitSha,
      },
    });
    await ingestWorkspaceEvent(aliceAuth.token, githubJob.id, {
      provider: 'github',
      providerEventId: `${prefix}-merge`,
      eventType: 'pull_request',
      action: 'closed',
      occurredAt: new Date().toISOString(),
      payload: {
        pullRequestNumber: 17,
        merged: true,
        targetBranch: 'main',
        commitSha,
      },
    });

    const verification = await must('POST', `/jobs/${githubJob.id}/workspace/verify-submission`, aliceAuth.token, {
      submissionRef: 'github-pr-17',
      branchRef: githubWorkspacePayload(githubJob.id).branchRef,
      prRef: githubWorkspacePayload(githubJob.id).prRef,
      prNumber: 17,
      commitSha,
      targetBranch: 'main',
      repoOwner: 'aae-test',
      repoName: `job-${githubJob.id.slice(0, 8)}`,
      deliverablePaths: ['src/workspace-deliverable.ts'],
      checks: [{ name: 'ci', status: 'passed' }, { name: 'review', status: 'passed' }],
      evidence: { ciStatus: 'success', reviewStatus: 'approved' },
    });
    assert(['PASSED', 'VERIFIED'].includes(statusFrom(verification) || verification?.verificationStatus || ''), 'GitHub verification should pass with review, CI, PR, commit, and paths');

    const snapshot = await must('POST', `/jobs/${githubJob.id}/workspace/evidence-snapshot`, aliceAuth.token, {
      snapshotType: 'final',
      verificationResultId: verification.id,
      evidence: { source: 'mock-github-flow' },
    });
    const text = deepText(snapshot);
    assert(text.includes(commitSha), 'GitHub snapshot should include commit SHA');
    assert(text.includes('APPROVED') || text.toLowerCase().includes('approved'), 'GitHub snapshot should include review approval');
    assert(text.includes('success'), 'GitHub snapshot should include CI success');

    const job = await aliceApi.get(`/jobs/${githubJob.id}`);
    assert(job.status !== 'COMPLETED', 'GitHub merge must not complete the AAE job');
  });

  await test('mock GitLawb signed ref and UCAN-scoped submission verifies as evidence', async () => {
    assert(gitlawbJob?.id, 'GitLawb job should be initialized');
    const suffix = gitlawbJob.id.slice(0, 8);
    const commitHash = txHashFor(gitlawbJob.id, 'c');
    const treeCid = `bafybeigdyrzt${suffix}`;
    const certificateCid = `bafyreibefcert${suffix}`;

    await ingestWorkspaceEvent(aliceAuth.token, gitlawbJob.id, {
      provider: 'gitlawb',
      providerEventId: `gl-ref-${gitlawbJob.id}`,
      eventType: 'ref.updated',
      occurredAt: new Date().toISOString(),
      actorDid: 'did:key:z6MkpzMockProviderActor',
      branchRef: `aae/job-${suffix}`,
      prRef: `refs/pr/${suffix}`,
      commitSha: commitHash,
      treeCid,
      refCertificateCid: certificateCid,
      payload: {
        repoDid: `did:gitlawb:test:${suffix}`,
        delegationRef: `ucan:delegation:${suffix}`,
        deliverablePaths: ['src/workspace-deliverable.ts'],
      },
    });

    const verification = await must('POST', `/jobs/${gitlawbJob.id}/workspace/verify-submission`, aliceAuth.token, {
      provider: 'gitlawb',
      submissionRef: `gitlawb://did:gitlawb:test:${suffix}/refs/pr/${suffix}`,
      branchRef: `aae/job-${suffix}`,
      prRef: `refs/pr/${suffix}`,
      commitSha: commitHash,
      treeCid,
      refCertificateCid: certificateCid,
      signerDid: 'did:key:z6MkpzMockProviderActor',
      targetBranch: 'main',
      deliverablePaths: ['src/workspace-deliverable.ts'],
      checks: [{ name: 'mock-ref-certificate', status: 'passed', detail: certificateCid }],
      evidence: {
        delegationRef: `ucan:delegation:${suffix}`,
      },
    });

    const text = deepText(verification);
    assert(text.includes(commitHash), 'GitLawb verification should include commit hash');
    assert(text.includes(certificateCid), 'GitLawb verification should include ref certificate CID');
    assert(
      ['PASSED', 'VERIFIED', 'ACCEPTED', 'VALID'].includes(statusFrom(verification) || verification?.verificationStatus || ''),
      'GitLawb submission should verify successfully'
    );
  });

  await test('GitLawb verification rejects invalid delegation scope or PR target', async () => {
    assert(gitlawbJob?.id, 'GitLawb job should be initialized');
    const result = await raw('POST', `/jobs/${gitlawbJob.id}/workspace/verify-submission`, aliceAuth.token, {
      provider: 'gitlawb',
      submissionRef: 'gitlawb://did:gitlawb:test:wrong/refs/pr/wrong-target',
      branchRef: 'aae/wrong-job',
      prRef: 'refs/pr/wrong-target',
      commitSha: txHashFor(gitlawbJob.id, 'd'),
      treeCid: 'bafywrongtree',
      refCertificateCid: 'bafywrongcert',
      signerDid: 'did:key:z6MkpzUntrustedActor',
      targetBranch: 'production',
      deliverablePaths: ['unexpected/path.txt'],
      checks: [{ name: 'mock-scope', status: 'passed' }],
    });

    if (result.status >= 200 && result.status < 300) {
      assertEqual(result.data.status, 'FAILED', 'invalid GitLawb evidence should persist a failed verification result');
    } else {
      assert([400, 403, 409, 422].includes(result.status), `invalid GitLawb evidence should be rejected or failed, got ${result.status}`);
    }
  });

  logHeader('Completion Gates');

  await test('workspace merge does not bypass paid-chain PaymentLedger gate', async () => {
    const paidJob = await aliceApi.post('/jobs', {
      title: 'Workspace Paid Chain Gate Test',
      description: 'A paid-chain job whose workspace merge must not bypass settlement.',
      category: 'CODE_DEVELOPMENT',
      deliverables: ['workspace payment gate evidence'],
      budgetAmount: 60,
      budgetToken: 'USDC',
      settlementRail: 'standard',
      network: 'base-sepolia',
      chainId: 84532,
      tokenAddress: BASE_SEPOLIA_USDC_TOKEN,
      reviewPeriod: 604800,
    });
    const escrowAddress = `0x${paidJob.id.replace(/-/g, '').padEnd(40, '0').slice(0, 40)}`;
    await aliceApi.put(`/jobs/${paidJob.id}`, {
      escrowAddress,
    });
    await bobApi.post(`/jobs/${paidJob.id}/bid`, {
      agentId: bobAgentId,
      amount: 60,
      estimatedDuration: '1 day',
      message: 'Workspace paid-chain gate test bid',
    });
    await seedIndexedEscrowFunded({ ...paidJob, escrowAddress });
    await aliceApi.post(`/jobs/${paidJob.id}/accept`, { agentId: bobAgentId });
    await seedIndexedEscrowStarted({ ...paidJob, escrowAddress }, bobAgentId);

    await must('POST', `/jobs/${paidJob.id}/workspace`, aliceAuth.token, githubWorkspacePayload(paidJob.id));
    await ingestWorkspaceEvent(aliceAuth.token, paidJob.id, {
      provider: 'github',
      providerEventId: `gh-paid-merge-${paidJob.id}`,
      eventType: 'pull_request',
      action: 'closed',
      occurredAt: new Date().toISOString(),
      payload: {
        pullRequestNumber: 17,
        merged: true,
        targetBranch: 'main',
        commitSha: txHashFor(paidJob.id, 'e'),
      },
    });

    let job = await aliceApi.get(`/jobs/${paidJob.id}`);
    assertEqual(job.status, 'IN_PROGRESS', 'workspace merge should leave paid-chain job in progress before AAE submission');

    await seedIndexedEscrowDelivered({ ...paidJob, escrowAddress }, 'ipfs://QmWorkspacePaidGate');
    await bobApi.post(`/jobs/${paidJob.id}/submit`, {
      deliverableHash: 'ipfs://QmWorkspacePaidGate',
      notes: 'Workspace PR merged, but AAE approval still controls completion.',
    });

    const approval = await raw('POST', `/jobs/${paidJob.id}/approve`, aliceAuth.token);
    assertEqual(approval.status, 409, 'paid-chain approval should require a settled PaymentLedger receipt');

    job = await aliceApi.get(`/jobs/${paidJob.id}`);
    assertEqual(job.status, 'PENDING_REVIEW', 'failed approval should leave job pending review');
    assert(job.settlementStatus !== 'SETTLED', 'settlement should not be marked settled without PaymentLedger receipt');
  });

  logHeader('Secret Redaction');

  await test('workspace events do not persist or render raw payment/PRXVT/UCAN/private-key material', async () => {
    assert(gitlawbJob?.id, 'GitLawb job should be initialized');
    const sentinels = [
      `raw-x-payment-${gitlawbJob.id}`,
      `raw-prxvt-note-${gitlawbJob.id}`,
      `raw-ucan-secret-${gitlawbJob.id}`,
      `raw-wallet-key-${gitlawbJob.id}`,
    ];

    const redactedEvent = await ingestWorkspaceEvent(aliceAuth.token, gitlawbJob.id, {
      provider: 'gitlawb',
      providerEventId: `gl-secret-redaction-${gitlawbJob.id}`,
      eventType: 'ref.updated',
      occurredAt: new Date().toISOString(),
      payload: {
        signerDid: 'did:key:z6MkpzMockProviderActor',
        commitHash: txHashFor(gitlawbJob.id, 'f'),
        rawPaymentHeader: `X-PAYMENT ${sentinels[0]}`,
        prxvtNote: sentinels[1],
        rawUcanSecret: sentinels[2],
        ucanPrivateKey: sentinels[2],
        walletPrivateKey: sentinels[3],
      },
    });

    const workspace = await must('GET', `/jobs/${gitlawbJob.id}/workspace`, aliceAuth.token);
    const events = await must('GET', `/jobs/${gitlawbJob.id}/workspace/events`, aliceAuth.token);
    const snapshot = await must('POST', `/jobs/${gitlawbJob.id}/workspace/evidence-snapshot`, aliceAuth.token, {
      snapshotType: 'interim',
      evidence: { source: 'secret-redaction-check' },
    });
    const job = await aliceApi.get(`/jobs/${gitlawbJob.id}`);

    assertNoSensitiveMaterial(redactedEvent, sentinels);
    assertNoSensitiveMaterial(workspace, sentinels);
    assertNoSensitiveMaterial(events, sentinels);
    assertNoSensitiveMaterial(snapshot, sentinels);
    assertNoSensitiveMaterial(job, sentinels);
  });

  logHeader('Operations');

  await test('workspace reconciliation and access rotation/revocation are audited and redacted', async () => {
    assert(gitlawbJob?.id, 'GitLawb job should be initialized');
    const suffix = gitlawbJob.id.slice(0, 8);
    const rawSecret = `raw-ucan-secret-rotation-${suffix}`;

    const reconciled = await must('POST', `/jobs/${gitlawbJob.id}/workspace/reconcile`, aliceAuth.token, {
      source: 'focused-test',
    });
    assert(reconciled.lastReconciledAt || deepText(reconciled).includes('reconciled'), 'workspace reconciliation should update reconciliation metadata');

    const rotated = await must('POST', `/jobs/${gitlawbJob.id}/workspace/access/rotate`, aliceAuth.token, {
      credentialRef: rawSecret,
      ucanDelegationRefs: [{
        ref: rawSecret,
        audienceDid: 'did:key:z6MkpzMockProviderActor',
        scope: [`branch:aae/job-${suffix}`, `push:aae/job-${suffix}`],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }],
      credentialsReady: true,
      webhookReady: true,
    });
    assertNoSensitiveMaterial(rotated, [rawSecret]);
    assert(rotated.readiness?.delegationReady === true || rotated.delegationReady === true, 'rotation should keep delegation readiness true');

    const revoked = await must('POST', `/jobs/${gitlawbJob.id}/workspace/access/revoke`, aliceAuth.token, {
      reason: 'focused-test cleanup',
      revokeCredentials: true,
      revokeWebhook: true,
    });
    assert(revoked.readiness?.credentialsReady === false || revoked.credentialsReady === false, 'credential readiness should be false after revocation');
    assert(revoked.readiness?.webhookReady === false || revoked.webhookReady === false, 'webhook readiness should be false after revocation');
  });

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`Workspace contract test suite crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
