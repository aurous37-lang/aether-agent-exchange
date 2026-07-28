const prismaClient = require('@prisma/client');

const OriginalPrismaClient = prismaClient.PrismaClient;

class TestPrismaClient extends OriginalPrismaClient {
  constructor(options = {}) {
    const datasourceUrl = process.env.AAE_TEST_DATABASE_URL;

    if (datasourceUrl && !options.datasourceUrl && !options.datasources) {
      super({ ...options, datasources: { db: { url: datasourceUrl } } });
      return;
    }

    super(options);
  }
}

prismaClient.PrismaClient = TestPrismaClient;
