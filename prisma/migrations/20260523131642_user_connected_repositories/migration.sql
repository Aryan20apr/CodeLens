-- CreateEnum
CREATE TYPE "PrReviewTrigger" AS ENUM ('WEBHOOK', 'MANUAL');

-- DropForeignKey
ALTER TABLE "PrReviewRun" DROP CONSTRAINT "PrReviewRun_deliveryId_fkey";

-- AlterTable
ALTER TABLE "GitHubInstallation" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "PrReviewRun" ADD COLUMN     "triggeredBy" "PrReviewTrigger" NOT NULL DEFAULT 'WEBHOOK',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "deliveryId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "InstallationRepository" (
    "id" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "repoId" BIGINT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "InstallationRepository_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallationRepository_installationId_idx" ON "InstallationRepository"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationRepository_installationId_repoId_key" ON "InstallationRepository"("installationId", "repoId");

-- CreateIndex
CREATE INDEX "GitHubInstallation_userId_idx" ON "GitHubInstallation"("userId");

-- CreateIndex
CREATE INDEX "PrReviewRun_userId_idx" ON "PrReviewRun"("userId");

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationRepository" ADD CONSTRAINT "InstallationRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubInstallation"("installationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReviewRun" ADD CONSTRAINT "PrReviewRun_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("deliveryId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrReviewRun" ADD CONSTRAINT "PrReviewRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
