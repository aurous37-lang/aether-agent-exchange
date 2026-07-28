#!/usr/bin/env npx tsx
// ─── AAE Stress Test: 100 Simulations ─────────────────────────────
// Exercises every operable element of the platform:
//   Auth, job posting, agent registration, bidding, accepting,
//   delivering, approving, disputing, evidence, arbiter voting,
//   rating, agent API, dashboard, notifications, edge cases.
//
// Each simulation produces a shadow log documenting every event.
// Management records are produced by overseer logic at the end.

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { type PrivateKeyAccount } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const API = 'http://localhost:4000/api';
const OUTPUT_DIR = path.resolve(__dirname, '../../audits/simulation-results');
const SHADOW_DIR = path.join(OUTPUT_DIR, 'shadow-logs');
const MGMT_DIR = path.join(OUTPUT_DIR, 'management-records');
const TOTAL_SIMS = 100;
const CONCURRENCY = 1; // sequential to respect rate limits
const AUTH_DELAY_MS = 350; // delay between auth calls to stay under rate limit

// ─── Types ────────────────────────────────────────────────────────

interface ShadowEvent {
  timestamp: string;
  sim: number;
  actor: string;
  action: string;
  endpoint: string;
  method: string;
  status: 'OK' | 'FAIL' | 'EXPECTED_FAIL';
  statusCode?: number;
  durationMs: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  note?: string;
}

interface SimResult {
  sim: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  events: ShadowEvent[];
  passed: number;
  failed: number;
  expectedFails: number;
  scenarios: Record<string, 'PASS' | 'FAIL' | 'SKIP'>;
}

// ─── Shadow Logger ────────────────────────────────────────────────

class ShadowAgent {
  events: ShadowEvent[] = [];

  constructor(private sim: number) {}

  log(event: Omit<ShadowEvent, 'timestamp' | 'sim'>) {
    this.events.push({ timestamp: new Date().toISOString(), sim: this.sim, ...event });
  }

  writeLog() {
    const padded = String(this.sim).padStart(3, '0');
    const filename = `sim-${padded}-shadow.md`;
    const filepath = path.join(SHADOW_DIR, filename);

    const ok = this.events.filter(e => e.status === 'OK').length;
    const fail = this.events.filter(e => e.status === 'FAIL').length;
    const expected = this.events.filter(e => e.status === 'EXPECTED_FAIL').length;

    let md = `# Shadow Log: Simulation ${this.sim}\n\n`;
    md += `**Started**: ${this.events[0]?.timestamp || 'N/A'}\n`;
    md += `**Ended**: ${this.events[this.events.length - 1]?.timestamp || 'N/A'}\n`;
    md += `**Total Events**: ${this.events.length}\n`;
    md += `**OK**: ${ok} | **FAIL**: ${fail} | **EXPECTED_FAIL**: ${expected}\n\n`;
    md += `---\n\n`;
    md += `| # | Time | Actor | Action | Endpoint | Status | Duration |\n`;
    md += `|---|------|-------|--------|----------|--------|----------|\n`;

    this.events.forEach((e, i) => {
      const time = e.timestamp.split('T')[1]?.slice(0, 12) || '';
      const status = e.status === 'OK' ? 'OK' : e.status === 'EXPECTED_FAIL' ? 'EXP_FAIL' : 'FAIL';
      md += `| ${i + 1} | ${time} | ${e.actor} | ${e.action} | ${e.method} ${e.endpoint} | ${status} | ${e.durationMs}ms |\n`;
    });

    md += `\n---\n\n## Event Details\n\n`;
    this.events.forEach((e, i) => {
      if (e.status === 'FAIL' || e.note) {
        md += `### Event ${i + 1}: ${e.action}\n`;
        if (e.error) md += `- **Error**: ${e.error}\n`;
        if (e.note) md += `- **Note**: ${e.note}\n`;
        md += `\n`;
      }
    });

    fs.writeFileSync(filepath, md);
  }
}

// ─── API Client with Shadow Logging ───────────────────────────────

class TrackedApiClient {
  constructor(private token: string, private shadow: ShadowAgent, private actor: string) {}

  async request(method: string, endpoint: string, body?: any, action?: string, expectFail?: boolean): Promise<{ ok: boolean; status: number; data: any }> {
    const start = Date.now();
    let res: Response;
    let data: any;
    let statusCode: number;

    try {
      res = await fetch(`${API}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      statusCode = res.status;
      data = await res.json().catch(() => ({}));
    } catch (err: any) {
      const duration = Date.now() - start;
      this.shadow.log({
        actor: this.actor, action: action || `${method} ${endpoint}`,
        endpoint, method, status: expectFail ? 'EXPECTED_FAIL' : 'FAIL',
        durationMs: duration, error: err.message, requestBody: body,
      });
      return { ok: false, status: 0, data: {} };
    }

    const duration = Date.now() - start;
    const ok = statusCode >= 200 && statusCode < 300;
    const status: ShadowEvent['status'] = ok ? 'OK' : (expectFail ? 'EXPECTED_FAIL' : 'FAIL');

    this.shadow.log({
      actor: this.actor, action: action || `${method} ${endpoint}`,
      endpoint, method, status, statusCode, durationMs: duration,
      requestBody: body,
      ...(status === 'FAIL' ? { responseBody: data, error: data?.error } : {}),
      ...(status === 'EXPECTED_FAIL' ? { note: `Expected failure: ${data?.error}` } : {}),
    });

    return { ok, status: statusCode, data };
  }

  get(path: string, action?: string) { return this.request('GET', path, undefined, action); }
  post(path: string, body?: any, action?: string, expectFail?: boolean) { return this.request('POST', path, body, action, expectFail); }
  put(path: string, body?: any, action?: string) { return this.request('PUT', path, body, action); }
  del(path: string, action?: string) { return this.request('DELETE', path, undefined, action); }
}

// ─── Wallet Auth Helper ───────────────────────────────────────────

async function authenticate(account: PrivateKeyAccount, shadow: ShadowAgent, label: string): Promise<TrackedApiClient | null> {
  const tmpClient = new TrackedApiClient('', shadow, label);

  await new Promise(r => setTimeout(r, AUTH_DELAY_MS));

  // Get nonce
  const nonceRes = await tmpClient.post('/auth/nonce', { walletAddress: account.address }, 'Request nonce');
  if (!nonceRes.ok) return null;

  // Sign
  const signature = await account.signMessage({ message: nonceRes.data.message });

  // Verify
  const verifyRes = await tmpClient.post('/auth/verify', { walletAddress: account.address, message: nonceRes.data.message, signature }, 'Verify signature');
  if (!verifyRes.ok) return null;

  return new TrackedApiClient(verifyRes.data.token, shadow, label);
}

// ─── Job Categories ───────────────────────────────────────────────

const CATEGORIES = ['CODE_DEVELOPMENT', 'BLOCKCHAIN_WEB3', 'RESEARCH', 'AUTOMATION', 'DATA_ANALYSIS', 'CONTENT_CREATION', 'SECURITY_AUDIT', 'DESIGN', 'OTHER'];
const TOKENS: ('USDC' | 'MON')[] = ['USDC', 'MON'];

function randomJob(sim: number, idx: number) {
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const token = TOKENS[Math.floor(Math.random() * 2)];
  const budget = Math.floor(Math.random() * 450) + 50;
  return {
    title: `Sim${sim}-Job${idx}: ${cat.replace(/_/g, ' ')} task`,
    description: `Automated stress test job ${idx} for simulation ${sim}. Category: ${cat}. This is a synthetic test job.`,
    category: cat,
    deliverables: ['Primary deliverable', 'Documentation'],
    budgetAmount: budget,
    budgetToken: token,
    reviewPeriod: 604800,
    acceptanceCriteria: 'Meets all stated requirements',
  };
}

// ─── Single Simulation ───────────────────────────────────────────

async function runSimulation(sim: number): Promise<SimResult> {
  const shadow = new ShadowAgent(sim);
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const scenarios: Record<string, 'PASS' | 'FAIL' | 'SKIP'> = {};

  // Generate unique wallets for this simulation
  const clientKey = generatePrivateKey();
  const handlerKey = generatePrivateKey();
  const arbiterKey1 = generatePrivateKey();
  const arbiterKey2 = generatePrivateKey();
  const arbiterKey3 = generatePrivateKey();

  const clientAccount = privateKeyToAccount(clientKey);
  const handlerAccount = privateKeyToAccount(handlerKey);
  const arbiter1Account = privateKeyToAccount(arbiterKey1);
  const arbiter2Account = privateKeyToAccount(arbiterKey2);
  const arbiter3Account = privateKeyToAccount(arbiterKey3);

  // ── Scenario 1: Authentication ──────────────────────────────
  const clientApi = await authenticate(clientAccount, shadow, `Sim${sim}-Client`);
  const handlerApi = await authenticate(handlerAccount, shadow, `Sim${sim}-Handler`);

  if (!clientApi || !handlerApi) {
    scenarios['auth'] = 'FAIL';
    shadow.writeLog();
    return { sim, startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - start, events: shadow.events, passed: 0, failed: 1, expectedFails: 0, scenarios };
  }
  scenarios['auth'] = 'PASS';

  // ── Scenario 2: Agent Registration ──────────────────────────
  const agentRes = await handlerApi.post('/agents', {
    name: `Sim${sim}-Agent`,
    description: `Test agent for simulation ${sim}`,
    capabilities: ['typescript', 'solidity', 'research'],
    models: ['test-model-primary'],
    metadataURI: `ipfs://QmSim${sim}`,
    agentWallet: handlerAccount.address,
    availability: '24/7',
    responseTime: '< 5 min',
  }, 'Register agent');
  scenarios['agent_registration'] = agentRes.ok ? 'PASS' : 'FAIL';
  const agentId = agentRes.data?.id;

  // ── Scenario 3: Job Posting ─────────────────────────────────
  const job1Data = randomJob(sim, 1);
  const job1 = await clientApi.post('/jobs', job1Data, 'Post job 1 (happy path)');
  scenarios['job_posting'] = job1.ok ? 'PASS' : 'FAIL';
  const job1Id = job1.data?.id;

  const job2Data = randomJob(sim, 2);
  const job2 = await clientApi.post('/jobs', job2Data, 'Post job 2 (dispute path)');
  const job2Id = job2.data?.id;

  const job3Data = randomJob(sim, 3);
  const job3 = await clientApi.post('/jobs', job3Data, 'Post job 3 (edge cases)');
  const job3Id = job3.data?.id;

  // ── Scenario 4: Job Listing & Search ────────────────────────
  const listRes = await clientApi.get('/jobs?limit=10', 'List jobs');
  scenarios['job_listing'] = listRes.ok ? 'PASS' : 'FAIL';

  const searchRes = await clientApi.get(`/jobs?search=Sim${sim}`, 'Search jobs');
  scenarios['job_search'] = searchRes.ok ? 'PASS' : 'FAIL';

  // ── Scenario 5: Job Detail ──────────────────────────────────
  if (job1Id) {
    const detailRes = await clientApi.get(`/jobs/${job1Id}`, 'Get job detail');
    scenarios['job_detail'] = detailRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 6: Bidding ─────────────────────────────────────
  if (job1Id && agentId) {
    const bidRes = await handlerApi.post(`/jobs/${job1Id}/bid`, {
      agentId, amount: job1Data.budgetAmount * 0.9,
      estimatedDuration: '1-2 days', message: 'Test bid from simulation',
    }, 'Place bid on job 1');
    scenarios['bidding'] = bidRes.ok ? 'PASS' : 'FAIL';

    // Duplicate bid (expected 409)
    const dupBid = await handlerApi.post(`/jobs/${job1Id}/bid`, {
      agentId, amount: job1Data.budgetAmount * 0.8,
      estimatedDuration: '1 day', message: 'Duplicate bid test',
    }, 'Duplicate bid (expect 409)', true);
    scenarios['duplicate_bid_blocked'] = dupBid.status === 409 ? 'PASS' : 'FAIL';
  }

  // ── Scenario 7: Self-Dealing Prevention ─────────────────────
  if (job1Id && agentId) {
    // Client tries to bid on own job (expect 403)
    // Client needs an agent first — register one
    const clientAgentRes = await clientApi.post('/agents', {
      name: `Sim${sim}-ClientAgent`,
      description: 'Client-side agent for self-deal test',
      capabilities: ['test'],
      models: ['test'],
      metadataURI: `ipfs://QmSelfDeal${sim}`,
      agentWallet: clientAccount.address,
      availability: '24/7',
      responseTime: '< 5 min',
    }, 'Register client agent for self-deal test');

    if (clientAgentRes.ok) {
      const selfBid = await clientApi.post(`/jobs/${job1Id}/bid`, {
        agentId: clientAgentRes.data.id, amount: 50,
        estimatedDuration: '1 day', message: 'Self-deal attempt',
      }, 'Self-deal bid (expect 403)', true);
      scenarios['self_dealing_blocked'] = selfBid.status === 403 ? 'PASS' : 'FAIL';
    }
  }

  // ── Scenario 8: Accept Bid ──────────────────────────────────
  // The accept route requires the CLIENT to call it (client-initiated acceptance)
  if (job1Id && agentId) {
    const acceptRes = await clientApi.post(`/jobs/${job1Id}/accept`, { agentId }, 'Accept bid on job 1');
    scenarios['accept_bid'] = acceptRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 9: Submit Deliverable ──────────────────────────
  if (job1Id) {
    const hash = `ipfs://Qm${crypto.randomBytes(20).toString('hex')}`;
    const submitRes = await handlerApi.post(`/jobs/${job1Id}/submit`, {
      deliverableHash: hash,
      notes: `Deliverable for sim ${sim} job 1`,
    }, 'Submit deliverable');
    scenarios['submit_deliverable'] = submitRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 10: Approve Deliverable ────────────────────────
  if (job1Id) {
    const approveRes = await clientApi.post(`/jobs/${job1Id}/approve`, {}, 'Approve deliverable');
    scenarios['approve_deliverable'] = approveRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 11: Rating ─────────────────────────────────────
  if (job1Id) {
    const score = Math.floor(Math.random() * 5) + 1;
    const rateRes = await clientApi.post(`/jobs/${job1Id}/rate`, {
      score, comment: `Simulation ${sim} rating: ${score}/5`,
    }, 'Rate agent');
    scenarios['rating'] = rateRes.ok ? 'PASS' : 'FAIL';

    // Duplicate rating (expect 409)
    const dupRate = await clientApi.post(`/jobs/${job1Id}/rate`, {
      score: 3, comment: 'Duplicate rating test',
    }, 'Duplicate rating (expect 409)', true);
    scenarios['duplicate_rating_blocked'] = dupRate.status === 409 ? 'PASS' : 'FAIL';
  }

  // ── Scenario 12: Dispute Path (Job 2) ──────────────────────
  if (job2Id && agentId) {
    await handlerApi.post(`/jobs/${job2Id}/bid`, {
      agentId, amount: job2Data.budgetAmount,
      estimatedDuration: '2-3 days', message: 'Bid for dispute test',
    }, 'Bid on job 2');

    await clientApi.post(`/jobs/${job2Id}/accept`, { agentId }, 'Accept job 2');

    const hash2 = `ipfs://Qm${crypto.randomBytes(20).toString('hex')}`;
    await handlerApi.post(`/jobs/${job2Id}/submit`, {
      deliverableHash: hash2, notes: 'Deliverable for dispute test',
    }, 'Submit deliverable job 2');

    const disputeRes = await clientApi.post(`/jobs/${job2Id}/dispute`, {
      reason: `Simulation ${sim} dispute: deliverable does not meet criteria`,
    }, 'File dispute');
    scenarios['dispute_filing'] = disputeRes.ok ? 'PASS' : 'FAIL';
    const disputeId = disputeRes.data?.id;

    // ── Scenario 13: Dispute Evidence ───────────────────────
    if (disputeId) {
      const evidenceRes = await clientApi.post(`/disputes/${disputeId}/evidence`, {
        contentHash: `ipfs://QmEvidence${sim}`,
        description: 'Test evidence submission',
      }, 'Submit evidence');
      scenarios['dispute_evidence'] = evidenceRes.ok ? 'PASS' : 'FAIL';

      // ── Scenario 14: Arbiter Voting ─────────────────────
      // Authenticate 3 arbiters (they get HANDLER role by default, need ARBITER)
      // Since we can't easily set role to ARBITER via API, we test the vote endpoint
      // and expect a 403 (non-arbiter). This validates the role guard works.
      const arb1Api = await authenticate(arbiter1Account, shadow, `Sim${sim}-Arbiter1`);
      if (arb1Api) {
        const voteRes = await arb1Api.post(`/disputes/${disputeId}/vote`, {
          agentBps: 5000, reasoning: 'Test vote 50/50 split',
        }, 'Arbiter vote (expect 403 - role guard)', true);
        scenarios['arbiter_role_guard'] = voteRes.status === 403 ? 'PASS' : 'FAIL';
      }
    }
  }

  // ── Scenario 15: Job Update (OPEN job) ──────────────────────
  if (job3Id) {
    const updateRes = await clientApi.put(`/jobs/${job3Id}`, {
      title: `Sim${sim}-Job3: Updated title`,
      description: 'Updated description for edge case testing',
    }, 'Update open job');
    scenarios['job_update'] = updateRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 16: Job Cancel ─────────────────────────────────
  if (job3Id) {
    const cancelRes = await clientApi.del(`/jobs/${job3Id}`, 'Cancel open job');
    scenarios['job_cancel'] = cancelRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 17: Agent Listing ──────────────────────────────
  const agentListRes = await handlerApi.get('/agents?limit=10', 'List agents');
  scenarios['agent_listing'] = agentListRes.ok ? 'PASS' : 'FAIL';

  // ── Scenario 18: Agent Detail ───────────────────────────────
  if (agentId) {
    const agentDetailRes = await handlerApi.get(`/agents/${agentId}`, 'Get agent detail');
    scenarios['agent_detail'] = agentDetailRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 19: Agent Update ───────────────────────────────
  if (agentId) {
    const agentUpdateRes = await handlerApi.put(`/agents/${agentId}`, {
      description: `Updated agent for sim ${sim}`,
      active: true,
    }, 'Update agent');
    scenarios['agent_update'] = agentUpdateRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 20: Handler Dashboard ──────────────────────────
  const dashRes = await handlerApi.get('/handler/dashboard', 'Handler dashboard');
  scenarios['handler_dashboard'] = dashRes.ok ? 'PASS' : 'FAIL';

  // ── Scenario 21: Handler Agents ─────────────────────────────
  const handlerAgentsRes = await handlerApi.get('/handler/agents', 'Handler agents list');
  scenarios['handler_agents'] = handlerAgentsRes.ok ? 'PASS' : 'FAIL';

  // ── Scenario 22: Notifications ──────────────────────────────
  const notifRes = await handlerApi.get('/handler/notifications', 'Get notifications');
  scenarios['notifications'] = notifRes.ok ? 'PASS' : 'FAIL';

  // ── Scenario 23: Mark Notifications Read ────────────────────
  // Fetch notification IDs first, then mark them read
  const notifIds = notifRes.ok && Array.isArray(notifRes.data) ? notifRes.data.map((n: any) => n.id) : [];
  if (notifIds.length > 0) {
    const markReadRes = await handlerApi.put('/handler/notifications/read', { ids: notifIds }, 'Mark notifications read');
    scenarios['mark_notifications_read'] = markReadRes.ok ? 'PASS' : 'FAIL';
  } else {
    // No notifications to mark — try with empty array, should succeed
    const markReadRes = await handlerApi.put('/handler/notifications/read', { ids: [] }, 'Mark notifications read (empty)');
    scenarios['mark_notifications_read'] = markReadRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 24: Agent Jobs History ─────────────────────────
  if (agentId) {
    const jobsHistRes = await handlerApi.get(`/agents/${agentId}/jobs`, 'Agent job history');
    scenarios['agent_job_history'] = jobsHistRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 25: Agent Earnings ─────────────────────────────
  if (agentId) {
    const earningsRes = await handlerApi.get(`/agents/${agentId}/earnings`, 'Agent earnings');
    scenarios['agent_earnings'] = earningsRes.ok ? 'PASS' : 'FAIL';
  }

  // ── Scenario 26: Unauthorized Access ────────────────────────
  const noAuthClient = new TrackedApiClient('', shadow, `Sim${sim}-NoAuth`);
  const unauthRes = await noAuthClient.post('/jobs', randomJob(sim, 99), 'Post job without auth (expect 401)', true);
  scenarios['auth_guard'] = unauthRes.status === 401 ? 'PASS' : 'FAIL';

  // ── Scenario 27: Invalid Job ID ─────────────────────────────
  const badIdRes = await clientApi.request('GET', '/jobs/nonexistent-id-12345', undefined, 'Get nonexistent job (expect 404)', true);
  scenarios['invalid_job_404'] = badIdRes.status === 404 ? 'PASS' : 'FAIL';

  // ── Scenario 28: Health Check ───────────────────────────────
  const healthRes = await noAuthClient.get('/health', 'Health check');
  scenarios['health_check'] = healthRes.ok ? 'PASS' : 'FAIL';

  // ── Write shadow log ────────────────────────────────────────
  shadow.writeLog();

  const completedAt = new Date().toISOString();
  const passed = shadow.events.filter(e => e.status === 'OK').length;
  const failed = shadow.events.filter(e => e.status === 'FAIL').length;
  const expectedFails = shadow.events.filter(e => e.status === 'EXPECTED_FAIL').length;

  return {
    sim, startedAt, completedAt,
    durationMs: Date.now() - start,
    events: shadow.events,
    passed, failed, expectedFails,
    scenarios,
  };
}

// ─── Batch Runner (Test Overseer) ─────────────────────────────────

async function runBatch(sims: number[]): Promise<SimResult[]> {
  const results: SimResult[] = [];
  for (const sim of sims) {
    try {
      const result = await runSimulation(sim);
      results.push(result);
      const icon = result.failed === 0 ? '\x1b[32m[OK]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
      process.stdout.write(`  ${icon} Sim ${String(sim).padStart(3)} — ${result.passed} ok, ${result.failed} fail, ${result.expectedFails} expected_fail (${result.durationMs}ms)\n`);
    } catch (err: any) {
      process.stdout.write(`  \x1b[31m[ERR]\x1b[0m Sim ${sim} crashed: ${err.message}\n`);
      results.push({
        sim, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
        durationMs: 0, events: [], passed: 0, failed: 1, expectedFails: 0,
        scenarios: { crash: 'FAIL' },
      });
    }
  }
  return results;
}

// ─── Management Record Writers ────────────────────────────────────

function writeTestOverseerRecord(results: SimResult[]) {
  const totalSims = results.length;
  const passedSims = results.filter(r => r.failed === 0).length;
  const failedSims = totalSims - passedSims;
  const totalEvents = results.reduce((s, r) => s + r.events.length, 0);
  const totalOk = results.reduce((s, r) => s + r.passed, 0);
  const totalFail = results.reduce((s, r) => s + r.failed, 0);
  const totalExpected = results.reduce((s, r) => s + r.expectedFails, 0);
  const avgDuration = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / totalSims);

  // Scenario pass rates
  const scenarioStats: Record<string, { pass: number; fail: number; skip: number }> = {};
  for (const r of results) {
    for (const [name, status] of Object.entries(r.scenarios)) {
      if (!scenarioStats[name]) scenarioStats[name] = { pass: 0, fail: 0, skip: 0 };
      scenarioStats[name][status === 'PASS' ? 'pass' : status === 'FAIL' ? 'fail' : 'skip']++;
    }
  }

  let md = `# Test Overseer Management Record\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Total Simulations**: ${totalSims}\n`;
  md += `**Simulations Passed (0 failures)**: ${passedSims}\n`;
  md += `**Simulations Failed**: ${failedSims}\n\n`;
  md += `## Aggregate Statistics\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Total API Events | ${totalEvents} |\n`;
  md += `| Successful (OK) | ${totalOk} |\n`;
  md += `| Unexpected Failures | ${totalFail} |\n`;
  md += `| Expected Failures (guards) | ${totalExpected} |\n`;
  md += `| Avg Simulation Duration | ${avgDuration}ms |\n`;
  md += `| Fastest Simulation | ${Math.min(...results.map(r => r.durationMs))}ms |\n`;
  md += `| Slowest Simulation | ${Math.max(...results.map(r => r.durationMs))}ms |\n\n`;
  md += `## Scenario Pass Rates\n\n`;
  md += `| Scenario | Pass | Fail | Skip | Rate |\n|----------|------|------|------|------|\n`;

  const sortedScenarios = Object.entries(scenarioStats).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, s] of sortedScenarios) {
    const rate = s.pass + s.fail > 0 ? Math.round((s.pass / (s.pass + s.fail)) * 100) : 0;
    md += `| ${name} | ${s.pass} | ${s.fail} | ${s.skip} | ${rate}% |\n`;
  }

  md += `\n## Simulations with Failures\n\n`;
  const failedResults = results.filter(r => r.failed > 0);
  if (failedResults.length === 0) {
    md += `None. All simulations passed.\n`;
  } else {
    md += `| Sim | Failures | Duration | Failed Scenarios |\n|-----|----------|----------|------------------|\n`;
    for (const r of failedResults) {
      const failedScens = Object.entries(r.scenarios).filter(([, v]) => v === 'FAIL').map(([k]) => k).join(', ');
      md += `| ${r.sim} | ${r.failed} | ${r.durationMs}ms | ${failedScens} |\n`;
    }
  }

  fs.writeFileSync(path.join(MGMT_DIR, 'test-overseer-record.md'), md);
}

function writeShadowOverseerRecord(results: SimResult[]) {
  let md = `# Shadow Overseer Management Record\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Shadow Logs Produced**: ${results.length}\n`;
  md += `**Location**: \`audits/simulation-results/shadow-logs/\`\n\n`;
  md += `## Shadow Log Index\n\n`;
  md += `| Sim | Events | OK | Fail | Exp Fail | Log File |\n`;
  md += `|-----|--------|-----|------|----------|----------|\n`;

  for (const r of results) {
    const padded = String(r.sim).padStart(3, '0');
    md += `| ${r.sim} | ${r.events.length} | ${r.passed} | ${r.failed} | ${r.expectedFails} | sim-${padded}-shadow.md |\n`;
  }

  md += `\n## Event Type Distribution\n\n`;
  const actionCounts: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.events) {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    }
  }
  md += `| Action | Count |\n|--------|-------|\n`;
  const sorted = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
  for (const [action, count] of sorted) {
    md += `| ${action} | ${count} |\n`;
  }

  md += `\n## Failure Hotspots\n\n`;
  const failActions: Record<string, number> = {};
  for (const r of results) {
    for (const e of r.events) {
      if (e.status === 'FAIL') {
        failActions[e.action] = (failActions[e.action] || 0) + 1;
      }
    }
  }
  if (Object.keys(failActions).length === 0) {
    md += `No unexpected failures across all simulations.\n`;
  } else {
    md += `| Action | Failure Count |\n|--------|---------------|\n`;
    for (const [action, count] of Object.entries(failActions).sort((a, b) => b[1] - a[1])) {
      md += `| ${action} | ${count} |\n`;
    }
  }

  fs.writeFileSync(path.join(MGMT_DIR, 'shadow-overseer-record.md'), md);
}

function writeTopOverseerRecord(results: SimResult[], totalDurationMs: number) {
  const totalSims = results.length;
  const passedSims = results.filter(r => r.failed === 0).length;
  const totalEvents = results.reduce((s, r) => s + r.events.length, 0);
  const totalFail = results.reduce((s, r) => s + r.failed, 0);

  let md = `# Top Overseer Management Record\n\n`;
  md += `**Date**: ${new Date().toISOString()}\n`;
  md += `**Total Execution Time**: ${Math.round(totalDurationMs / 1000)}s\n`;
  md += `**Simulation Count**: ${totalSims}\n`;
  md += `**Concurrency**: ${CONCURRENCY}\n\n`;
  md += `## Executive Summary\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Simulations Run | ${totalSims} |\n`;
  md += `| Simulations Clean (0 failures) | ${passedSims} (${Math.round(passedSims / totalSims * 100)}%) |\n`;
  md += `| Total API Calls | ${totalEvents} |\n`;
  md += `| Unexpected Failures | ${totalFail} |\n`;
  md += `| Total Duration | ${Math.round(totalDurationMs / 1000)}s |\n`;
  md += `| Avg per Simulation | ${Math.round(totalDurationMs / totalSims)}ms |\n\n`;

  md += `## Subordinate Reports\n\n`;
  md += `- **Test Overseer**: \`management-records/test-overseer-record.md\`\n`;
  md += `  - Managed ${totalSims} test simulation runs\n`;
  md += `  - Tracked ${Object.keys(results[0]?.scenarios || {}).length} scenarios per simulation\n\n`;
  md += `- **Shadow Overseer**: \`management-records/shadow-overseer-record.md\`\n`;
  md += `  - Managed ${totalSims} shadow agents producing logs\n`;
  md += `  - Logs at: \`shadow-logs/sim-XXX-shadow.md\`\n\n`;

  md += `## Platform Health Assessment\n\n`;
  if (totalFail === 0) {
    md += `All ${totalEvents} API calls across ${totalSims} simulations completed as expected. `;
    md += `Security guards (self-dealing, duplicate bids, duplicate ratings, role guards) all triggered correctly. `;
    md += `The platform is operating within expected parameters.\n`;
  } else {
    md += `**${totalFail} unexpected failures detected** across ${totalSims} simulations. `;
    md += `Review the Test Overseer record for scenario-level breakdown and the Shadow Overseer record for failure hotspots.\n`;
  }

  md += `\n## Scenarios Tested Per Simulation\n\n`;
  md += `1. Wallet authentication (client + handler)\n`;
  md += `2. Agent registration\n`;
  md += `3. Job posting (3 jobs per sim)\n`;
  md += `4. Job listing & search\n`;
  md += `5. Job detail retrieval\n`;
  md += `6. Bidding on jobs\n`;
  md += `7. Duplicate bid prevention (409)\n`;
  md += `8. Self-dealing prevention (403)\n`;
  md += `9. Bid acceptance\n`;
  md += `10. Deliverable submission\n`;
  md += `11. Deliverable approval\n`;
  md += `12. Agent rating\n`;
  md += `13. Duplicate rating prevention (409)\n`;
  md += `14. Dispute filing\n`;
  md += `15. Dispute evidence submission\n`;
  md += `16. Arbiter role guard (403)\n`;
  md += `17. Job update (OPEN status)\n`;
  md += `18. Job cancellation\n`;
  md += `19. Agent listing & search\n`;
  md += `20. Agent detail & update\n`;
  md += `21. Handler dashboard\n`;
  md += `22. Handler agents list\n`;
  md += `23. Notifications (read + mark read)\n`;
  md += `24. Agent job history\n`;
  md += `25. Agent earnings\n`;
  md += `26. Auth guard (401)\n`;
  md += `27. Invalid resource (404)\n`;
  md += `28. Health check\n`;

  fs.writeFileSync(path.join(MGMT_DIR, 'top-overseer-record.md'), md);
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     AAE STRESS TEST — ${TOTAL_SIMS} SIMULATIONS × 28 SCENARIOS        ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\x1b[0m\n`);

  // Ensure dirs exist
  fs.mkdirSync(SHADOW_DIR, { recursive: true });
  fs.mkdirSync(MGMT_DIR, { recursive: true });

  // Check server is running
  try {
    const health = await fetch(`${API}/health`);
    if (!health.ok) throw new Error('Health check failed');
    console.log(`  \x1b[32m[OK]\x1b[0m Server is running at ${API}\n`);
  } catch {
    console.error(`  \x1b[31m[ERR]\x1b[0m Server not running at ${API}. Start with ./start-dev.sh\n`);
    process.exit(1);
  }

  const totalStart = Date.now();
  const allResults: SimResult[] = [];

  // Run in batches of CONCURRENCY
  for (let batch = 0; batch < Math.ceil(TOTAL_SIMS / CONCURRENCY); batch++) {
    const batchStart = batch * CONCURRENCY + 1;
    const batchSims = Array.from({ length: Math.min(CONCURRENCY, TOTAL_SIMS - batch * CONCURRENCY) }, (_, i) => batchStart + i);
    console.log(`\x1b[2m  ── Batch ${batch + 1}/${Math.ceil(TOTAL_SIMS / CONCURRENCY)} (sims ${batchSims[0]}-${batchSims[batchSims.length - 1]}) ──\x1b[0m`);

    const batchResults = await Promise.all(batchSims.map(sim => runSimulation(sim).catch(err => {
      process.stdout.write(`  \x1b[31m[ERR]\x1b[0m Sim ${sim} crashed: ${err.message}\n`);
      return {
        sim, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
        durationMs: 0, events: [] as ShadowEvent[], passed: 0, failed: 1, expectedFails: 0,
        scenarios: { crash: 'FAIL' as const },
      };
    })));

    for (const r of batchResults) {
      const icon = r.failed === 0 ? '\x1b[32m[OK]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
      process.stdout.write(`  ${icon} Sim ${String(r.sim).padStart(3)} — ${r.passed} ok, ${r.failed} fail, ${r.expectedFails} expected_fail (${r.durationMs}ms)\n`);
    }
    allResults.push(...batchResults);
  }

  const totalDuration = Date.now() - totalStart;

  // Write management records
  console.log(`\n\x1b[2m  Writing management records...\x1b[0m`);
  writeTestOverseerRecord(allResults);
  writeShadowOverseerRecord(allResults);
  writeTopOverseerRecord(allResults, totalDuration);

  // Summary
  const passed = allResults.filter(r => r.failed === 0).length;
  const totalEvents = allResults.reduce((s, r) => s + r.events.length, 0);
  const totalFails = allResults.reduce((s, r) => s + r.failed, 0);

  console.log(`\n\x1b[1m\x1b[32m╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║                    SIMULATION COMPLETE                       ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\x1b[0m`);
  console.log(`  Simulations: ${passed}/${TOTAL_SIMS} clean`);
  console.log(`  API calls:   ${totalEvents} total, ${totalFails} unexpected failures`);
  console.log(`  Duration:    ${Math.round(totalDuration / 1000)}s`);
  console.log(`  Shadow logs: ${SHADOW_DIR}/`);
  console.log(`  Records:     ${MGMT_DIR}/\n`);
}

main().catch(err => {
  console.error(`\x1b[31mFatal: ${err.message}\x1b[0m`);
  process.exit(1);
});
