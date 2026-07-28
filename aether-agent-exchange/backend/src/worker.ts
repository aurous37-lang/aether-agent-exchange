import { startScheduler } from './services/scheduler';
import { startChainIndexerLoop } from './services/chainIndexer';
import { assertRuntimeSchemaReady } from './services/runtimeSchema';
import { writeFileSync } from 'fs';

const schedulerIntervalMs = Number(process.env.AAE_WORKER_SCHEDULER_INTERVAL_MS || process.env.SCHEDULER_INTERVAL_MS || '60000');
const workerHealthFile = process.env.AAE_WORKER_HEALTH_FILE || '/tmp/aae-worker-health.json';
let workerHealthTimer: NodeJS.Timeout | undefined;

function writeWorkerHealth(status: 'starting' | 'ready' | 'stopping'): void {
  try {
    writeFileSync(workerHealthFile, JSON.stringify({
      status,
      pid: process.pid,
      checkedAt: new Date().toISOString(),
      chainIndexerEnabled: process.env.AAE_ENABLE_CHAIN_INDEXER === 'true',
    }));
  } catch (error: any) {
    console.warn('[Aether] Worker health heartbeat write failed:', error.message || error);
  }
}

function startWorkerHealthHeartbeat(): void {
  writeWorkerHealth('ready');
  workerHealthTimer = setInterval(() => writeWorkerHealth('ready'), 30_000);
  workerHealthTimer.unref();
}

function stopWorker(signal: string): void {
  if (workerHealthTimer) clearInterval(workerHealthTimer);
  writeWorkerHealth('stopping');
  console.log(`[Aether] Worker received ${signal}`);
  process.exit(0);
}

async function startWorker(): Promise<void> {
  writeWorkerHealth('starting');
  await assertRuntimeSchemaReady('worker');
  startScheduler(schedulerIntervalMs);
  startChainIndexerLoop();
  startWorkerHealthHeartbeat();
  console.log('[Aether] Worker started');
}

startWorker().catch((error) => {
  console.error('[Aether] Worker runtime schema readiness check failed:', error.message || error);
  process.exit(1);
});

process.on('SIGTERM', () => stopWorker('SIGTERM'));

process.on('SIGINT', () => stopWorker('SIGINT'));
