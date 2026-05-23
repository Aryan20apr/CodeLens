-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('RECEIVED', 'ENQUEUED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrReviewRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "installationId" BIGINT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("installationId")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "deliveryId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "installationId" BIGINT,
    "repoFullName" TEXT,
    "prNumber" INTEGER,
    "headSha" TEXT,
    "baseSha" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "jobId" TEXT,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateTable
CREATE TABLE "PrReviewRun" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "baseSha" TEXT NOT NULL,
    "status" "PrReviewRunStatus" NOT NULL DEFAULT 'PENDING',
    "summaryText" TEXT,
    "githubReviewId" BIGINT,
    "bullmqJobId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrReviewRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitHubInstallation_accountLogin_idx" ON "GitHubInstallation"("accountLogin");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_repoFullName_prNumber_idx" ON "WebhookDelivery"("repoFullName", "prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrReviewRun_deliveryId_key" ON "PrReviewRun"("deliveryId");

-- CreateIndex
CREATE INDEX "PrReviewRun_repoFullName_prNumber_idx" ON "PrReviewRun"("repoFullName", "prNumber");

-- CreateIndex
CREATE INDEX "PrReviewRun_repoFullName_prNumber_headSha_idx" ON "PrReviewRun"("repoFullName", "prNumber", "headSha");

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("installationId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReviewRun" ADD CONSTRAINT "PrReviewRun_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("deliveryId") ON DELETE RESTRICT ON UPDATE CASCADE;
