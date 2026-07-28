#!/usr/bin/env npx tsx
// Controlled backend test runner:
// - resets an isolated SQLite DB
// - starts the backend on a known port
// - waits for /api/health
// - runs API, integration, simulation, and invariant suites
// - always tears the server down

import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import net from 'net';
import path from 'path';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const YELLOW = '\x1b[33m';

const backendDir = path.resolve(__dirname, '..');
const tsxCli = path.join(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
const preloader = './test-env/prisma-test-datasource.cjs';
const testPort = Number(process.env.AAE_TEST_PORT || '4100');
const apiBaseUrl = `http://127.0.0.1:${testPort}`;
const tmpDir = path.join(backendDir, 'test-env', '.tmp');
const testDbPath = path.resolve(process.env.AAE_TEST_DB_PATH || path.join(tmpDir, 'aae-test.db'));
const testDbUrl = `file:${testDbPath.replace(/\\/g, '/')}`;
const testSchemaPath = path.join(tmpDir, 'schema.test.prisma');
const prismaBackupDir = path.join(tmpDir, 'prisma-client-backup');
const generatedClientDirs = [
  { source: path.join(backendDir, 'node_modules', '.prisma', 'client'), backupName: 'dot-prisma-client' },
  { source: path.join(backendDir, 'node_modules', '@prisma', 'client'), backupName: 'at-prisma-client' },
];

const skipSim = process.argv.includes('--skip-sim');
const onlyInvariants = process.argv.includes('--only-invariants');
const skipSeed = process.argv.includes('--skip-seed');
const includeWorkspaceContracts = process.env.AAE_ENABLE_WORKSPACE_CONTRACT_TESTS === 'true';
const includeLiveTestnetAgentWallets = process.env.AAE_ENABLE_LIVE_TESTNET_AGENT_WALLET_TESTS === 'true';
const includeLiveBaseSepoliaReceiptIndexer = process.env.AAE_ENABLE_LIVE_BASE_SEPOLIA_RECEIPT_INDEXER_TESTS === 'true';

const suites = onlyInvariants
  ? [{ name: 'Invariant Tests', script: 'test-env/invariant-tests.ts', timeoutMs: 120_000 }]
  : [
      { name: 'Settlement Receipt Verifier Tests', script: 'test-env/test-settlement-verifier.ts', timeoutMs: 120_000 },
      { name: 'Chain Indexer Projection Tests', script: 'test-env/test-chain-indexer.ts', timeoutMs: 120_000 },
      { name: 'Stablecoin Provider Boundary Tests', script: 'test-env/test-stablecoin-providers.ts', timeoutMs: 120_000 },
      { name: 'Robinhood Chain Config Tests', script: 'test-env/test-robinhood-chain.ts', timeoutMs: 120_000 },
      { name: 'Backend API Tests', script: 'test-env/test-backend.ts', timeoutMs: 120_000 },
      { name: 'Base MCP Rails Tests', script: 'test-env/test-mcp-rails.ts', timeoutMs: 120_000 },
      { name: 'Frontend API Integration', script: 'test-env/test-frontend-api.ts', timeoutMs: 120_000 },
      ...(includeWorkspaceContracts ? [{ name: 'Contract-Bound Workspace Acceptance', script: 'test-env/test-contract-workspaces.ts', timeoutMs: 120_000 }] : []),
      ...(includeLiveTestnetAgentWallets ? [{ name: 'Live Testnet Agent Wallet Exercise', script: 'test-env/test-live-testnet-agent-wallets.ts', timeoutMs: 120_000 }] : []),
      ...(includeLiveBaseSepoliaReceiptIndexer ? [{ name: 'Live Base Sepolia Receipt Indexer Exercise', script: 'test-env/test-live-base-sepolia-receipt-indexer.ts', timeoutMs: 120_000 }] : []),
      ...(!skipSim ? [{ name: 'Full Lifecycle Simulation', script: 'test-env/simulate.ts', timeoutMs: 180_000 }] : []),
      { name: 'Invariant Tests', script: 'test-env/invariant-tests.ts', timeoutMs: 120_000 },
    ];

function env(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const nodeOptions = [process.env.NODE_OPTIONS, `--require ${preloader}`].filter(Boolean).join(' ');

  return {
    ...process.env,
    ...extra,
    AAE_API_BASE_URL: apiBaseUrl,
    AAE_TEST_DATABASE_URL: testDbUrl,
    NODE_ENV: 'test',
    NODE_OPTIONS: nodeOptions,
    PORT: String(testPort),
    AAE_ACTIVE_CHAIN: process.env.AAE_ACTIVE_CHAIN || 'base-sepolia',
    ACTIVE_CHAIN: process.env.ACTIVE_CHAIN || 'base-sepolia',
    SETTLEMENT_NETWORK: process.env.SETTLEMENT_NETWORK || 'base-sepolia',
    AAE_BASE_SEPOLIA_USDC_TOKEN_ADDRESS: process.env.AAE_BASE_SEPOLIA_USDC_TOKEN_ADDRESS || '0x7D60207c8b23Df81c4512cC2ffcd30DED775AA0f',
    RATE_LIMIT_AUTH: '10000',
    RATE_LIMIT_USER: '10000',
    RATE_LIMIT_AGENT: '10000',
    RATE_LIMIT_WRITE: '10000',
    RATE_LIMIT_NONCE: '10000',
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || 'test-github-workspace-webhook-secret',
    GITLAWB_WEBHOOK_SECRET: process.env.GITLAWB_WEBHOOK_SECRET || 'test-gitlawb-workspace-webhook-secret',
  };
}

function run(command: string, args: string[], label: string): void {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env: env(),
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function node(args: string[]): [string, string[]] {
  return [process.execPath, args];
}

function removeSqliteFiles(dbPath: string): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) {
      rmSync(target, { force: true });
    }
  }
}

function backupPrismaClient(): void {
  rmSync(prismaBackupDir, { recursive: true, force: true });
  mkdirSync(prismaBackupDir, { recursive: true });

  for (const entry of generatedClientDirs) {
    if (existsSync(entry.source)) {
      cpSync(entry.source, path.join(prismaBackupDir, entry.backupName), { recursive: true });
    }
  }
}

async function restorePrismaClient(): Promise<void> {
  if (!existsSync(prismaBackupDir)) return;

  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      for (const entry of generatedClientDirs) {
        const backup = path.join(prismaBackupDir, entry.backupName);
        if (existsSync(backup)) {
          cpSync(backup, entry.source, { recursive: true, force: true });
        }
      }
      return;
    } catch (err) {
      if (attempt === 10) {
        console.warn(`${YELLOW}Warning: could not restore generated Prisma Client after tests: ${(err as Error).message}${RESET}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

function writeTestSchema(): void {
  mkdirSync(tmpDir, { recursive: true });

  const source = readFileSync(path.join(backendDir, 'prisma', 'schema.prisma'), 'utf8');
  let rewritten = source.replace(/url\s+=\s+"file:\.\/dev\.db"/, 'url      = env("AAE_TEST_DATABASE_URL")');

  if (source === rewritten) {
    throw new Error('Could not rewrite Prisma datasource URL for isolated test DB');
  }

  rewritten = keepFirstModelDefinition(rewritten, 'PaymentLedger');

  writeFileSync(testSchemaPath, rewritten, 'utf8');
}

function keepFirstModelDefinition(schema: string, modelName: string): string {
  const marker = `model ${modelName} `;
  let searchFrom = 0;
  let seen = false;
  let result = '';

  while (true) {
    const start = schema.indexOf(marker, searchFrom);
    if (start === -1) {
      result += schema.slice(searchFrom);
      return result;
    }

    const openBrace = schema.indexOf('{', start);
    if (openBrace === -1) {
      result += schema.slice(searchFrom);
      return result;
    }

    let depth = 0;
    let end = openBrace;
    for (; end < schema.length; end++) {
      if (schema[end] === '{') depth++;
      if (schema[end] === '}') {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }

    if (!seen) {
      result += schema.slice(searchFrom, end);
      seen = true;
    } else {
      result += schema.slice(searchFrom, start);
      while (schema[end] === '\r' || schema[end] === '\n') end++;
    }

    searchFrom = end;
  }
}

async function assertPortFree(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is already in use; set AAE_TEST_PORT to another known port.`)));
    probe.once('listening', () => probe.close(() => resolve()));
    probe.listen(port, '127.0.0.1');
  });
}

async function waitForHealth(server: ChildProcess): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError = '';

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Backend server exited before health check passed (exit code ${server.exitCode})`);
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/health`);
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err: any) {
      lastError = err.message;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Backend did not become healthy within 60s (${lastError})`);
}

async function stopServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.exitCode !== null) return;

  console.log(`${DIM}Stopping backend server (PID ${server.pid})...${RESET}`);
  server.kill('SIGTERM');

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
      resolve();
    }, 5_000);

    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function resetDatabase(): Promise<void> {
  console.log(`${DIM}[1/4] Resetting isolated SQLite DB: ${testDbPath}${RESET}`);
  writeTestSchema();
  removeSqliteFiles(testDbPath);

  run(...node([prismaCli, 'db', 'push', '--schema', testSchemaPath, '--skip-generate']), 'Prisma db push');
  run(...node([prismaCli, 'generate', '--schema', testSchemaPath]), 'Prisma generate');

  if (!skipSeed) {
    run(...node([tsxCli, 'prisma/seed.ts']), 'Prisma seed');
  }

  console.log(`${GREEN}  Database ready.${RESET}`);
}

function startServer(): ChildProcess {
  console.log(`${DIM}[2/4] Starting backend on ${apiBaseUrl}...${RESET}`);

  const child = spawn(process.execPath, [tsxCli, 'src/server.ts'], {
    cwd: backendDir,
    env: env(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  child.stdout?.on('data', chunk => process.stdout.write(`${DIM}${chunk}${RESET}`));
  child.stderr?.on('data', chunk => process.stderr.write(`${YELLOW}${chunk}${RESET}`));

  return child;
}

function runSuite(name: string, script: string, timeoutMs: number): boolean {
  console.log(`\n${BOLD}${CYAN}> Running: ${name}${RESET}`);
  console.log(`${DIM}  Script: ${script}${RESET}\n`);

  const result = spawnSync(process.execPath, [tsxCli, script], {
    cwd: backendDir,
    env: env(),
    stdio: 'inherit',
    timeout: timeoutMs,
    shell: false,
  });

  if (result.error) {
    console.log(`  ${RED}FAILED${RESET} ${name}: ${result.error.message}\n`);
    return false;
  }

  if (result.status === 0) {
    console.log(`  ${GREEN}PASSED${RESET} ${name}\n`);
    return true;
  }

  console.log(`  ${RED}FAILED${RESET} ${name} (exit code ${result.status})\n`);
  return false;
}

async function main(): Promise<void> {
  console.log(`
${BOLD}${CYAN}=== Aether Backend Controlled Test Runner ===${RESET}
${DIM}Port: ${testPort}
DB:   ${testDbPath}
API:  ${apiBaseUrl}/api${RESET}
`);

  let server: ChildProcess | null = null;
  let allPassed = true;

  try {
    backupPrismaClient();
    await assertPortFree(testPort);
    await resetDatabase();

    server = startServer();
    console.log(`${DIM}[3/4] Waiting for /api/health...${RESET}`);
    await waitForHealth(server);
    console.log(`${GREEN}  Backend is healthy.${RESET}`);

    console.log(`${DIM}[4/4] Running ${suites.length} suite(s)...${RESET}`);
    for (const suite of suites) {
      allPassed = runSuite(suite.name, suite.script, suite.timeoutMs) && allPassed;
    }
  } finally {
    await stopServer(server);
    await restorePrismaClient();
  }

  console.log(`\n${BOLD}Final Result${RESET}`);
  if (allPassed) {
    console.log(`${GREEN}All selected backend suites passed.${RESET}\n`);
    process.exit(0);
  }

  console.log(`${RED}One or more backend suites failed.${RESET}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`${RED}${err.message}${RESET}`);
  process.exit(1);
});
