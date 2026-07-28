-- CreateTable
CREATE TABLE "ChainIndexerCursor" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "caip2Network" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'evm-rpc',
    "cursorStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastIndexedBlock" TEXT NOT NULL DEFAULT '0',
    "finalizedBlock" TEXT,
    "lastBlockHash" TEXT,
    "confirmationDepth" INTEGER NOT NULL DEFAULT 12,
    "reorgDepth" INTEGER NOT NULL DEFAULT 64,
    "lastError" TEXT,
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainIndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexedChainEvent" (
    "id" TEXT NOT NULL,
    "chainKey" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "caip2Network" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "transactionIndex" INTEGER,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "factoryAddress" TEXT,
    "escrowAddress" TEXT,
    "eventName" TEXT NOT NULL,
    "lifecycleType" TEXT,
    "jobId" TEXT,
    "onchainJobId" TEXT,
    "actorAddress" TEXT,
    "clientAddress" TEXT,
    "agentAddress" TEXT,
    "recipientAddress" TEXT,
    "amountGross" TEXT,
    "agentPayout" TEXT,
    "platformFee" TEXT,
    "tokenAddress" TEXT,
    "tokenSymbol" TEXT,
    "escrowContractVersion" TEXT,
    "factoryBound" BOOLEAN NOT NULL DEFAULT false,
    "factoryBindingStatus" TEXT NOT NULL DEFAULT 'UNBOUND',
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "finalityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "decodedArgs" TEXT NOT NULL DEFAULT '{}',
    "proofHash" TEXT,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "IndexedChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowLifecycleState" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "chainKey" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "caip2Network" TEXT NOT NULL,
    "escrowAddress" TEXT NOT NULL,
    "factoryAddress" TEXT,
    "onchainJobId" TEXT,
    "escrowContractVersion" TEXT,
    "tokenAddress" TEXT,
    "tokenSymbol" TEXT,
    "amountGross" TEXT,
    "agentPayout" TEXT,
    "platformFee" TEXT,
    "clientAddress" TEXT,
    "agentAddress" TEXT,
    "factoryBound" BOOLEAN NOT NULL DEFAULT false,
    "factoryBindingStatus" TEXT NOT NULL DEFAULT 'UNBOUND',
    "factoryBindingProofHash" TEXT,
    "factoryBindingTxHash" TEXT,
    "factoryBindingBlockNumber" TEXT,
    "factoryBindingLogIndex" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "finalityStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "latestTxHash" TEXT,
    "latestBlockNumber" TEXT,
    "latestTransactionIndex" INTEGER,
    "latestLogIndex" INTEGER,
    "createdOnchainAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowLifecycleState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChainIndexerCursor_chainKey_key" ON "ChainIndexerCursor"("chainKey");

-- CreateIndex
CREATE INDEX "ChainIndexerCursor_chainId_idx" ON "ChainIndexerCursor"("chainId");

-- CreateIndex
CREATE INDEX "ChainIndexerCursor_cursorStatus_idx" ON "ChainIndexerCursor"("cursorStatus");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_jobId_idx" ON "IndexedChainEvent"("jobId");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_chainId_idx" ON "IndexedChainEvent"("chainId");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_chainKey_idx" ON "IndexedChainEvent"("chainKey");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_escrowAddress_idx" ON "IndexedChainEvent"("escrowAddress");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_eventName_idx" ON "IndexedChainEvent"("eventName");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_lifecycleType_idx" ON "IndexedChainEvent"("lifecycleType");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_finalityStatus_idx" ON "IndexedChainEvent"("finalityStatus");

-- CreateIndex
CREATE INDEX "IndexedChainEvent_blockNumber_idx" ON "IndexedChainEvent"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedChainEvent_chainId_txHash_logIndex_key" ON "IndexedChainEvent"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowLifecycleState_jobId_key" ON "EscrowLifecycleState"("jobId");

-- CreateIndex
CREATE INDEX "EscrowLifecycleState_jobId_idx" ON "EscrowLifecycleState"("jobId");

-- CreateIndex
CREATE INDEX "EscrowLifecycleState_chainId_idx" ON "EscrowLifecycleState"("chainId");

-- CreateIndex
CREATE INDEX "EscrowLifecycleState_chainKey_idx" ON "EscrowLifecycleState"("chainKey");

-- CreateIndex
CREATE INDEX "EscrowLifecycleState_state_idx" ON "EscrowLifecycleState"("state");

-- CreateIndex
CREATE INDEX "EscrowLifecycleState_finalityStatus_idx" ON "EscrowLifecycleState"("finalityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowLifecycleState_chainId_escrowAddress_key" ON "EscrowLifecycleState"("chainId", "escrowAddress");

-- AddForeignKey
ALTER TABLE "IndexedChainEvent" ADD CONSTRAINT "IndexedChainEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowLifecycleState" ADD CONSTRAINT "EscrowLifecycleState_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

