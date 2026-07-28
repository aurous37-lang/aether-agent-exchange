// ─── Test Client ─────────────────────────────────────────────────
// A script-based client that posts jobs, reviews deliverables,
// approves work, and rates agents — simulating a real marketplace user.

import { type PrivateKeyAccount } from 'viem';
import {
  authenticateWallet, ApiClient, FakeLedger,
  logStep, logSuccess, logDim,
  baseSepoliaFundingProof, hashForFixture,
} from './helpers';

export interface ClientConfig {
  account: PrivateKeyAccount;
  displayName: string;
}

export class TestClient {
  private api!: ApiClient;
  private userId!: string;

  constructor(private config: ClientConfig, private ledger: FakeLedger) {}

  async init(): Promise<void> {
    logStep('🔑', `Client "${this.config.displayName}" authenticating as ${this.config.account.address.slice(0, 10)}...`);
    const auth = await authenticateWallet(this.config.account);
    this.api = new ApiClient(auth.token);
    this.userId = auth.user.id;
    logSuccess(`Authenticated (userId: ${this.userId.slice(0, 8)}...)`);

    // Accept platform consents (required by the 451 gating middleware).
    try {
      await this.api.post('/auth/accept-terms', {
        consentTypes: ['terms', 'privacy', 'risk', 'disclosure'],
      });
      logDim(`  Consents accepted for ${this.config.displayName}`);
    } catch {
      // Already accepted or non-blocking — continue.
    }
  }

  async postJob(job: {
    title: string;
    description: string;
    category: string;
    deliverables: string[];
    budgetAmount: number;
    budgetToken: 'USDC' | 'MON' | 'ETH';
    acceptanceCriteria?: string;
  }): Promise<{ id: string; title: string }> {
    logStep('📋', `"${this.config.displayName}" posting job: "${job.title}" ($${job.budgetAmount} ${job.budgetToken})`);

    // Check fake balance
    const bal = this.ledger.balance(this.config.account.address);
    if (bal[job.budgetToken] < job.budgetAmount) {
      throw new Error(`Insufficient ${job.budgetToken} balance: have ${bal[job.budgetToken]}, need ${job.budgetAmount}`);
    }

    const created = await this.api.post('/jobs', {
      title: job.title,
      description: job.description,
      category: job.category,
      deliverables: job.deliverables,
      budgetAmount: job.budgetAmount,
      budgetToken: job.budgetToken,
      settlementRail: 'offchain',
      reviewPeriod: 604800,
      acceptanceCriteria: job.acceptanceCriteria || 'Meets all stated requirements',
    });

    logSuccess(`Job created: ${created.id} — "${created.title}"`);
    logDim(`  Budget: $${job.budgetAmount} ${job.budgetToken} (held in simulated escrow)`);
    return { id: created.id, title: created.title };
  }

  async acceptBid(jobId: string, agentId: string): Promise<void> {
    logStep('🤝', `"${this.config.displayName}" accepting bid from agent ${agentId.slice(0, 8)}... on job ${jobId.slice(0, 8)}...`);
    await this.api.post(`/jobs/${jobId}/accept`, { agentId });
    logSuccess('Bid accepted — job is now IN_PROGRESS');
  }

  async viewBids(jobId: string): Promise<any[]> {
    logStep('👀', `"${this.config.displayName}" checking bids on job ${jobId}...`);
    const job = await this.api.get(`/jobs/${jobId}`);
    const bids = job.bids || [];
    for (const bid of bids) {
      logDim(`  Bid: $${bid.amount} from ${bid.agent?.name || 'Unknown'} — "${bid.message?.slice(0, 60)}..."`);
    }
    return bids;
  }

  async approveDeliverable(jobId: string, agentWallet: string, amount: number, token: 'USDC' | 'MON' | 'ETH'): Promise<void> {
    logStep('✅', `"${this.config.displayName}" approving deliverable for job ${jobId}...`);

    const job = await this.api.get(`/jobs/${jobId}`);
    if (job.budgetAmount > 0 && ['standard', 'erc8183'].includes(job.settlementRail || 'standard')) {
      const txHash = '0x' + jobId.replace(/-/g, '').padEnd(64, '0').slice(0, 64);
      const receiptHash = hashForFixture(jobId, '8');
      const escrowAddress = job.escrowAddress || '0x0000000000000000000000000000000000008453';
      await this.api.post(`/jobs/${jobId}/settlement-receipts`, {
        receipt: `simulated-settlement-${jobId}`,
        rail: job.settlementRail || 'standard',
        amount,
        tokenSymbol: token,
        walletAddress: this.config.account.address,
        escrowAddress,
        txHash,
        receiptHash,
        chainId: job.chainId || 84532,
        network: job.network || 'base-sepolia',
        status: 'SETTLED',
        redactedReference: `sim:${jobId.slice(0, 8)}`,
        verificationProof: baseSepoliaFundingProof({
          jobId,
          txHash,
          receiptHash,
          escrowAddress,
          amountAtomic: token === 'ETH' ? String(Math.round(amount * 1_000_000_000_000_000_000)) : String(Math.round(amount * 1_000_000)),
          nativeValue: token === 'ETH' ? String(Math.round(amount * 1_000_000_000_000_000_000)) : undefined,
        }),
      });
    }

    const result = await this.api.post(`/jobs/${jobId}/approve`);

    // Simulate escrow payout
    const payout = this.ledger.escrowPayout(
      this.config.account.address,
      agentWallet,
      amount,
      token,
    );

    logSuccess(`Deliverable approved!`);
    logDim(`  Agent received: $${payout.agentReceived} ${token}`);
    logDim(`  Platform fee:   $${payout.platformFee} ${token} (1.7%)`);
  }

  async rateAgent(jobId: string, score: number, comment: string): Promise<void> {
    logStep('⭐', `"${this.config.displayName}" rating job ${jobId}: ${score}/5`);
    await this.api.post(`/jobs/${jobId}/rate`, { score, comment });
    logSuccess(`Rated ${score}/5 — "${comment}"`);
  }

  async disputeJob(jobId: string, reason: string): Promise<any> {
    logStep('⚠️', `"${this.config.displayName}" disputing job ${jobId}...`);
    const dispute = await this.api.post(`/jobs/${jobId}/dispute`, { reason });
    logSuccess(`Dispute opened: ${dispute.id}`);
    return dispute;
  }

  async viewDashboard(): Promise<any> {
    // Use the public jobs endpoint since CLIENT role can't access handler dashboard
    const { jobs: allJobs } = await this.api.get('/jobs?limit=100');
    const myJobs = allJobs.filter((j: any) => j.client?.id === this.userId);

    return {
      totalPosted: myJobs.length,
      open: myJobs.filter((j: any) => j.status === 'OPEN').length,
      inProgress: myJobs.filter((j: any) => j.status === 'IN_PROGRESS').length,
      pendingReview: myJobs.filter((j: any) => j.status === 'PENDING_REVIEW').length,
      completed: myJobs.filter((j: any) => j.status === 'COMPLETED').length,
      totalSpent: myJobs
        .filter((j: any) => j.status === 'COMPLETED')
        .reduce((sum: number, j: any) => sum + j.budgetAmount, 0),
    };
  }

  get id() { return this.userId; }
  get wallet() { return this.config.account.address; }
  get name() { return this.config.displayName; }
}
