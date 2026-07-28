// ─── Dummy Agent ─────────────────────────────────────────────────
// A script-based AI agent that behaves like a real autonomous agent:
// 1. Authenticates via wallet signature
// 2. Registers itself (or reuses existing)
// 3. Polls for available jobs matching its capabilities
// 4. Bids on matching jobs
// 5. When assigned, executes "work" (simulated) and submits deliverables

import { type PrivateKeyAccount } from 'viem';
import {
  authenticateWallet, ApiClient,
  logStep, logSuccess, logWarn, logDim, sleep,
} from './helpers';

export interface AgentConfig {
  account: PrivateKeyAccount;
  name: string;
  description: string;
  capabilities: string[];
  models: string[];
  bidStrategy: 'undercut' | 'match' | 'premium';
  workDurationMs: number; // simulated work time
}

export class DummyAgent {
  private api!: ApiClient;
  private userId!: string;
  private agentDbId!: string;
  private running = false;

  constructor(private config: AgentConfig) {}

  async init(): Promise<void> {
    // Authenticate
    logStep('🔑', `Agent "${this.config.name}" authenticating as ${this.config.account.address.slice(0, 10)}...`);
    const auth = await authenticateWallet(this.config.account);
    this.api = new ApiClient(auth.token);
    this.userId = auth.user.id;
    logSuccess(`Authenticated (userId: ${this.userId.slice(0, 8)}...)`);

    // Accept platform consents (required by the 451 gating middleware).
    // All four types must be accepted to unlock agent creation + job posting.
    try {
      await this.api.post('/auth/accept-terms', {
        consentTypes: ['terms', 'privacy', 'risk', 'disclosure'],
      });
      logDim(`  Consents accepted for ${this.config.name}`);
    } catch (e: any) {
      if (!String(e.message || '').includes('409')) {
        logWarn(`Consent acceptance failed: ${e.message}`);
      }
    }

    // Register agent (or find existing)
    try {
      const agent = await this.api.post('/agents', {
        name: this.config.name,
        description: this.config.description,
        capabilities: this.config.capabilities,
        models: this.config.models,
        metadataURI: `ipfs://Qm${this.config.name}Meta`,
        agentWallet: this.config.account.address,
        availability: '24/7',
        responseTime: '< 1 minute',
      });
      this.agentDbId = agent.id;
      logSuccess(`Registered agent: ${agent.name} (id: ${agent.id})`);
    } catch (e: any) {
      if (e.message.includes('409') || e.message.includes('already registered')) {
        // Already registered — find it
        const agents = await this.api.get('/handler/agents');
        const existing = agents.find((a: any) =>
          a.walletAddress?.toLowerCase() === this.config.account.address.toLowerCase()
        ) || agents[0];
        if (existing) {
          this.agentDbId = existing.id;
          logWarn(`Agent already registered, reusing: ${existing.name} (id: ${existing.id})`);
        } else {
          throw new Error('Agent registered but not found in handler agents');
        }
      } else {
        throw e;
      }
    }
  }

  async scanAndBid(): Promise<{ jobId: string; title: string; bidAmount: number } | null> {
    logStep('🔍', `"${this.config.name}" scanning for open jobs...`);
    const { jobs } = await this.api.get('/jobs?status=OPEN&limit=50');

    if (!jobs.length) {
      logDim('No open jobs found');
      return null;
    }

    logDim(`Found ${jobs.length} open jobs`);

    // Pick first job that hasn't been bid on by this agent
    for (const job of jobs) {
      // Check if we already bid
      const detail = await this.api.get(`/jobs/${job.id}`);
      const alreadyBid = detail.bids?.some((b: any) => b.agentId === this.agentDbId);
      if (alreadyBid) continue;

      // Calculate bid based on strategy
      let bidAmount = job.budgetAmount;
      switch (this.config.bidStrategy) {
        case 'undercut': bidAmount = Math.round(job.budgetAmount * 0.9); break;
        case 'match':    bidAmount = job.budgetAmount; break;
        case 'premium':  bidAmount = Math.round(job.budgetAmount * 1.1); break;
      }

      logStep('💰', `Bidding $${bidAmount} on "${job.title}" (budget: $${job.budgetAmount})`);

      await this.api.post(`/jobs/${job.id}/bid`, {
        agentId: this.agentDbId,
        amount: bidAmount,
        estimatedDuration: '1-2 days',
        message: `Hi! I'm ${this.config.name}, an autonomous AI agent. I can deliver this within my estimated timeframe. My capabilities include: ${this.config.capabilities.join(', ')}.`,
      });

      logSuccess(`Bid placed on job ${job.id}`);
      return { jobId: job.id, title: job.title, bidAmount };
    }

    logDim('No un-bid jobs available');
    return null;
  }

  async acceptJob(jobId: string): Promise<boolean> {
    logStep('🤝', `"${this.config.name}" accepting job ${jobId}...`);
    try {
      await this.api.post(`/jobs/${jobId}/accept`, { agentId: this.agentDbId });
      logSuccess(`Job ${jobId} accepted`);
      return true;
    } catch (e: any) {
      logWarn(`Could not accept: ${e.message}`);
      return false;
    }
  }

  async doWork(jobId: string): Promise<string> {
    logStep('⚙️', `"${this.config.name}" working on job ${jobId}...`);

    const stages = ['Analyzing requirements', 'Generating solution', 'Running quality checks', 'Packaging deliverables'];
    const stageTime = this.config.workDurationMs / stages.length;

    for (const stage of stages) {
      logDim(`  → ${stage}...`);
      await sleep(stageTime);
    }

    // Generate a fake deliverable hash
    const hash = `ipfs://Qm${Buffer.from(jobId + Date.now().toString()).toString('hex').slice(0, 40)}`;
    logSuccess(`Work complete. Deliverable: ${hash.slice(0, 30)}...`);
    return hash;
  }

  async submitDeliverable(jobId: string, deliverableHash: string): Promise<void> {
    logStep('📤', `"${this.config.name}" submitting deliverable for job ${jobId}...`);
    await this.api.post(`/jobs/${jobId}/submit`, {
      deliverableHash,
      notes: `Completed by ${this.config.name}. All acceptance criteria met. Deliverable hash: ${deliverableHash}`,
    });
    logSuccess('Deliverable submitted — awaiting client review');
  }

  // Work cycle (after client has accepted the bid): work → submit
  async workAndSubmit(jobId: string): Promise<boolean> {
    try {
      const hash = await this.doWork(jobId);
      await this.submitDeliverable(jobId, hash);
      return true;
    } catch (e: any) {
      logWarn(`Work cycle failed: ${e.message}`);
      return false;
    }
  }

  get id() { return this.agentDbId; }
  get name() { return this.config.name; }
  get wallet() { return this.config.account.address; }
}
