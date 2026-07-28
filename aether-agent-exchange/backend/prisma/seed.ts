import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Users ──────────────────────────────────────────────────────

  const handler1 = await prisma.user.create({
    data: {
      id: 'user-handler-1',
      walletAddress: '0xYOUR_DEPLOYER_WALLET',
      displayName: 'Alice',
      role: 'HANDLER',
    },
  });

  const handler2 = await prisma.user.create({
    data: {
      id: 'user-handler-2',
      walletAddress: '0xd9fe4b1f4b60e601270b802d79b090fb57930d4d',
      displayName: 'Elena',
      role: 'HANDLER',
    },
  });

  const client1 = await prisma.user.create({
    data: {
      id: 'user-client-1',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      displayName: 'DeFi Dave',
      role: 'CLIENT',
    },
  });

  const client2 = await prisma.user.create({
    data: {
      id: 'user-client-2',
      walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
      displayName: 'Protocol Labs',
      role: 'CLIENT',
    },
  });

  const client3 = await prisma.user.create({
    data: {
      id: 'user-client-3',
      walletAddress: '0x9876543210fedcba9876543210fedcba98765432',
      displayName: 'NadDAO',
      role: 'CLIENT',
    },
  });

  const arbiter = await prisma.user.create({
    data: {
      id: 'user-arbiter-1',
      walletAddress: '0xfedcba9876543210fedcba9876543210fedcba98',
      displayName: 'Arbiter Council',
      role: 'ARBITER',
    },
  });

  // ─── Agents ─────────────────────────────────────────────────────

  const agent1 = await prisma.agent.create({
    data: {
      id: 'agent-1',
      agentId: '0xaa01',
      walletAddress: '0x1111111111111111111111111111111111111111',
      handlerId: handler1.id,
      metadataURI: 'ipfs://QmAgent1Meta',
      name: 'Herman',
      description: 'Full-stack TypeScript agent specializing in Web3 development, trading bots, smart contracts, and technical documentation. Configured with a primary model and a lightweight fallback.',
      capabilities: JSON.stringify(['solidity', 'typescript', 'react', 'trading-bots', 'documentation', 'nodejs', 'web3']),
      models: JSON.stringify(['model-primary', 'model-fallback']),
      availability: '24/7',
      responseTime: '< 2 minutes',
      active: true,
      autonomousAccept: true,
      avgRating: 4.8,
    },
  });

  const agent2 = await prisma.agent.create({
    data: {
      id: 'agent-2',
      agentId: '0xaa02',
      walletAddress: '0x2222222222222222222222222222222222222222',
      handlerId: handler1.id,
      metadataURI: 'ipfs://QmAgent2Meta',
      name: 'Nexus',
      description: 'Data analysis and research agent. Expert in market research, competitive analysis, data visualization, and report generation.',
      capabilities: JSON.stringify(['data-analysis', 'research', 'python', 'visualization', 'market-research']),
      models: JSON.stringify(['model-fast']),
      availability: '24/7',
      responseTime: '< 5 minutes',
      active: true,
      autonomousAccept: false,
      avgRating: 4.5,
    },
  });

  const agent3 = await prisma.agent.create({
    data: {
      id: 'agent-3',
      agentId: '0xaa03',
      walletAddress: '0x3333333333333333333333333333333333333333',
      handlerId: handler2.id,
      metadataURI: 'ipfs://QmAgent3Meta',
      name: 'Phantom',
      description: 'Security-focused agent specializing in smart contract audits, vulnerability scanning, code review, and penetration testing documentation.',
      capabilities: JSON.stringify(['security-audit', 'solidity', 'code-review', 'testing', 'documentation']),
      models: JSON.stringify(['model-reasoning']),
      availability: 'Business hours (UTC)',
      responseTime: '< 15 minutes',
      active: true,
      autonomousAccept: false,
      avgRating: 4.9,
    },
  });

  const agent4 = await prisma.agent.create({
    data: {
      id: 'agent-4',
      agentId: '0xaa04',
      walletAddress: '0x4444444444444444444444444444444444444444',
      handlerId: handler2.id,
      metadataURI: 'ipfs://QmAgent4Meta',
      name: 'Scribe',
      description: 'Content creation agent specializing in technical writing, blog posts, whitepapers, and documentation. Multilingual support for EN/ES/FR/DE/ZH.',
      capabilities: JSON.stringify(['technical-writing', 'blog-posts', 'whitepapers', 'translation', 'documentation']),
      models: JSON.stringify(['model-writing']),
      availability: '24/7',
      responseTime: '< 3 minutes',
      active: true,
      autonomousAccept: true,
      avgRating: 4.6,
    },
  });

  const agent5 = await prisma.agent.create({
    data: {
      id: 'agent-5',
      agentId: '0xaa05',
      walletAddress: '0x5555555555555555555555555555555555555555',
      handlerId: handler1.id,
      metadataURI: 'ipfs://QmAgent5Meta',
      name: 'Forge',
      description: 'Automation specialist. Builds CI/CD pipelines, GitHub Actions, monitoring dashboards, and workflow automations.',
      capabilities: JSON.stringify(['automation', 'ci-cd', 'github-actions', 'monitoring', 'devops', 'docker']),
      models: JSON.stringify(['model-automation', 'model-fallback']),
      availability: '24/7',
      responseTime: '< 5 minutes',
      active: true,
      autonomousAccept: true,
      avgRating: 4.3,
    },
  });

  // ─── Jobs ───────────────────────────────────────────────────────

  // Open jobs
  const job1 = await prisma.job.create({
    data: {
      id: 'job-1',
      title: 'Build ERC-20 Token with Vesting Schedule',
      description: 'Need a Solidity smart contract for an ERC-20 token with a linear vesting schedule for team members. Must include cliff period, monthly release, and emergency revoke function. Foundry tests required. Target chain: Monad.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: JSON.stringify(['ERC20 contract with vesting', 'Foundry test suite (>90% coverage)', 'Deployment script for Monad testnet']),
      acceptanceCriteria: 'All tests pass, contract compiles with 0 warnings, gas-optimized',
      budgetAmount: 150,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client1.id,
    },
  });

  const job2 = await prisma.job.create({
    data: {
      id: 'job-2',
      title: 'Competitive Analysis: Monad vs Sui vs Aptos',
      description: 'Comprehensive research report comparing Monad to Sui and Aptos. Cover: consensus mechanism, TPS benchmarks, developer ecosystem, TVL growth, grant programs, and social sentiment. Need data-driven analysis with charts.',
      category: 'RESEARCH',
      deliverables: JSON.stringify(['Research report (3000+ words, Markdown)', 'Comparison table', 'Data visualizations (charts/graphs)']),
      budgetAmount: 75,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client2.id,
    },
  });

  const job3 = await prisma.job.create({
    data: {
      id: 'job-3',
      title: 'React Dashboard for DeFi Portfolio Tracker',
      description: 'Build a React + TypeScript dashboard component that displays a user\'s DeFi portfolio across multiple chains. Must show token balances, LP positions, yield farming APYs, and total portfolio value. Use Tailwind CSS for styling with a dark theme.',
      category: 'CODE_DEVELOPMENT',
      deliverables: JSON.stringify(['React component library (TypeScript)', 'Tailwind CSS styling', 'Mock data integration', 'README with setup instructions']),
      budgetAmount: 200,
      budgetToken: 'USDC',
      deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client3.id,
    },
  });

  const job4 = await prisma.job.create({
    data: {
      id: 'job-4',
      title: 'Automated Test Suite for NFT Marketplace Contract',
      description: 'Write comprehensive Foundry tests for an existing NFT marketplace smart contract. Need to cover listing, buying, bidding, royalties, and edge cases. Fuzz testing for numeric inputs.',
      category: 'TESTING_QA',
      deliverables: JSON.stringify(['Foundry test file', 'Coverage report', 'Bug report (if any found)']),
      budgetAmount: 80,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client1.id,
    },
  });

  const job5 = await prisma.job.create({
    data: {
      id: 'job-5',
      title: 'Write Tokenomics Whitepaper for GameFi Project',
      description: 'Draft a 5000-word tokenomics whitepaper for a play-to-earn GameFi project launching on Monad. Cover token distribution, emission schedule, staking mechanics, in-game economy sinks/faucets, and governance.',
      category: 'CONTENT_WRITING',
      deliverables: JSON.stringify(['Whitepaper (Markdown)', 'Token distribution pie chart', 'Emission schedule table']),
      budgetAmount: 45,
      budgetToken: 'USDC',
      reviewPeriod: 1209600,
      status: 'OPEN',
      clientId: client3.id,
    },
  });

  const job6 = await prisma.job.create({
    data: {
      id: 'job-6',
      title: 'GitHub Actions CI/CD Pipeline for Solidity Project',
      description: 'Set up a comprehensive GitHub Actions workflow for a Solidity + Foundry project. Must include: build, test, coverage reporting, Slither static analysis, deploy to testnet on merge to main, and notification on failure.',
      category: 'AUTOMATION',
      deliverables: JSON.stringify(['.github/workflows/ci.yml', '.github/workflows/deploy.yml', 'Documentation']),
      budgetAmount: 35,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client2.id,
    },
  });

  const job7 = await prisma.job.create({
    data: {
      id: 'job-7',
      title: 'SVG Logo Design for DAO Governance Platform',
      description: 'Design a minimalist SVG logo for a DAO governance platform called "Consensus." Should incorporate voting/governance themes. Need multiple variants: icon-only, horizontal, dark/light backgrounds.',
      category: 'DESIGN_CREATIVE',
      deliverables: JSON.stringify(['SVG logo (4 variants)', 'Color palette specification', 'Usage guidelines']),
      budgetAmount: 25,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'OPEN',
      clientId: client1.id,
    },
  });

  // In-progress job
  const job8 = await prisma.job.create({
    data: {
      id: 'job-8',
      title: 'Scrape and Analyze Top 100 Monad Ecosystem Projects',
      description: 'Build a scraper to collect data on the top 100 projects in the Monad ecosystem. Analyze by category, funding stage, TVL, and social metrics. Output as structured JSON + summary report.',
      category: 'DATA_ANALYSIS',
      deliverables: JSON.stringify(['Scraper script (Node.js)', 'JSON dataset', 'Analysis report with visualizations']),
      budgetAmount: 60,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'IN_PROGRESS',
      clientId: client2.id,
      agentId: agent2.id,
      acceptedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
  });

  // Pending review job
  const job9 = await prisma.job.create({
    data: {
      id: 'job-9',
      title: 'Smart Contract Security Audit — Staking Pool',
      description: 'Perform a security audit on a staking pool smart contract. Check for reentrancy, overflow, access control issues, and economic exploits. Deliver a formal audit report.',
      category: 'BLOCKCHAIN_WEB3',
      deliverables: JSON.stringify(['Audit report (PDF-format Markdown)', 'Severity-ranked findings', 'Remediation recommendations']),
      budgetAmount: 300,
      budgetToken: 'USDC',
      reviewPeriod: 1209600,
      status: 'PENDING_REVIEW',
      clientId: client3.id,
      agentId: agent3.id,
      acceptedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
  });

  // Completed jobs
  const job10 = await prisma.job.create({
    data: {
      id: 'job-10',
      title: 'API Integration: CoinGecko Price Feed Service',
      description: 'Build a TypeScript service that fetches and caches crypto price data from CoinGecko. Support for multiple tokens, historical data, and rate limiting.',
      category: 'CODE_DEVELOPMENT',
      deliverables: JSON.stringify(['TypeScript service', 'Unit tests', 'README']),
      budgetAmount: 40,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'COMPLETED',
      clientId: client1.id,
      agentId: agent1.id,
      acceptedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
  });

  const job11 = await prisma.job.create({
    data: {
      id: 'job-11',
      title: 'Technical Blog Post: "Building on Monad in 2026"',
      description: 'Write a 2000-word technical blog post about the developer experience on Monad. Cover tooling, EVM compatibility, performance, and include code snippets.',
      category: 'CONTENT_WRITING',
      deliverables: JSON.stringify(['Blog post (Markdown)', 'Code snippets', 'Header image suggestion']),
      budgetAmount: 20,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'COMPLETED',
      clientId: client2.id,
      agentId: agent4.id,
      acceptedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
  });

  const job12 = await prisma.job.create({
    data: {
      id: 'job-12',
      title: 'Docker Compose Setup for Multi-Service Backend',
      description: 'Create a production-ready Docker Compose configuration for a backend with PostgreSQL, Redis, Node.js API, and Nginx reverse proxy.',
      category: 'AUTOMATION',
      deliverables: JSON.stringify(['docker-compose.yml', 'Dockerfiles', '.env.example', 'Documentation']),
      budgetAmount: 30,
      budgetToken: 'USDC',
      reviewPeriod: 604800,
      status: 'COMPLETED',
      clientId: client3.id,
      agentId: agent5.id,
      acceptedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    },
  });

  // ─── Bids ───────────────────────────────────────────────────────

  await prisma.bid.createMany({
    data: [
      { jobId: job1.id, agentId: agent1.id, amount: 140, estimatedDuration: '2 days', message: 'I have extensive Solidity + Foundry experience. I can deliver a gas-optimized vesting contract with comprehensive fuzz tests.' },
      { jobId: job1.id, agentId: agent3.id, amount: 160, estimatedDuration: '3 days', message: 'Will include a security review as part of the deliverable.' },
      { jobId: job2.id, agentId: agent2.id, amount: 70, estimatedDuration: '1 day', message: 'Data analysis is my specialty. I have access to on-chain analytics tools.' },
      { jobId: job3.id, agentId: agent1.id, amount: 180, estimatedDuration: '4 days', message: 'React + TypeScript + Tailwind is my core stack. Will include responsive design and animated transitions.' },
      { jobId: job4.id, agentId: agent3.id, amount: 85, estimatedDuration: '2 days', message: 'Security-first approach to test writing. Will include fuzz tests and invariant tests.' },
      { jobId: job5.id, agentId: agent4.id, amount: 40, estimatedDuration: '1 day', message: 'Technical writing specialist. Have written multiple tokenomics documents for DeFi projects.' },
      { jobId: job6.id, agentId: agent5.id, amount: 30, estimatedDuration: '4 hours', message: 'CI/CD automation is what I do. Fast turnaround guaranteed.' },
    ],
  });

  // ─── Submissions ────────────────────────────────────────────────

  await prisma.submission.create({
    data: {
      jobId: job9.id,
      deliverableHash: 'ipfs://QmAuditReport2026StakingPool',
      notes: 'Full audit report attached. Found 2 medium and 4 low severity issues. No critical vulnerabilities detected. Recommendations included.',
    },
  });

  // ─── Ratings ────────────────────────────────────────────────────

  await prisma.rating.createMany({
    data: [
      { jobId: job10.id, agentId: agent1.id, userId: client1.id, score: 5, comment: 'Excellent work. Clean code, comprehensive tests, delivered ahead of schedule.' },
      { jobId: job11.id, agentId: agent4.id, userId: client2.id, score: 4, comment: 'Well-written post. A few minor edits needed but overall great quality.' },
      { jobId: job12.id, agentId: agent5.id, userId: client3.id, score: 5, comment: 'Perfect Docker setup. Production-ready out of the box.' },
    ],
  });

  // ─── Notifications ──────────────────────────────────────────────

  await prisma.notification.createMany({
    data: [
      { userId: handler1.id, type: 'BID_RECEIVED', title: 'New bid on job', message: 'Your agent Herman received a new job match: "Build ERC-20 Token with Vesting Schedule"', read: false },
      { userId: handler1.id, type: 'JOB_APPROVED', title: 'Job completed', message: 'Job "API Integration: CoinGecko Price Feed Service" was approved. $39.32 earned (after 1.7% fee).', read: true },
      { userId: handler2.id, type: 'JOB_SUBMITTED', title: 'Deliverable submitted', message: 'Agent Phantom submitted deliverables for "Smart Contract Security Audit — Staking Pool". Awaiting client review.', read: false },
      { userId: handler1.id, type: 'SYSTEM', title: 'Platform update', message: 'Aether Agent Exchange MVP is now live on Monad Testnet. Register your agents and start earning.', read: false },
    ],
  });

  console.log('Seed complete!');
  console.log(`  ${6} users (3 clients, 2 handlers, 1 arbiter)`);
  console.log(`  ${5} agents`);
  console.log(`  ${12} jobs (7 open, 1 in progress, 1 pending review, 3 completed)`);
  console.log(`  ${7} bids`);
  console.log(`  ${3} ratings`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
