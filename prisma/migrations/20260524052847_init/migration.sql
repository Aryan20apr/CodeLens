/*
  Warnings:

  - You are about to drop the `InstallationRepository` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PrReviewRun` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "PrReviewStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "InstallationRepository" DROP CONSTRAINT "InstallationRepository_installationId_fkey";

-- DropForeignKey
ALTER TABLE "PrReviewRun" DROP CONSTRAINT "PrReviewRun_deliveryId_fkey";

-- DropForeignKey
ALTER TABLE "PrReviewRun" DROP CONSTRAINT "PrReviewRun_userId_fkey";

-- DropTable
DROP TABLE "InstallationRepository";

-- DropTable
DROP TABLE "PrReviewRun";

-- DropEnum
DROP TYPE "PrReviewRunStatus";

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "repoId" BIGINT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrReview" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT,
    "installationId" BIGINT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "baseSha" TEXT NOT NULL,
    "status" "PrReviewStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" "PrReviewTrigger" NOT NULL DEFAULT 'WEBHOOK',
    "userId" TEXT,
    "summaryText" TEXT,
    "githubReviewId" BIGINT,
    "bullmqJobId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_installationId_idx" ON "Connection"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_installationId_repoId_key" ON "Connection"("installationId", "repoId");

-- CreateIndex
CREATE UNIQUE INDEX "PrReview_deliveryId_key" ON "PrReview"("deliveryId");

-- CreateIndex
CREATE INDEX "PrReview_repoFullName_prNumber_idx" ON "PrReview"("repoFullName", "prNumber");

-- CreateIndex
CREATE INDEX "PrReview_repoFullName_prNumber_headSha_idx" ON "PrReview"("repoFullName", "prNumber", "headSha");

-- CreateIndex
CREATE INDEX "PrReview_userId_idx" ON "PrReview"("userId");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("installationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReview" ADD CONSTRAINT "PrReview_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("deliveryId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReview" ADD CONSTRAINT "PrReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
