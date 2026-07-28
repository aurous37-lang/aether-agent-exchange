import prisma from '../lib/prisma';

type RuntimeSchemaComponent = 'api' | 'worker' | 'deploy';

export type RuntimeSchemaStatus = {
  ready: boolean;
  component: RuntimeSchemaComponent;
  checkedAt: string;
  provider: 'postgresql' | 'sqlite-or-other';
  requiredModels: string[];
  migrationsRequired: boolean;
};

const REQUIRED_INDEXER_MODELS = [
  'chainIndexerCursor',
  'indexedChainEvent',
  'escrowLifecycleState',
] as const;

const REQUIRED_MODEL_SELECTS: Record<typeof REQUIRED_INDEXER_MODELS[number], Record<string, true>> = {
  chainIndexerCursor: {
    id: true,
    lastIndexedBlock: true,
    finalizedBlock: true,
    reorgScanBlock: true,
  },
  indexedChainEvent: {
    id: true,
    chainId: true,
    txHash: true,
    logIndex: true,
  },
  escrowLifecycleState: {
    id: true,
    chainId: true,
    escrowAddress: true,
    state: true,
  },
};

function isPostgresRuntime(): boolean {
  return /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL || '');
}

function shouldRequireMigrations(): boolean {
  if (process.env.AAE_REQUIRE_PRISMA_MIGRATIONS === 'true') return true;
  if (process.env.AAE_REQUIRE_PRISMA_MIGRATIONS === 'false') return false;
  return process.env.NODE_ENV === 'production' && isPostgresRuntime();
}

async function assertModelTable(modelName: string): Promise<void> {
  const model = (prisma as any)[modelName];
  if (!model || typeof model.findFirst !== 'function') {
    throw new Error(`Prisma model ${modelName} is not available in the generated client`);
  }
  await model.findFirst({ select: REQUIRED_MODEL_SELECTS[modelName as typeof REQUIRED_INDEXER_MODELS[number]] || { id: true } }).catch((error: any) => {
    throw new Error(`Runtime schema missing ${modelName}: ${error.message || String(error)}`);
  });
}

async function assertPrismaMigrationHistory(): Promise<void> {
  const tableRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint | string }>>(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_name = '_prisma_migrations'",
  );
  const tableCount = Number(tableRows[0]?.count || 0);
  if (tableCount !== 1) {
    throw new Error('Runtime schema is missing _prisma_migrations; run migration-controlled deploy before starting services');
  }

  const migrationRows = await prisma.$queryRawUnsafe<Array<{ count: number | bigint | string }>>(
    'select count(*)::int as count from "_prisma_migrations" where finished_at is not null and rolled_back_at is null',
  );
  const migrationCount = Number(migrationRows[0]?.count || 0);
  if (migrationCount < 1) {
    throw new Error('Runtime schema has no applied Prisma migrations');
  }
}

export async function assertRuntimeSchemaReady(component: RuntimeSchemaComponent): Promise<RuntimeSchemaStatus> {
  for (const modelName of REQUIRED_INDEXER_MODELS) {
    await assertModelTable(modelName);
  }

  const migrationsRequired = shouldRequireMigrations();
  if (migrationsRequired) {
    await assertPrismaMigrationHistory();
  }

  return {
    ready: true,
    component,
    checkedAt: new Date().toISOString(),
    provider: isPostgresRuntime() ? 'postgresql' : 'sqlite-or-other',
    requiredModels: [...REQUIRED_INDEXER_MODELS],
    migrationsRequired,
  };
}
