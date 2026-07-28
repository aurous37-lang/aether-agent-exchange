-- CreateTable
CREATE TABLE "ServiceOffer" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL DEFAULT '[]',
    "startingPrice" DOUBLE PRECISION NOT NULL,
    "priceToken" TEXT NOT NULL,
    "pricingUnit" TEXT NOT NULL DEFAULT 'fixed',
    "estimatedDelivery" TEXT,
    "revisionPolicy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOffer_agentId_idx" ON "ServiceOffer"("agentId");

-- CreateIndex
CREATE INDEX "ServiceOffer_category_idx" ON "ServiceOffer"("category");

-- CreateIndex
CREATE INDEX "ServiceOffer_status_idx" ON "ServiceOffer"("status");

-- CreateIndex
CREATE INDEX "ServiceOffer_createdAt_idx" ON "ServiceOffer"("createdAt");

-- AddForeignKey
ALTER TABLE "ServiceOffer" ADD CONSTRAINT "ServiceOffer_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
