/**
 * CLI entry point for Simulation V2.
 *
 * Usage:
 *   npx tsx simulation-v2/run.ts --scenario baseline-market --seed 42 --mode hybrid
 *   npx tsx simulation-v2/run.ts --scenario adversarial-market --seed 1337 --mode pure
 *   npx tsx simulation-v2/run.ts --compare --scenario baseline-market --seeds 1,2,3,4,5
 */
import { SimulationEngine } from './engine';
import { getScenario, SCENARIOS } from './scenarios';
import type { SimConfig, SimMode } from './config';
import type { RunOutput } from './output-schema';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ── CLI parsing ──────────────────────────────────────────────────────────

interface CliArgs {
  scenario: string; seed: string; seeds: string[]; mode: SimMode;
  ticks: number | undefined; compare: boolean; outputDir: string; quiet: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const a: CliArgs = {
    scenario: 'baseline-market', seed: 'default', seeds: [], mode: 'hybrid',
    ticks: undefined, compare: false, outputDir: resolve(__dirname, 'reports'), quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], next = argv[i + 1];
    switch (flag) {
      case '--scenario':  a.scenario = next; i++; break;
      case '--seed':      a.seed = next; i++; break;
      case '--seeds':     a.seeds = next.split(',').map(s => s.trim()); i++; break;
      case '--mode':      a.mode = next as SimMode; i++; break;
      case '--ticks':     a.ticks = parseInt(next, 10); i++; break;
      case '--compare':   a.compare = true; break;
      case '--output':    a.outputDir = resolve(next); i++; break;
      case '--quiet':     a.quiet = true; break;
      case '--help': case '-h': printUsage(); process.exit(0); break;
      default: console.error(`Unknown flag: ${flag}`); printUsage(); process.exit(1);
    }
  }
  return a;
}

function printUsage(): void {
  const scenarios = [...SCENARIOS.entries()]
    .map(([n, s]) => `  ${n.padEnd(28)} ${s.description}`).join('\n');
  console.log(`
Simulation V2 Runner
====================
Flags:
  --scenario <name>       Scenario preset (default: baseline-market)
  --seed <string>         RNG seed (default: 'default')
  --seeds <a,b,c>         Comma-separated seeds (for --compare)
  --mode <pure|hybrid>    Execution mode (default: hybrid)
  --ticks <number>        Override tick count from scenario
  --compare               Run multiple seeds and produce comparison
  --output <dir>          Output directory (default: simulation-v2/reports/)
  --quiet                 Suppress per-tick console output
  --help, -h              Show this help

Available scenarios:
${scenarios}
`);
}

// ── Single run ───────────────────────────────────────────────────────────

async function runSingle(
  scenarioName: string, seed: string, mode: SimMode,
  ticks: number | undefined, outputDir: string, quiet: boolean,
): Promise<RunOutput> {
  const scenario = getScenario(scenarioName);
  const cfg: Partial<SimConfig> = { seed, mode, tickPreset: scenario.tickPreset, outputDir };
  if (ticks !== undefined) cfg.tickCount = ticks;

  if (!quiet) {
    console.log(`\n--- Simulation V2 ---`);
    console.log(`Scenario: ${scenarioName}  Seed: ${seed}  Mode: ${mode}  Ticks: ${ticks ?? scenario.tickPreset}`);
  }

  const engine = new SimulationEngine(cfg, scenario);
  const t0 = Date.now();
  const output = await engine.run();
  const wallMs = Date.now() - t0;

  if (!quiet) { console.log(`Completed in ${(wallMs / 1000).toFixed(1)}s | Status: ${output.status}`); printSummary(output); }

  ensureDir(outputDir);
  const base = `run-${scenarioName}-${seed}`;
  const jsonPath = join(outputDir, `${base}.json`);
  const mdPath = join(outputDir, `${base}.md`);
  writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  writeFileSync(mdPath, markdownSummary(output, wallMs));
  if (!quiet) console.log(`JSON: ${jsonPath}\nMD:   ${mdPath}`);
  return output;
}

// ── Compare mode ─────────────────────────────────────────────────────────

async function runCompare(
  scenarioName: string, seeds: string[], mode: SimMode,
  ticks: number | undefined, outputDir: string, quiet: boolean,
): Promise<void> {
  console.log(`\n=== Comparison: ${scenarioName} x ${seeds.length} seeds ===\n`);
  const results: RunOutput[] = [];
  for (const seed of seeds) results.push(await runSingle(scenarioName, seed, mode, ticks, outputDir, quiet));

  ensureDir(outputDir);
  const mdPath = join(outputDir, `comparison-${scenarioName}.md`);
  writeFileSync(mdPath, markdownComparison(scenarioName, results));
  console.log(`\nComparison report: ${mdPath}`);
}

// ── Console summary ──────────────────────────────────────────────────────

function printSummary(o: RunOutput): void {
  const m = o.aggregateMetrics, a = o.actorSummary;
  console.log(`  Jobs: posted=${m.jobsPosted} bid=${m.jobsBid} completed=${m.jobsCompleted} disputed=${m.jobsDisputed} cancelled=${m.jobsCancelled}`);
  console.log(`  Finance: locked=$${m.totalValueLocked.toFixed(2)} disbursed=$${m.totalValueDisbursed.toFixed(2)} fees=$${m.totalPlatformFees.toFixed(2)}`);
  console.log(`  Quality: rating=${m.avgRating.toFixed(2)} disputes=${(m.disputeRate * 100).toFixed(1)}% completion=${m.avgCompletionTimeTicks.toFixed(0)}t`);
  console.log(`  Actors: ${a.totalClients}C ${a.totalHandlers}H ${a.totalAgents}A ${a.totalArbiters}Arb`);
  const invFail = o.invariantResults.filter(i => !i.passed);
  if (invFail.length > 0) { console.log(`  Invariants FAILED (${invFail.length}):`); invFail.forEach(i => console.log(`    [${i.invariantId}] ${i.name}: ${i.actual}`)); }
  else console.log(`  Invariants: all passed (${o.invariantResults.length} checks)`);
  if (o.errorSummary.totalErrors > 0) console.log(`  Errors: ${o.errorSummary.totalErrors} errors, ${o.errorSummary.totalWarnings} warnings`);
}

// ── Markdown: single run ─────────────────────────────────────────────────

function markdownSummary(o: RunOutput, wallMs: number): string {
  const m = o.aggregateMetrics, a = o.actorSummary;
  const L: string[] = [];
  const row = (k: string, v: string | number) => L.push(`| ${k} | ${v} |`);
  const hdr = (...cols: string[]) => { L.push(`| ${cols.join(' | ')} |`); L.push(`|${cols.map(() => '---').join('|')}|`); };

  L.push(`# Simulation Run: ${o.scenarioName}`, '');
  L.push('## Run Metadata', '');
  hdr('Field', 'Value');
  row('Run ID', `\`${o.runId}\``); row('Scenario', o.scenarioName); row('Seed', o.seed);
  row('Mode', o.config.mode); row('Ticks', o.tickCount);
  row('Start', o.startTime); row('End', o.endTime);
  row('Wall Clock', `${(wallMs / 1000).toFixed(1)}s`); row('Status', `**${o.status}**`);

  L.push('', '## Aggregate Metrics', '');
  hdr('Metric', 'Value');
  row('Jobs Posted', m.jobsPosted); row('Jobs Bid On', m.jobsBid);
  row('Jobs Completed', m.jobsCompleted); row('Jobs Disputed', m.jobsDisputed);
  row('Jobs Cancelled', m.jobsCancelled);
  row('Value Locked', `$${m.totalValueLocked.toFixed(2)}`);
  row('Value Disbursed', `$${m.totalValueDisbursed.toFixed(2)}`);
  row('Platform Fees', `$${m.totalPlatformFees.toFixed(2)}`);
  row('Avg Completion', `${m.avgCompletionTimeTicks.toFixed(0)} ticks`);
  row('Avg Bids/Job', m.avgBidsPerJob.toFixed(1));
  row('Avg Rating', m.avgRating.toFixed(2));
  row('Dispute Rate', `${(m.disputeRate * 100).toFixed(1)}%`);
  row('Escrow Utilization', `${(m.escrowUtilization * 100).toFixed(1)}%`);

  L.push('', '## Actors', '');
  hdr('', 'Clients', 'Handlers', 'Agents', 'Arbiters');
  L.push(`| Total | ${a.totalClients} | ${a.totalHandlers} | ${a.totalAgents} | ${a.totalArbiters} |`);
  L.push(`| Active | ${a.activeClients} | ${a.activeHandlers} | ${a.activeAgents} | - |`);

  const agents = a.actors.filter(r => r.role === 'agent').sort((x, y) => y.jobsCompleted - x.jobsCompleted).slice(0, 5);
  if (agents.length > 0) {
    L.push('', '## Top Agents (by jobs completed)', '');
    hdr('Agent', 'Completed', 'Failed', 'Earned', 'Quality');
    for (const ag of agents) row(ag.displayName, `${ag.jobsCompleted} | ${ag.jobsFailed} | $${ag.totalEarned.toFixed(2)} | ${ag.reputationScore.toFixed(2)}`);
  }

  L.push('', '## Invariants', '');
  const invFail = o.invariantResults.filter(i => !i.passed);
  if (invFail.length === 0) L.push(`All ${o.invariantResults.length} invariants passed.`);
  else {
    L.push(`**${invFail.length} of ${o.invariantResults.length} failed:**`, '');
    hdr('ID', 'Name', 'Actual', 'Severity');
    invFail.forEach(i => L.push(`| ${i.invariantId} | ${i.name} | ${i.actual} | ${i.severity} |`));
  }

  if (o.errorSummary.totalErrors > 0 || o.errorSummary.totalWarnings > 0) {
    L.push('', '## Errors', '', `- **Errors:** ${o.errorSummary.totalErrors}`, `- **Warnings:** ${o.errorSummary.totalWarnings}`);
    if (o.errorSummary.fatalError) L.push(`- **Fatal:** ${o.errorSummary.fatalError}`);
    const recent = o.errorSummary.errors.filter(e => e.severity !== 'warning').slice(-10);
    if (recent.length > 0) { L.push('', 'Recent errors:', ''); recent.forEach(e => L.push(`- \`[tick ${e.tick}] ${e.code}\`: ${e.message}`)); }
  }

  L.push('', '---', `*Generated by Simulation V2 at ${new Date().toISOString()}*`);
  return L.join('\n');
}

// ── Markdown: comparison ─────────────────────────────────────────────────

function markdownComparison(scenarioName: string, runs: RunOutput[]): string {
  const L: string[] = [];
  L.push(`# Comparison: ${scenarioName}`, '', `Runs: ${runs.length} | Generated: ${new Date().toISOString()}`, '');

  L.push('## Key Metrics Across Seeds', '');
  L.push(`| Seed | Status | Posted | Completed | Disputed | Dispute% | Rating | Fees | Wall |`);
  L.push(`|------|--------|--------|-----------|----------|----------|--------|------|------|`);
  for (const r of runs) {
    const m = r.aggregateMetrics;
    const ws = ((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 1000).toFixed(1);
    L.push(`| ${r.seed} | ${r.status} | ${m.jobsPosted} | ${m.jobsCompleted} | ${m.jobsDisputed} | ${(m.disputeRate * 100).toFixed(1)}% | ${m.avgRating.toFixed(2)} | $${m.totalPlatformFees.toFixed(2)} | ${ws}s |`);
  }

  const avg = (fn: (r: RunOutput) => number) => runs.map(fn).reduce((s, v) => s + v, 0) / runs.length;
  L.push('', '## Averages', '');
  L.push(`| Metric | Mean |`, `|--------|------|`);
  L.push(`| Jobs Posted | ${avg(r => r.aggregateMetrics.jobsPosted).toFixed(1)} |`);
  L.push(`| Completion Rate | ${(avg(r => r.aggregateMetrics.jobsCompleted) / Math.max(1, avg(r => r.aggregateMetrics.jobsPosted)) * 100).toFixed(1)}% |`);
  L.push(`| Dispute Rate | ${(avg(r => r.aggregateMetrics.disputeRate) * 100).toFixed(1)}% |`);
  L.push(`| Avg Rating | ${avg(r => r.aggregateMetrics.avgRating).toFixed(2)} |`);
  L.push(`| Platform Fees | $${avg(r => r.aggregateMetrics.totalPlatformFees).toFixed(2)} |`);
  L.push(`| Escrow Utilization | ${(avg(r => r.aggregateMetrics.escrowUtilization) * 100).toFixed(1)}% |`);

  L.push('', '## Invariants', '');
  const allOk = runs.every(r => r.invariantResults.every(i => i.passed));
  if (allOk) L.push('All invariants passed across all seeds.');
  else {
    L.push('| Seed | Failed Invariants |', '|------|-------------------|');
    for (const r of runs) {
      const f = r.invariantResults.filter(i => !i.passed).map(i => i.invariantId);
      if (f.length > 0) L.push(`| ${r.seed} | ${f.join(', ')} |`);
    }
  }

  L.push('', '---', `*Generated by Simulation V2 at ${new Date().toISOString()}*`);
  return L.join('\n');
}

// ── Utilities ────────────────────────────────────────────────────────────

function ensureDir(dir: string): void { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  try {
    if (args.compare) {
      await runCompare(args.scenario, args.seeds.length > 0 ? args.seeds : [args.seed], args.mode, args.ticks, args.outputDir, args.quiet);
    } else {
      await runSingle(args.scenario, args.seed, args.mode, args.ticks, args.outputDir, args.quiet);
    }
  } catch (err) { console.error(`\nFatal error: ${err}`); process.exit(1); }
}

main();
