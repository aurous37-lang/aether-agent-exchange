-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "termsAcceptedAt" TIMESTAMP(3),
    "policyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "handlerId" TEXT NOT NULL,
    "metadataURI" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "models" TEXT NOT NULL DEFAULT '[]',
    "avatarUrl" TEXT,
    "availability" TEXT NOT NULL DEFAULT '24/7',
    "responseTime" TEXT NOT NULL DEFAULT '< 5 minutes',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "autonomousAccept" BOOLEAN NOT NULL DEFAULT false,
    "paymentPrivacyMode" TEXT NOT NULL DEFAULT 'standard',
    "configDisclosureMode" TEXT NOT NULL DEFAULT 'summary',
    "modelDisclosureMode" TEXT NOT NULL DEFAULT 'public',
    "apiCallDisclosureMode" TEXT NOT NULL DEFAULT 'summary',
    "publicConfigSummary" TEXT,
    "x402EndpointUrl" TEXT,
    "px402Supported" BOOLEAN NOT NULL DEFAULT false,
    "probePriceUsd" TEXT,
    "probeDescription" TEXT,
    "probeMethod" TEXT NOT NULL DEFAULT 'GET',
    "probeSchemaHash" TEXT,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCompletionMin" INTEGER NOT NULL DEFAULT 0,
    "responseTimeAvg" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApiKey" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL DEFAULT '[]',
    "acceptanceCriteria" TEXT,
    "budgetAmount" DOUBLE PRECISION NOT NULL,
    "budgetToken" TEXT NOT NULL,
    "suggestedMin" DOUBLE PRECISION,
    "suggestedMax" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3),
    "reviewPeriod" INTEGER NOT NULL DEFAULT 604800,
    "escrowAddress" TEXT,
    "settlementRail" TEXT NOT NULL DEFAULT 'offchain',
    "network" TEXT NOT NULL DEFAULT 'base',
    "chainId" INTEGER NOT NULL DEFAULT 8453,
    "tokenAddress" TEXT,
    "onchainJobId" TEXT,
    "escrowContractVersion" TEXT NOT NULL DEFAULT 'legacy',
    "evaluatorWallet" TEXT,
    "expiredAt" TIMESTAMP(3),
    "settlementStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "completedByEvaluatorAt" TIMESTAMP(3),
    "workspaceProvider" TEXT NOT NULL DEFAULT 'github',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clientId" TEXT NOT NULL,
    "agentId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractWorkspace" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'linked',
    "status" TEXT NOT NULL DEFAULT 'PROVISIONING',
    "liveMode" BOOLEAN NOT NULL DEFAULT false,
    "provisioningIdempotencyKey" TEXT,
    "providerWorkspaceId" TEXT,
    "repoUrl" TEXT,
    "repoOwner" TEXT,
    "repoName" TEXT,
    "providerIdentity" TEXT,
    "nodeUrl" TEXT,
    "repoDid" TEXT,
    "cloneUrl" TEXT,
    "defaultBranch" TEXT,
    "branchRef" TEXT,
    "prRef" TEXT,
    "prNumber" INTEGER,
    "commitSha" TEXT,
    "treeCid" TEXT,
    "refCertificateCid" TEXT,
    "actorDids" TEXT NOT NULL DEFAULT '[]',
    "ucanDelegationRefs" TEXT NOT NULL DEFAULT '[]',
    "capabilitySummary" TEXT,
    "latestVerificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "credentialsReady" BOOLEAN NOT NULL DEFAULT false,
    "delegationReady" BOOLEAN NOT NULL DEFAULT false,
    "nodeReady" BOOLEAN NOT NULL DEFAULT false,
    "webhookReady" BOOLEAN NOT NULL DEFAULT false,
    "verificationReady" BOOLEAN NOT NULL DEFAULT false,
    "provisioningAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastProvisioningError" TEXT,
    "lastReconciledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceProvisioningJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "action" TEXT NOT NULL DEFAULT 'provision',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "actor" TEXT,
    "actorDid" TEXT,
    "actorProviderId" TEXT,
    "branchRef" TEXT,
    "prRef" TEXT,
    "prNumber" INTEGER,
    "commitSha" TEXT,
    "treeCid" TEXT,
    "refCertificateCid" TEXT,
    "payload" TEXT,
    "normalizedData" TEXT,
    "deliverySignatureHash" TEXT,
    "deliveryTimestamp" TIMESTAMP(3),
    "replayWindowSeconds" INTEGER,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "replayProtected" BOOLEAN NOT NULL DEFAULT false,
    "ingestedBy" TEXT NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceVerificationResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submissionRef" TEXT NOT NULL,
    "branchRef" TEXT,
    "prRef" TEXT,
    "prNumber" INTEGER,
    "commitSha" TEXT,
    "treeCid" TEXT,
    "refCertificateCid" TEXT,
    "signerDid" TEXT,
    "actorProviderId" TEXT,
    "targetBranch" TEXT,
    "deliverablePaths" TEXT NOT NULL DEFAULT '[]',
    "checks" TEXT NOT NULL DEFAULT '[]',
    "failureReasons" TEXT NOT NULL DEFAULT '[]',
    "evidence" TEXT,
    "verifiedBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceVerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceEvidenceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL DEFAULT 'final',
    "repoUrl" TEXT,
    "cloneUrl" TEXT,
    "branchRef" TEXT,
    "prRef" TEXT,
    "prNumber" INTEGER,
    "commitSha" TEXT,
    "treeCid" TEXT,
    "refCertificateCid" TEXT,
    "verificationResultId" TEXT,
    "evidence" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceEvidenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLedger" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "receipt" TEXT NOT NULL,
    "rail" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'settlement',
    "amount" TEXT,
    "token" TEXT,
    "tokenSymbol" TEXT,
    "tokenAddress" TEXT,
    "wallet" TEXT,
    "walletAddress" TEXT,
    "payerWallet" TEXT,
    "payeeWallet" TEXT,
    "endpoint" TEXT,
    "escrow" TEXT,
    "escrowAddress" TEXT,
    "txHash" TEXT,
    "receiptHash" TEXT NOT NULL,
    "chainId" INTEGER,
    "network" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "redactedReference" TEXT,
    "redactedReferenceHash" TEXT,
    "redactedReferenceType" TEXT,
    "redactedPaymentReference" TEXT,
    "escrowContractVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "PaymentLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementReceiptVerification" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "paymentLedgerId" TEXT,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'base-sepolia',
    "rail" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'funding',
    "escrowContractVersion" TEXT,
    "chainId" INTEGER NOT NULL,
    "network" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "onchainStatus" TEXT,
    "proofType" TEXT,
    "proofHash" TEXT,
    "proofSummary" TEXT,
    "failureReason" TEXT,
    "blockNumber" TEXT,
    "logIndex" INTEGER,
    "eventName" TEXT,
    "escrowAddress" TEXT,
    "recipientAddress" TEXT,
    "amount" TEXT,
    "tokenSymbol" TEXT,
    "tokenAddress" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementReceiptVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpProvider" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "network" TEXT,
    "chainId" INTEGER,
    "endpointRef" TEXT,
    "endpointHash" TEXT,
    "capabilitySummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpSession" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT,
    "jobId" TEXT,
    "sessionRef" TEXT,
    "sessionHash" TEXT,
    "requestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "chainId" INTEGER,
    "network" TEXT,
    "scopeSummary" TEXT,
    "approvalUrlRef" TEXT,
    "approvalUrlHash" TEXT,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToolCatalog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolVersion" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "schemaHash" TEXT,
    "capabilitySummary" TEXT,
    "calldataSummary" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpToolCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpToolPolicy" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "toolCatalogId" TEXT,
    "userId" TEXT,
    "jobId" TEXT,
    "policyRef" TEXT,
    "policyHash" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "approvalMode" TEXT NOT NULL DEFAULT 'manual',
    "chainId" INTEGER,
    "network" TEXT,
    "capabilitySummary" TEXT,
    "calldataSummary" TEXT,
    "maxValueSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "McpToolPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpApprovalRequest" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "toolCatalogId" TEXT,
    "toolPolicyId" TEXT,
    "userId" TEXT,
    "jobId" TEXT,
    "paymentLedgerId" TEXT,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "chainId" INTEGER,
    "network" TEXT,
    "toolName" TEXT,
    "approvalUrlRef" TEXT,
    "approvalUrlHash" TEXT,
    "calldataSummary" TEXT,
    "callTargetRef" TEXT,
    "valueSummary" TEXT,
    "txHash" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpReceipt" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "approvalRequestId" TEXT,
    "userId" TEXT,
    "jobId" TEXT,
    "paymentLedgerId" TEXT,
    "requestId" TEXT,
    "receiptRef" TEXT,
    "receiptHash" TEXT NOT NULL,
    "receiptType" TEXT NOT NULL DEFAULT 'tool',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "chainId" INTEGER,
    "network" TEXT,
    "txHash" TEXT,
    "toolName" TEXT,
    "calldataSummary" TEXT,
    "resultSummary" TEXT,
    "paymentReferenceHash" TEXT,
    "observedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "estimatedDuration" TEXT NOT NULL,
    "message" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "deliverableHash" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "agentBps" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArbiterVote" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "arbiterWallet" TEXT NOT NULL,
    "agentBps" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArbiterVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobReport" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentActionLog" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "jobId" TEXT,
    "inputHash" TEXT,
    "outputHash" TEXT,
    "reasoning" TEXT,
    "autonomous" BOOLEAN NOT NULL DEFAULT true,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "UserConsent_userId_idx" ON "UserConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserConsent_userId_consentType_policyVersion_key" ON "UserConsent"("userId", "consentType", "policyVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_agentId_key" ON "Agent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_walletAddress_key" ON "Agent"("walletAddress");

-- CreateIndex
CREATE INDEX "AgentApiKey_agentId_idx" ON "AgentApiKey"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractWorkspace_jobId_key" ON "ContractWorkspace"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractWorkspace_provisioningIdempotencyKey_key" ON "ContractWorkspace"("provisioningIdempotencyKey");

-- CreateIndex
CREATE INDEX "ContractWorkspace_provider_idx" ON "ContractWorkspace"("provider");

-- CreateIndex
CREATE INDEX "ContractWorkspace_status_idx" ON "ContractWorkspace"("status");

-- CreateIndex
CREATE INDEX "ContractWorkspace_liveMode_idx" ON "ContractWorkspace"("liveMode");

-- CreateIndex
CREATE INDEX "ContractWorkspace_latestVerificationStatus_idx" ON "ContractWorkspace"("latestVerificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceProvisioningJob_idempotencyKey_key" ON "WorkspaceProvisioningJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioningJob_workspaceId_idx" ON "WorkspaceProvisioningJob"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioningJob_jobId_idx" ON "WorkspaceProvisioningJob"("jobId");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioningJob_provider_idx" ON "WorkspaceProvisioningJob"("provider");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioningJob_status_idx" ON "WorkspaceProvisioningJob"("status");

-- CreateIndex
CREATE INDEX "WorkspaceProvisioningJob_nextRunAt_idx" ON "WorkspaceProvisioningJob"("nextRunAt");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_jobId_idx" ON "WorkspaceEvent"("jobId");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_provider_idx" ON "WorkspaceEvent"("provider");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_eventType_idx" ON "WorkspaceEvent"("eventType");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_commitSha_idx" ON "WorkspaceEvent"("commitSha");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_ingestedAt_idx" ON "WorkspaceEvent"("ingestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEvent_workspaceId_providerEventId_key" ON "WorkspaceEvent"("workspaceId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEvent_workspaceId_deliverySignatureHash_key" ON "WorkspaceEvent"("workspaceId", "deliverySignatureHash");

-- CreateIndex
CREATE INDEX "WorkspaceVerificationResult_workspaceId_idx" ON "WorkspaceVerificationResult"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceVerificationResult_jobId_idx" ON "WorkspaceVerificationResult"("jobId");

-- CreateIndex
CREATE INDEX "WorkspaceVerificationResult_status_idx" ON "WorkspaceVerificationResult"("status");

-- CreateIndex
CREATE INDEX "WorkspaceVerificationResult_commitSha_idx" ON "WorkspaceVerificationResult"("commitSha");

-- CreateIndex
CREATE INDEX "WorkspaceVerificationResult_verifiedAt_idx" ON "WorkspaceVerificationResult"("verifiedAt");

-- CreateIndex
CREATE INDEX "WorkspaceEvidenceSnapshot_jobId_idx" ON "WorkspaceEvidenceSnapshot"("jobId");

-- CreateIndex
CREATE INDEX "WorkspaceEvidenceSnapshot_provider_idx" ON "WorkspaceEvidenceSnapshot"("provider");

-- CreateIndex
CREATE INDEX "WorkspaceEvidenceSnapshot_commitSha_idx" ON "WorkspaceEvidenceSnapshot"("commitSha");

-- CreateIndex
CREATE INDEX "WorkspaceEvidenceSnapshot_createdAt_idx" ON "WorkspaceEvidenceSnapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEvidenceSnapshot_workspaceId_evidenceHash_key" ON "WorkspaceEvidenceSnapshot"("workspaceId", "evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLedger_txHash_key" ON "PaymentLedger"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLedger_receiptHash_key" ON "PaymentLedger"("receiptHash");

-- CreateIndex
CREATE INDEX "PaymentLedger_jobId_idx" ON "PaymentLedger"("jobId");

-- CreateIndex
CREATE INDEX "PaymentLedger_rail_idx" ON "PaymentLedger"("rail");

-- CreateIndex
CREATE INDEX "PaymentLedger_mode_idx" ON "PaymentLedger"("mode");

-- CreateIndex
CREATE INDEX "PaymentLedger_status_idx" ON "PaymentLedger"("status");

-- CreateIndex
CREATE INDEX "PaymentLedger_chainId_idx" ON "PaymentLedger"("chainId");

-- CreateIndex
CREATE INDEX "PaymentLedger_createdAt_idx" ON "PaymentLedger"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementReceiptVerification_paymentLedgerId_key" ON "SettlementReceiptVerification"("paymentLedgerId");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_jobId_idx" ON "SettlementReceiptVerification"("jobId");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_paymentLedgerId_idx" ON "SettlementReceiptVerification"("paymentLedgerId");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_provider_idx" ON "SettlementReceiptVerification"("provider");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_status_idx" ON "SettlementReceiptVerification"("status");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_chainId_idx" ON "SettlementReceiptVerification"("chainId");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_network_idx" ON "SettlementReceiptVerification"("network");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_txHash_idx" ON "SettlementReceiptVerification"("txHash");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_receiptHash_idx" ON "SettlementReceiptVerification"("receiptHash");

-- CreateIndex
CREATE INDEX "SettlementReceiptVerification_verifiedAt_idx" ON "SettlementReceiptVerification"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpProvider_providerKey_key" ON "McpProvider"("providerKey");

-- CreateIndex
CREATE INDEX "McpProvider_status_idx" ON "McpProvider"("status");

-- CreateIndex
CREATE INDEX "McpProvider_chainId_idx" ON "McpProvider"("chainId");

-- CreateIndex
CREATE INDEX "McpSession_providerId_idx" ON "McpSession"("providerId");

-- CreateIndex
CREATE INDEX "McpSession_userId_idx" ON "McpSession"("userId");

-- CreateIndex
CREATE INDEX "McpSession_jobId_idx" ON "McpSession"("jobId");

-- CreateIndex
CREATE INDEX "McpSession_status_idx" ON "McpSession"("status");

-- CreateIndex
CREATE INDEX "McpSession_chainId_idx" ON "McpSession"("chainId");

-- CreateIndex
CREATE INDEX "McpSession_approvalUrlHash_idx" ON "McpSession"("approvalUrlHash");

-- CreateIndex
CREATE INDEX "McpSession_expiresAt_idx" ON "McpSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpSession_providerId_sessionHash_key" ON "McpSession"("providerId", "sessionHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpSession_providerId_requestId_key" ON "McpSession"("providerId", "requestId");

-- CreateIndex
CREATE INDEX "McpToolCatalog_providerId_idx" ON "McpToolCatalog"("providerId");

-- CreateIndex
CREATE INDEX "McpToolCatalog_toolName_idx" ON "McpToolCatalog"("toolName");

-- CreateIndex
CREATE INDEX "McpToolCatalog_status_idx" ON "McpToolCatalog"("status");

-- CreateIndex
CREATE INDEX "McpToolCatalog_schemaHash_idx" ON "McpToolCatalog"("schemaHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpToolCatalog_providerId_toolName_toolVersion_key" ON "McpToolCatalog"("providerId", "toolName", "toolVersion");

-- CreateIndex
CREATE INDEX "McpToolPolicy_providerId_idx" ON "McpToolPolicy"("providerId");

-- CreateIndex
CREATE INDEX "McpToolPolicy_toolCatalogId_idx" ON "McpToolPolicy"("toolCatalogId");

-- CreateIndex
CREATE INDEX "McpToolPolicy_userId_idx" ON "McpToolPolicy"("userId");

-- CreateIndex
CREATE INDEX "McpToolPolicy_jobId_idx" ON "McpToolPolicy"("jobId");

-- CreateIndex
CREATE INDEX "McpToolPolicy_status_idx" ON "McpToolPolicy"("status");

-- CreateIndex
CREATE INDEX "McpToolPolicy_chainId_idx" ON "McpToolPolicy"("chainId");

-- CreateIndex
CREATE INDEX "McpToolPolicy_policyHash_idx" ON "McpToolPolicy"("policyHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpToolPolicy_providerId_policyHash_key" ON "McpToolPolicy"("providerId", "policyHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpApprovalRequest_txHash_key" ON "McpApprovalRequest"("txHash");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_providerId_idx" ON "McpApprovalRequest"("providerId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_sessionId_idx" ON "McpApprovalRequest"("sessionId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_toolCatalogId_idx" ON "McpApprovalRequest"("toolCatalogId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_toolPolicyId_idx" ON "McpApprovalRequest"("toolPolicyId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_userId_idx" ON "McpApprovalRequest"("userId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_jobId_idx" ON "McpApprovalRequest"("jobId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_paymentLedgerId_idx" ON "McpApprovalRequest"("paymentLedgerId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_status_idx" ON "McpApprovalRequest"("status");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_chainId_idx" ON "McpApprovalRequest"("chainId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_requestId_idx" ON "McpApprovalRequest"("requestId");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_approvalUrlHash_idx" ON "McpApprovalRequest"("approvalUrlHash");

-- CreateIndex
CREATE INDEX "McpApprovalRequest_requestedAt_idx" ON "McpApprovalRequest"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpApprovalRequest_providerId_requestId_key" ON "McpApprovalRequest"("providerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "McpReceipt_receiptHash_key" ON "McpReceipt"("receiptHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpReceipt_txHash_key" ON "McpReceipt"("txHash");

-- CreateIndex
CREATE INDEX "McpReceipt_providerId_idx" ON "McpReceipt"("providerId");

-- CreateIndex
CREATE INDEX "McpReceipt_sessionId_idx" ON "McpReceipt"("sessionId");

-- CreateIndex
CREATE INDEX "McpReceipt_approvalRequestId_idx" ON "McpReceipt"("approvalRequestId");

-- CreateIndex
CREATE INDEX "McpReceipt_userId_idx" ON "McpReceipt"("userId");

-- CreateIndex
CREATE INDEX "McpReceipt_jobId_idx" ON "McpReceipt"("jobId");

-- CreateIndex
CREATE INDEX "McpReceipt_paymentLedgerId_idx" ON "McpReceipt"("paymentLedgerId");

-- CreateIndex
CREATE INDEX "McpReceipt_requestId_idx" ON "McpReceipt"("requestId");

-- CreateIndex
CREATE INDEX "McpReceipt_status_idx" ON "McpReceipt"("status");

-- CreateIndex
CREATE INDEX "McpReceipt_chainId_idx" ON "McpReceipt"("chainId");

-- CreateIndex
CREATE INDEX "McpReceipt_receiptHash_idx" ON "McpReceipt"("receiptHash");

-- CreateIndex
CREATE INDEX "McpReceipt_txHash_idx" ON "McpReceipt"("txHash");

-- CreateIndex
CREATE INDEX "McpReceipt_observedAt_idx" ON "McpReceipt"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_jobId_agentId_key" ON "Bid"("jobId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_jobId_key" ON "Dispute"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ArbiterVote_disputeId_arbiterWallet_key" ON "ArbiterVote"("disputeId", "arbiterWallet");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_jobId_userId_key" ON "Rating"("jobId", "userId");

-- CreateIndex
CREATE INDEX "JobReport_jobId_idx" ON "JobReport"("jobId");

-- CreateIndex
CREATE INDEX "JobReport_status_idx" ON "JobReport"("status");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_actor_idx" ON "PlatformAuditLog"("actor");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_action_idx" ON "PlatformAuditLog"("action");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AgentActionLog_agentId_idx" ON "AgentActionLog"("agentId");

-- CreateIndex
CREATE INDEX "AgentActionLog_createdAt_idx" ON "AgentActionLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserConsent" ADD CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_handlerId_fkey" FOREIGN KEY ("handlerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractWorkspace" ADD CONSTRAINT "ContractWorkspace_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceProvisioningJob" ADD CONSTRAINT "WorkspaceProvisioningJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContractWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContractWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceVerificationResult" ADD CONSTRAINT "WorkspaceVerificationResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContractWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvidenceSnapshot" ADD CONSTRAINT "WorkspaceEvidenceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ContractWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLedger" ADD CONSTRAINT "PaymentLedger_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementReceiptVerification" ADD CONSTRAINT "SettlementReceiptVerification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementReceiptVerification" ADD CONSTRAINT "SettlementReceiptVerification_paymentLedgerId_fkey" FOREIGN KEY ("paymentLedgerId") REFERENCES "PaymentLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpSession" ADD CONSTRAINT "McpSession_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "McpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpSession" ADD CONSTRAINT "McpSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpSession" ADD CONSTRAINT "McpSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToolCatalog" ADD CONSTRAINT "McpToolCatalog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "McpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToolPolicy" ADD CONSTRAINT "McpToolPolicy_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "McpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToolPolicy" ADD CONSTRAINT "McpToolPolicy_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "McpToolCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToolPolicy" ADD CONSTRAINT "McpToolPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToolPolicy" ADD CONSTRAINT "McpToolPolicy_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "McpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "McpSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_toolCatalogId_fkey" FOREIGN KEY ("toolCatalogId") REFERENCES "McpToolCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_toolPolicyId_fkey" FOREIGN KEY ("toolPolicyId") REFERENCES "McpToolPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApprovalRequest" ADD CONSTRAINT "McpApprovalRequest_paymentLedgerId_fkey" FOREIGN KEY ("paymentLedgerId") REFERENCES "PaymentLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "McpProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "McpSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "McpApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpReceipt" ADD CONSTRAINT "McpReceipt_paymentLedgerId_fkey" FOREIGN KEY ("paymentLedgerId") REFERENCES "PaymentLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvidence" ADD CONSTRAINT "DisputeEvidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArbiterVote" ADD CONSTRAINT "ArbiterVote_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReport" ADD CONSTRAINT "JobReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobReport" ADD CONSTRAINT "JobReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentActionLog" ADD CONSTRAINT "AgentActionLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

