# Simulation V2

Discrete-time marketplace simulator for the Aether Agent Exchange platform. Generates synthetic actors (clients, handlers, agents, arbiters), runs them through a configurable tick-based event loop, and produces structured telemetry for regression testing, stress testing, and scenario analysis.

## Architecture

### Core loop

Each tick executes phases in order:

1. **System events** -- auth pressure, burst traffic signals
2. **Job posting** -- clients decide whether to post based on budget, preferences, and market state
3. **Bidding** -- available agents scan open jobs and place bids (with self-deal guards)
4. **Acceptance** -- clients evaluate bids using quality/price/trust signals
5. **Job progress** -- in-progress jobs count down; agents may fail or delay delivery
6. **Approve / dispute** -- clients review deliverables, approve or open disputes
7. **Arbiter votes** -- arbiters vote on open disputes; 3-vote majority resolves
8. **Auth effects** -- simulated rate-limit hits and auth failures
9. **Invariants** -- 10 structural checks run every 50 ticks and at end
10. **Metrics snapshot** -- per-tick counters captured

### Actor model

Actors are generated from scenario config with seeded RNG. Each actor type has a profile (static traits) and mutable state tracked by `ActorRegistry`. Trust memory accumulates per client-agent pair across jobs.

### Decision policies

All actor decisions are pure functions in `decision-policies.ts`. Given a profile, market state, and RNG, they return deterministic outputs. This makes runs fully reproducible for the same seed.

## File Structure

```
simulation-v2/
  config.ts             SimConfig type, tick presets, resolveConfig()
  scenarios.ts          8 scenario presets with success criteria ranges
  actors.ts             Actor profiles (Client, Handler, Agent, Arbiter), ActorRegistry
  decision-policies.ts  Pure decision functions: post, bid, accept, deliver, approve, dispute, vote, rate
  engine.ts             SimulationEngine class -- tick loop, phases, hybrid API bridge
  metrics.ts            MetricsCollector -- throughput, financial, security, infra counters
  seeded-rng.ts         Deterministic PRNG (mulberry32) from string seed
  output-schema.ts      RunOutput, AggregateMetrics, InvariantResult, SimEvent types
  run.ts                CLI entry point -- single runs, multi-seed comparison
  reports/              Generated JSON and Markdown output (gitignored)
  README.md             This file
```

## Modes of Operation

| Mode | Description |
|------|-------------|
| **pure** | All state transitions happen in-memory. No backend required. Fast, fully offline. Good for scenario sweeps and invariant testing. |
| **hybrid** | Decisions run internally; state changes call the real backend API (POST /jobs, /bid, /accept, /submit, /approve, /dispute, /rate). Validates API behavior under simulated load. Requires backend running on port 4000. |
| **replay** | Reserved for future use. Will replay a recorded event log to reproduce a specific run. |

## Available Scenarios

| Name | Ticks | Description |
|------|-------|-------------|
| `baseline-market` | standard (1440) | Balanced defaults. Even category distribution, normal dispute rates. Good for regression testing. |
| `hot-category-surge` | standard (1440) | CODE_DEVELOPMENT gets 70% weight. High demand multiplier. Tests competition pressure on a single category. |
| `low-liquidity-market` | long (10080) | Minimal supply: 1 handler with 1 agent. Low demand. Tests stale job behavior and empty-market edge cases. |
| `reputation-driven-market` | long (10080) | Wide agent quality range (0.2-1.0). Clients have high quality sensitivity. Tests whether high-rep agents win over time. |
| `delay-failure-market` | standard (1440) | Agents have high failure probability (0.3-0.5) and slow delivery. High dispute multiplier. Tests dispute and resolution paths. |
| `adversarial-market` | standard (1440) | Agents with self-deal probability 0.3, disputatious clients (propensity 0.7), high auth pressure. Tests security guards. |
| `bursty-agent-traffic` | short (240) | 10 handlers with 3-5 agents each (30-50 agents). Short tick cycle, high auth pressure. Tests rate limiting under concurrency. |
| `premium-marketplace` | standard (1440) | High budgets ($200-$2000), low dispute rates, all agents quality > 0.7. Tests high-value transaction flows. |

## CLI Usage

```bash
# Run from the backend directory
cd backend

# Basic run (baseline scenario, hybrid mode)
npx tsx simulation-v2/run.ts

# Specific scenario and seed in pure mode
npx tsx simulation-v2/run.ts --scenario adversarial-market --seed 1337 --mode pure

# Override tick count
npx tsx simulation-v2/run.ts --scenario baseline-market --seed 42 --ticks 100

# Multi-seed comparison
npx tsx simulation-v2/run.ts --compare --scenario baseline-market --seeds 1,2,3,4,5

# Quiet mode (suppress per-tick output)
npx tsx simulation-v2/run.ts --scenario bursty-agent-traffic --seed abc --quiet

# Custom output directory
npx tsx simulation-v2/run.ts --output /tmp/sim-results --scenario premium-marketplace

# Show help and available scenarios
npx tsx simulation-v2/run.ts --help
```

## Output Format

Each run produces two files in `reports/`:

- **`run-{scenario}-{seed}.json`** -- Full `RunOutput` object. Contains config, actor summary, aggregate metrics, invariant results, error summary, and event log path.
- **`run-{scenario}-{seed}.md`** -- Human-readable summary with metadata table, metrics, top agents, invariant results, and errors.

Compare mode additionally produces:

- **`comparison-{scenario}.md`** -- Table comparing key metrics across seeds, with averages and invariant summary.

The JSON schema is defined in `output-schema.ts`. Key top-level fields:

```
RunOutput
  runId, seed, scenarioName, startTime, endTime, tickCount, status
  config: SimConfig
  actorSummary: { totals, active counts, ActorRecord[] }
  aggregateMetrics: { jobsPosted, completed, disputed, financials, ratings... }
  invariantResults: InvariantResult[]
  errorSummary: { totalErrors, totalWarnings, fatalError?, errors[] }
```

## Adding a New Scenario

1. Open `scenarios.ts`
2. Define a new `ScenarioPreset` object with actor counts, category weights, multipliers, and success criteria ranges
3. Add it to the `SCENARIOS` map at the bottom of the file
4. Run it: `npx tsx simulation-v2/run.ts --scenario your-scenario-name`

Example skeleton:

```typescript
const myScenario: ScenarioPreset = {
  name: 'my-scenario',
  description: 'What this tests.',
  tickPreset: 'standard',
  clientCount: 5,
  handlerCount: 3,
  arbiterCount: 2,
  agentsPerHandler: [1, 3],
  jobPostFrequency: 3,
  budgetRange: [20, 500],
  categoryWeights: even(),
  demandMultiplier: 1.0,
  disputeMultiplier: 1.0,
  authPressure: 0.2,
  latencyModifier: 1.0,
  successCriteriaRanges: {
    completionRate: [0.5, 0.9],
    avgDisputeRate: [0.02, 0.2],
    avgRating: [3.0, 5.0],
  },
};
```

## Adding a New Decision Policy

Decision policies live in `decision-policies.ts` as pure exported functions. To add or modify a policy:

1. Define a function that takes actor profile(s), market state view(s), and a `SeededRng`
2. Return a structured decision object (the engine interprets the result)
3. Use `rng.chance()`, `rng.randomFloat()`, etc. for stochastic decisions -- never `Math.random()`
4. Call the new policy from the appropriate phase in `engine.ts`

All decisions must be deterministic for a given RNG state to preserve reproducibility.

## How Invariants Work

The engine runs 10 structural invariants (INV-001 through INV-010) every 50 ticks and at run end. Each invariant is a function that returns `{ pass, actual, expected }`.

Invariants check:
- No negative balances (INV-001)
- Valid job status values (INV-002)
- Accepted jobs have assigned agents (INV-003)
- No self-dealing (INV-004)
- Escrow conservation (INV-005)
- Bid count consistency (INV-006)
- Disputes reference valid jobs (INV-007)
- Active job list consistency (INV-008)
- Platform fee rate is 1.7% (INV-009)
- No duplicate bids per agent per job (INV-010)

A failed invariant sets the run status to `FAILED_INVARIANTS`. If the failure is marked `expectedFailure`, the status is `PASSED_WITH_EXPECTED_FAILURES` instead.
