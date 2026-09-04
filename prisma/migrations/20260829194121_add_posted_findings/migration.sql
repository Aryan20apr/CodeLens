-- CreateTable
CREATE TABLE "PrReviewPostedFinding" (
    "id" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "reviewRunId" TEXT NOT NULL,
    "filePath" TEXT,
    "category" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "githubReviewId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrReviewPostedFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrReviewPostedFinding_repoFullName_prNumber_idx" ON "PrReviewPostedFinding"("repoFullName", "prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PrReviewPostedFinding_repoFullName_prNumber_fingerprint_key" ON "PrReviewPostedFinding"("repoFullName", "prNumber", "fingerprint");
