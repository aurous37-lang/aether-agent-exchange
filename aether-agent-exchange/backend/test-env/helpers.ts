// ─── Test Environment Helpers ─────────────────────────────────────
// Wallet auth, API client, and balance tracking for local testing.

import { createWalletClient, http, type PrivateKeyAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import prisma from '../src/lib/prisma';
import { CHAINS } from '../src/config/chains';
import { persistEscrowLifecycleEvent } from '../src/services/chainIndexer';
import { amountToUnits } from '../src/services/settlement';

export const API_BASE_URL = (process.env.AAE_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
export const API = `${API_BASE_URL}/api`;

// ─── Two Deterministic Test Wallets ─────────────────────────────

// Hardhat default accounts — well-known test keys, never use on mainnet
export const WALLET_ALICE = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
);
export const WALLET_BOB = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
);

// ─── Fake Currency Ledger ───────────────────────────────────────

export class FakeLedger {
  private balances: Map<string, { USDC: number; MON: number }> = new Map();

  fund(wallet: string, usdc: number, mon: number) {
    const addr = wallet.toLowerCase();
    const existing = this.balances.get(addr) || { USDC: 0, MON: 0 };
    this.balances.set(addr, {
      USDC: existing.USDC + usdc,
      MON: existing.MON + mon,
    });
  }

  balance(wallet: string): { USDC: number; MON: number } {
    return this.balances.get(wallet.toLowerCase()) || { USDC: 0, MON: 0 };
  }

  transfer(from: string, to: string, amount: number, token: 'USDC' | 'MON'): boolean {
    const fromBal = this.balance(from);
    if (fromBal[token] < amount) return false;

    const toBal = this.balance(to);
    fromBal[token] -= amount;
    toBal[token] += amount;

    this.balances.set(from.toLowerCase(), fromBal);
    this.balances.set(to.toLowerCase(), toBal);
    return true;
  }

  // Simulate escrow payout with 1.7% platform fee
  escrowPayout(clientWallet: string, agentWallet: string, amount: number, token: 'USDC' | 'MON'): {
    success: boolean;
    agentReceived: number;
    platformFee: number;
  } {
    const fee = Math.round(amount * 0.017 * 100) / 100;
    const agentPayout = Math.round((amount - fee) * 100) / 100;

    const fromBal = this.balance(clientWallet);
    if (fromBal[token] < amount) {
      return { success: false, agentReceived: 0, platformFee: 0 };
    }

    fromBal[token] -= amount;
    this.balances.set(clientWallet.toLowerCase(), fromBal);

    const agentBal = this.balance(agentWallet);
    agentBal[token] += agentPayout;
    this.balances.set(agentWallet.toLowerCase(), agentBal);

    // Platform treasury
    const treasury = this.balance('0x0000000000000000000000000000000000000001');
    treasury[token] += fee;
    this.balances.set('0x0000000000000000000000000000000000000001', treasury);

    return { success: true, agentReceived: agentPayout, platformFee: fee };
  }

  print() {
    console.log('\n  Ledger Balances:');
    for (const [addr, bal] of this.balances.entries()) {
      if (bal.USDC > 0 || bal.MON > 0) {
        const label = addr === '0x0000000000000000000000000000000000000001' ? 'Platform Treasury' : addr.slice(0, 10) + '...';
        console.log(`    ${label}: ${bal.USDC} USDC, ${bal.MON} MON`);
      }
    }
  }
}

// ─── Wallet Auth ────────────────────────────────────────────────

export async function authenticateWallet(account: PrivateKeyAccount): Promise<{
  token: string;
  user: { id: string; walletAddress: string; role: string; displayName: string | null };
}> {
  // Step 1: Get nonce (retry on rate limit)
  let nonceData: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const nonceRes = await fetch(`${API}/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: account.address }),
    });
    nonceData = await nonceRes.json();
    if (nonceData.message) break;
    if (nonceData.error?.includes('Too many')) {
      await sleep(2000);
      continue;
    }
    throw new Error(`Nonce request failed: ${JSON.stringify(nonceData)}`);
  }

  if (!nonceData?.message) {
    throw new Error(`Could not get nonce after retries: ${JSON.stringify(nonceData)}`);
  }

  // Step 2: Sign the message
  const signature = await account.signMessage({ message: nonceData.message });

  // Step 3: Verify and get JWT
  const verifyRes = await fetch(`${API}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: account.address, message: nonceData.message, signature }),
  });

  if (!verifyRes.ok) {
    throw new Error(`Auth failed: ${await verifyRes.text()}`);
  }

  const auth = await verifyRes.json();
  await acceptAllConsents(auth.token);
  return auth;
}

export async function acceptAllConsents(token: string): Promise<void> {
  const res = await fetch(`${API}/auth/accept-terms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ consentTypes: ['terms', 'privacy', 'risk', 'disclosure'] }),
  });

  if (!res.ok) {
    throw new Error(`Consent acceptance failed: ${await res.text()}`);
  }
}

// ─── Typed API Client ───────────────────────────────────────────

export class ApiClient {
  constructor(private token: string) {}

  private async request(method: string, path: string, body?: any): Promise<any> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
    }
    return data;
  }

  get(path: string) { return this.request('GET', path); }
  post(path: string, body?: any) { return this.request('POST', path, body); }
  put(path: string, body?: any) { return this.request('PUT', path, body); }
  del(path: string) { return this.request('DELETE', path); }
}

// ─── Logging Utilities ──────────────────────────────────────────

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function logStep(icon: string, msg: string) {
  console.log(`  ${CYAN}${icon}${RESET} ${msg}`);
}

export function logSuccess(msg: string) {
  console.log(`  ${GREEN}[OK]${RESET} ${msg}`);
}

export function logWarn(msg: string) {
  console.log(`  ${YELLOW}[!!]${RESET} ${msg}`);
}

export function logError(msg: string) {
  console.log(`  ${RED}[ERR]${RESET} ${msg}`);
}

export function logHeader(title: string) {
  console.log(`\n${BOLD}${MAGENTA}━━━ ${title} ━━━${RESET}`);
}

export function logDim(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`);
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function hashForFixture(seed: string, fill: string): string {
  const hexSeed = seed.replace(/[^a-fA-F0-9]/g, '');
  return `0x${(hexSeed + fill.repeat(64)).slice(0, 64)}`;
}

function lifecycleTxHash(seed: string, eventName: string, index: number): string {
  return hashForFixture(`${seed}-${eventName}-${index}`, 'a');
}

function lifecycleBlockHash(seed: string, index: number): string {
  return hashForFixture(`${seed}-block-${index}`, 'b');
}

const DEFAULT_TEST_ESCROW_FACTORY = '0x000000000000000000000000000000000000faca';
const DEFAULT_TEST_ERC8183_FACTORY = '0x0000000000000000000000000000000000008183';

function fixtureAmountGross(job: { budgetAmount?: number | string; budgetToken?: string | null }): string {
  return amountToUnits(job.budgetAmount || 1, job.budgetToken).toString();
}

function isFactoryCreationEvent(eventName: string): boolean {
  return eventName === 'EscrowCreated' || eventName === 'JobCreated';
}

export async function seedIndexedEscrowLifecycleEvent(
  job: { id: string; network?: string; chainId?: number; escrowAddress?: string | null; onchainJobId?: string | null; budgetToken?: string; tokenAddress?: string | null; escrowContractVersion?: string | null },
  eventName: string,
  index: number,
  overrides: Record<string, any> = {},
) {
  const network = job.network || overrides.network || 'base-sepolia';
  const chain = CHAINS[network as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported lifecycle seed network ${network}`);

  const escrowAddress = (overrides.escrowAddress || job.escrowAddress || `0x${job.id.replace(/[^a-fA-F0-9]/g, '').padEnd(40, '0').slice(0, 40)}`).toLowerCase();
  const onchainJobId = (overrides.onchainJobId || job.onchainJobId || hashForFixture(job.id, 'f')).toLowerCase();
  const factoryAddress = (overrides.factoryAddress || DEFAULT_TEST_ESCROW_FACTORY).toLowerCase();
  const contractAddress = overrides.contractAddress || (isFactoryCreationEvent(eventName) ? factoryAddress : escrowAddress);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      escrowAddress,
      onchainJobId,
    },
  });

  return persistEscrowLifecycleEvent({
    chainKey: chain.key,
    chainId: job.chainId || chain.chainId,
    caip2Network: chain.caip2Network,
    txHash: overrides.txHash || lifecycleTxHash(job.id, eventName, index),
    logIndex: overrides.logIndex ?? index,
    blockNumber: overrides.blockNumber || 10_000 + index,
    blockHash: overrides.blockHash || lifecycleBlockHash(job.id, index),
    transactionIndex: overrides.transactionIndex ?? 0,
    contractAddress,
    factoryAddress: isFactoryCreationEvent(eventName) ? factoryAddress : overrides.factoryAddress,
    escrowAddress,
    eventName,
    onchainJobId,
    actorAddress: overrides.actorAddress,
    clientAddress: overrides.clientAddress,
    agentAddress: overrides.agentAddress,
    recipientAddress: overrides.recipientAddress,
    amountGross: overrides.amountGross,
    agentPayout: overrides.agentPayout,
    platformFee: overrides.platformFee,
    tokenAddress: overrides.tokenAddress ?? (isFactoryCreationEvent(eventName) ? job.tokenAddress : undefined),
    tokenSymbol: overrides.tokenSymbol || job.budgetToken,
    escrowContractVersion: overrides.escrowContractVersion ?? job.escrowContractVersion,
    factoryBound: overrides.factoryBound ?? isFactoryCreationEvent(eventName),
    factoryBindingStatus: overrides.factoryBindingStatus || (isFactoryCreationEvent(eventName) ? 'FACTORY_EVENT_VERIFIED' : undefined),
    decodedArgs: overrides.decodedArgs || { jobId: onchainJobId },
    finalityStatus: overrides.finalityStatus || 'FINAL',
    confirmations: overrides.confirmations ?? 12,
  });
}

export async function seedIndexedEscrowCreated(job: any, overrides: Record<string, any> = {}) {
  const amountGross = overrides.amountGross || fixtureAmountGross(job);
  const escrowAddress = overrides.escrowAddress || job.escrowAddress;
  const onchainJobId = overrides.onchainJobId || job.onchainJobId || hashForFixture(job.id, 'f');
  return seedIndexedEscrowLifecycleEvent(job, 'EscrowCreated', overrides.index ?? 0, {
    amountGross,
    clientAddress: overrides.clientAddress || WALLET_ALICE.address,
    decodedArgs: {
      jobId: onchainJobId,
      escrow: escrowAddress,
      client: overrides.clientAddress || WALLET_ALICE.address,
      amount: amountGross,
    },
    ...overrides,
  });
}

export async function seedIndexedEscrowFunded(job: any, overrides: Record<string, any> = {}) {
  if (overrides.includeCreation !== false) {
    await seedIndexedEscrowCreated(job, {
      escrowAddress: overrides.escrowAddress,
      onchainJobId: overrides.onchainJobId,
      amountGross: overrides.amountGross || fixtureAmountGross(job),
      clientAddress: overrides.clientAddress || WALLET_ALICE.address,
      tokenAddress: overrides.tokenAddress,
      tokenSymbol: overrides.tokenSymbol,
      escrowContractVersion: overrides.escrowContractVersion,
      factoryAddress: overrides.factoryAddress,
      index: overrides.createdIndex ?? 0,
      logIndex: overrides.createdLogIndex ?? 0,
      blockNumber: overrides.createdBlockNumber,
      txHash: overrides.createdTxHash,
    });
  }
  return seedIndexedEscrowLifecycleEvent(job, 'EscrowFunded', overrides.index || 1, {
    amountGross: overrides.amountGross || fixtureAmountGross(job),
    clientAddress: overrides.clientAddress || WALLET_ALICE.address,
    decodedArgs: { jobId: job.onchainJobId || hashForFixture(job.id, 'f'), client: overrides.clientAddress || WALLET_ALICE.address },
    ...overrides,
  });
}

export async function seedIndexedErc8183EscrowCreated(job: any, overrides: Record<string, any> = {}) {
  const amountGross = overrides.amountGross || fixtureAmountGross(job);
  const escrowAddress = overrides.escrowAddress || job.escrowAddress;
  const onchainJobId = overrides.onchainJobId || job.onchainJobId || hashForFixture(job.id, 'f');
  return seedIndexedEscrowLifecycleEvent({
    ...job,
    escrowContractVersion: 'erc8183',
  }, 'JobCreated', overrides.index ?? 0, {
    clientAddress: overrides.clientAddress || WALLET_ALICE.address,
    decodedArgs: {
      jobId: onchainJobId,
      escrow: escrowAddress,
      client: overrides.clientAddress || WALLET_ALICE.address,
      amount: amountGross,
    },
    factoryAddress: overrides.factoryAddress || DEFAULT_TEST_ERC8183_FACTORY,
    escrowContractVersion: 'erc8183',
    tokenAddress: overrides.tokenAddress ?? job.tokenAddress,
    ...overrides,
  });
}

export async function seedIndexedErc8183EscrowFunded(job: any, overrides: Record<string, any> = {}) {
  if (overrides.includeCreation !== false) {
    await seedIndexedErc8183EscrowCreated(job, {
      escrowAddress: overrides.escrowAddress,
      onchainJobId: overrides.onchainJobId,
      amountGross: overrides.amountGross || fixtureAmountGross(job),
      clientAddress: overrides.clientAddress || WALLET_ALICE.address,
      tokenAddress: overrides.tokenAddress ?? job.tokenAddress,
      tokenSymbol: overrides.tokenSymbol,
      factoryAddress: overrides.factoryAddress,
      index: overrides.createdIndex ?? 0,
      logIndex: overrides.createdLogIndex ?? 0,
      blockNumber: overrides.createdBlockNumber,
      txHash: overrides.createdTxHash,
    });
  }
  return seedIndexedEscrowLifecycleEvent({
    ...job,
    escrowContractVersion: 'erc8183',
  }, 'JobFunded', overrides.index || 1, {
    amountGross: overrides.amountGross || fixtureAmountGross(job),
    clientAddress: overrides.clientAddress || WALLET_ALICE.address,
    tokenAddress: overrides.tokenAddress ?? job.tokenAddress,
    tokenSymbol: overrides.tokenSymbol || job.budgetToken,
    escrowContractVersion: 'erc8183',
    decodedArgs: { jobId: job.onchainJobId || hashForFixture(job.id, 'f'), client: overrides.clientAddress || WALLET_ALICE.address },
    ...overrides,
  });
}

export async function seedIndexedEscrowStarted(job: any, agentId: string, overrides: Record<string, any> = {}) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error(`Cannot seed WorkStarted for missing agent ${agentId}`);
  return seedIndexedEscrowLifecycleEvent(job, 'WorkStarted', overrides.index || 2, {
    agentAddress: agent.walletAddress,
    decodedArgs: { jobId: job.onchainJobId || hashForFixture(job.id, 'f'), agentId: agent.agentId },
    ...overrides,
  });
}

export async function seedIndexedEscrowDelivered(job: any, deliverableHash: string, overrides: Record<string, any> = {}) {
  return seedIndexedEscrowLifecycleEvent(job, 'DeliverableSubmitted', overrides.index || 3, {
    decodedArgs: { jobId: job.onchainJobId || hashForFixture(job.id, 'f'), deliverableHash },
    ...overrides,
  });
}

export async function seedIndexedErc8183EscrowDelivered(job: any, deliverableHash: string, overrides: Record<string, any> = {}) {
  return seedIndexedEscrowLifecycleEvent({
    ...job,
    escrowContractVersion: 'erc8183',
  }, 'JobSubmitted', overrides.index || 3, {
    agentAddress: overrides.agentAddress,
    tokenAddress: overrides.tokenAddress ?? job.tokenAddress,
    tokenSymbol: overrides.tokenSymbol || job.budgetToken,
    escrowContractVersion: 'erc8183',
    decodedArgs: { jobId: job.onchainJobId || hashForFixture(job.id, 'f'), provider: overrides.agentAddress, deliverable: deliverableHash },
    ...overrides,
  });
}

export async function seedIndexedEscrowReleased(job: any, overrides: Record<string, any> = {}) {
  return seedIndexedEscrowLifecycleEvent(job, 'JobApproved', overrides.index || 4, {
    agentPayout: overrides.agentPayout || String(Math.max(1, Number(job.budgetAmount || 1) * 983_000)),
    platformFee: overrides.platformFee || String(Math.max(1, Number(job.budgetAmount || 1) * 17_000)),
    decodedArgs: {
      jobId: job.onchainJobId || hashForFixture(job.id, 'f'),
      agentPayout: overrides.agentPayout || '983000',
      platformFee: overrides.platformFee || '17000',
    },
    ...overrides,
  });
}

export async function seedIndexedErc8183EscrowReleased(job: any, overrides: Record<string, any> = {}) {
  return seedIndexedEscrowLifecycleEvent({
    ...job,
    escrowContractVersion: 'erc8183',
  }, 'JobCompleted', overrides.index || 4, {
    agentPayout: overrides.agentPayout,
    platformFee: overrides.platformFee,
    tokenAddress: overrides.tokenAddress ?? job.tokenAddress,
    tokenSymbol: overrides.tokenSymbol || job.budgetToken,
    escrowContractVersion: 'erc8183',
    decodedArgs: {
      jobId: job.onchainJobId || hashForFixture(job.id, 'f'),
      evaluator: overrides.evaluatorAddress || WALLET_ALICE.address,
      reason: overrides.reason || hashForFixture(job.id, '9'),
    },
    ...overrides,
  });
}

export async function seedEscrowLifecycleProjection(job: any, state: string, overrides: Record<string, any> = {}) {
  const network = job.network || overrides.network || 'base-sepolia';
  const chain = CHAINS[network as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported lifecycle projection network ${network}`);

  const escrowAddress = (overrides.escrowAddress || job.escrowAddress || `0x${job.id.replace(/[^a-fA-F0-9]/g, '').padEnd(40, '0').slice(0, 40)}`).toLowerCase();
  const onchainJobId = (overrides.onchainJobId || job.onchainJobId || hashForFixture(job.id, 'f')).toLowerCase();
  const txHash = overrides.txHash || lifecycleTxHash(job.id, state, overrides.index || 99);
  const blockNumber = String(overrides.blockNumber || 20_000 + (overrides.index || 99));
  const logIndex = overrides.logIndex ?? overrides.index ?? 99;

  return (prisma as any).escrowLifecycleState.upsert({
    where: {
      chainId_escrowAddress: {
        chainId: job.chainId || chain.chainId,
        escrowAddress,
      },
    },
    update: {
      job: { connect: { id: job.id } },
      state,
      finalityStatus: overrides.finalityStatus || 'FINAL',
      confirmations: overrides.confirmations ?? 12,
      latestTxHash: txHash,
      latestBlockNumber: blockNumber,
      latestLogIndex: logIndex,
      onchainJobId,
      tokenSymbol: overrides.tokenSymbol || job.budgetToken,
      tokenAddress: overrides.tokenAddress,
      escrowContractVersion: overrides.escrowContractVersion || job.escrowContractVersion,
      amountGross: overrides.amountGross,
      lastIndexedAt: new Date(),
    },
    create: {
      job: { connect: { id: job.id } },
      chainKey: chain.key,
      chainId: job.chainId || chain.chainId,
      caip2Network: chain.caip2Network,
      escrowAddress,
      onchainJobId,
      escrowContractVersion: overrides.escrowContractVersion || job.escrowContractVersion,
      tokenAddress: overrides.tokenAddress,
      tokenSymbol: overrides.tokenSymbol || job.budgetToken,
      amountGross: overrides.amountGross,
      state,
      finalityStatus: overrides.finalityStatus || 'FINAL',
      confirmations: overrides.confirmations ?? 12,
      latestTxHash: txHash,
      latestBlockNumber: blockNumber,
      latestLogIndex: logIndex,
      lastIndexedAt: new Date(),
    },
  });
}

export function baseSepoliaFundingProof(input: {
  jobId: string;
  txHash: string;
  receiptHash?: string;
  escrowAddress: string;
  amountAtomic: string;
  tokenAddress?: string | null;
  nativeValue?: string;
  status?: 'success' | 'failed';
  condition?: 'funding' | 'release' | 'payment';
}) {
  const condition = input.condition || 'funding';
  const released = condition === 'release' || condition === 'payment';
  return {
    provider: 'fixture',
    network: 'base-sepolia',
    chainId: 84532,
    txHash: input.txHash,
    receiptHash: input.receiptHash,
    status: input.status || 'success',
    to: input.escrowAddress,
    value: input.nativeValue || '0',
    condition,
    logs: [{
      address: input.escrowAddress,
      eventName: released ? 'PaymentReleased' : 'EscrowFunded',
      args: {
        aaeJobId: input.jobId,
        amount: input.amountAtomic,
      },
      logIndex: 0,
    }],
    contractState: {
      address: input.escrowAddress,
      state: released ? 'COMPLETED' : 'FUNDED',
      escrowAmount: input.amountAtomic,
      ...(input.tokenAddress ? { paymentToken: input.tokenAddress } : {}),
    },
  };
}
