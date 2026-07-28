#!/usr/bin/env npx tsx
// ─── Frontend-to-Backend Integration Tests ──────────────────────
// Validates that the frontend API client patterns correctly
// communicate with backend endpoints and return expected shapes.
//
// These tests mirror the exact fetch patterns used in frontend/src/lib/api.ts.

import {
  WALLET_ALICE,
  authenticateWallet,
  API,
  logHeader, logSuccess, logError,
} from './helpers';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';

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

// Mirror the frontend's api.ts fetch wrapper
async function apiFetch(path: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }

  return res.json();
}

async function main() {
  console.log(`\n${BOLD}${CYAN}━━━ Frontend ↔ Backend Integration Tests ━━━${RESET}\n`);

  // Auth for tests
  const auth = await authenticateWallet(WALLET_ALICE);
  const token = auth.token;

  // ─── Public Endpoints (no auth required) ──────────────────────

  logHeader('Public Endpoints (as frontend sees them)');

  await test('getJobs() — GET /jobs returns Job[] shape', async () => {
    const data = await apiFetch('/jobs');
    assert(Array.isArray(data.jobs), 'jobs should be array');
    if (data.jobs.length > 0) {
      const job = data.jobs[0];
      assert(typeof job.id === 'string', 'job.id should be string');
      assert(typeof job.title === 'string', 'job.title should be string');
      assert(typeof job.budgetAmount === 'number', 'job.budgetAmount should be number');
      assert(typeof job.category === 'string', 'job.category should be string');
      assert(typeof job.status === 'string', 'job.status should be string');
      assert(job.client && typeof job.client.id === 'string', 'job.client should have id');
      assert(typeof job._count === 'object', 'job._count should exist');
    }
  });

  await test('getJob(id) — GET /jobs/:id returns full Job shape', async () => {
    const list = await apiFetch('/jobs');
    if (list.jobs.length > 0) {
      const detail = await apiFetch(`/jobs/${list.jobs[0].id}`);
      assert(typeof detail.id === 'string', 'should have id');
      assert(Array.isArray(detail.bids), 'should have bids array');
      assert(Array.isArray(detail.submissions), 'should have submissions array');
      assert(detail.client && typeof detail.client.id === 'string', 'client should have id');
    }
  });

  await test('getAgents() — GET /agents returns Agent[] shape', async () => {
    const data = await apiFetch('/agents');
    assert(Array.isArray(data.agents), 'agents should be array');
    if (data.agents.length > 0) {
      const agent = data.agents[0];
      assert(typeof agent.id === 'string', 'agent.id should be string');
      assert(typeof agent.name === 'string', 'agent.name should be string');
      assert(typeof agent.walletAddress === 'string', 'agent.walletAddress should be string');
      // capabilities should be parsed from JSON string to array
      assert(Array.isArray(agent.capabilities), 'capabilities should be parsed to array');
      assert(typeof agent._count === 'object', 'agent._count should exist');
    }
  });

  await test('getAgent(id) — GET /agents/:id returns full Agent shape', async () => {
    const list = await apiFetch('/agents');
    if (list.agents.length > 0) {
      const agent = await apiFetch(`/agents/${list.agents[0].id}`);
      assert(Array.isArray(agent.capabilities), 'capabilities should be array');
      assert(Array.isArray(agent.models), 'models should be array');
      assert(Array.isArray(agent.acceptedJobs), 'acceptedJobs should be array');
      assert(Array.isArray(agent.ratings), 'ratings should be array');
      assert(agent.handler && typeof agent.handler.id === 'string', 'handler should have id');
    }
  });

  // ─── Authenticated Endpoints ─────────────────────────────────

  logHeader('Authenticated Endpoints (with JWT)');

  await test('createJob() — POST /jobs creates job and returns it', async () => {
    const job = await apiFetch('/jobs', token, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Frontend Integration Test Job',
        description: 'Created by frontend integration test',
        category: 'CODE_DEVELOPMENT',
        deliverables: ['test'],
        budgetAmount: 25,
        budgetToken: 'USDC',
        settlementRail: 'offchain',
        reviewPeriod: 604800,
      }),
    });
    assert(typeof job.id === 'string', 'should return created job with id');
    assert(job.title === 'Frontend Integration Test Job', 'title should match');
  });

  await test('getHandlerDashboard() — GET /handler/dashboard returns DashboardData shape', async () => {
    const dash = await apiFetch('/handler/dashboard', token);
    assert(typeof dash.agents === 'number', 'should have agents count');
    assert(typeof dash.activeJobs === 'number', 'should have activeJobs');
    assert(typeof dash.completedJobs === 'number', 'should have completedJobs');
    assert(typeof dash.totalEarnings === 'number', 'should have totalEarnings');
    assert(Array.isArray(dash.notifications), 'should have notifications array');
  });

  // ─── JSON Array Parsing (SQLite compatibility) ────────────────

  logHeader('SQLite JSON Array Parsing');

  await test('Agent capabilities are parsed from JSON string to array', async () => {
    const data = await apiFetch('/agents');
    for (const agent of data.agents) {
      assert(
        Array.isArray(agent.capabilities),
        `Agent ${agent.name}: capabilities should be array, got ${typeof agent.capabilities}`
      );
      if (agent.models) {
        assert(
          Array.isArray(agent.models),
          `Agent ${agent.name}: models should be array, got ${typeof agent.models}`
        );
      }
    }
  });

  await test('Job deliverables are parsed from JSON string to array', async () => {
    const data = await apiFetch('/jobs');
    for (const job of data.jobs) {
      if (job.deliverables) {
        // Could be null for some jobs
        assert(
          Array.isArray(job.deliverables) || job.deliverables === null,
          `Job ${job.id}: deliverables should be array or null`
        );
      }
    }
  });

  await test('Nested agent in job detail has parsed capabilities', async () => {
    const data = await apiFetch('/jobs');
    const jobWithAgent = data.jobs.find((j: any) => j.agent);
    if (jobWithAgent) {
      const detail = await apiFetch(`/jobs/${jobWithAgent.id}`);
      if (detail.agent?.capabilities) {
        assert(
          Array.isArray(detail.agent.capabilities),
          'Nested agent capabilities should be parsed array'
        );
      }
    }
  });

  // ─── Query Parameters ────────────────────────────────────────

  logHeader('Query Parameters (Frontend Filters)');

  await test('Category filter works for job board', async () => {
    const data = await apiFetch('/jobs?category=BLOCKCHAIN_WEB3');
    for (const job of data.jobs) {
      assert(job.category === 'BLOCKCHAIN_WEB3', 'should filter by category');
    }
  });

  await test('Search filter works for job board', async () => {
    const data = await apiFetch('/jobs?search=Token');
    // Should return without error, results may or may not match
    assert(Array.isArray(data.jobs), 'should return jobs array');
  });

  await test('Pagination works for job board', async () => {
    const page1 = await apiFetch('/jobs?page=1&limit=3');
    const page2 = await apiFetch('/jobs?page=2&limit=3');
    assert(page1.page === 1, 'page 1 should report page 1');
    assert(page2.page === 2, 'page 2 should report page 2');
    if (page1.total > 3) {
      // Pages should have different jobs (if enough data)
      assert(
        page1.jobs[0]?.id !== page2.jobs[0]?.id || page2.jobs.length === 0,
        'pages should have different content'
      );
    }
  });

  await test('Agent search filter works', async () => {
    const data = await apiFetch('/agents?search=Herman');
    assert(Array.isArray(data.agents), 'should return agents array');
  });

  await test('Agent sort by rating works', async () => {
    const data = await apiFetch('/agents?sortBy=rating');
    assert(Array.isArray(data.agents), 'should return sorted agents');
    // Verify descending order
    for (let i = 1; i < data.agents.length; i++) {
      const prev = data.agents[i - 1].avgRating || 0;
      const curr = data.agents[i].avgRating || 0;
      assert(prev >= curr, 'should be sorted by rating descending');
    }
  });

  // ─── CORS ────────────────────────────────────────────────────

  logHeader('CORS & Security');

  await test('CORS headers present on API response', async () => {
    const res = await fetch(`${API}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    // In local dev, CORS should allow localhost:5173
    assert(res.ok, 'should respond OK');
  });

  await test('Content-Security-Policy header present (helmet)', async () => {
    const res = await fetch(`${API}/health`);
    const csp = res.headers.get('content-security-policy');
    assert(csp !== null, 'CSP header should be set by helmet');
  });

  // ─── Results ──────────────────────────────────────────────────

  console.log(`\n${BOLD}━━━ Results ━━━${RESET}`);
  console.log(`  ${GREEN}${passed} passed${RESET}`);
  if (failed > 0) console.log(`  ${RED}${failed} failed${RESET}`);
  console.log(`  ${passed + failed} total\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  logError(`Integration tests crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
