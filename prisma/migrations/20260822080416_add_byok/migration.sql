-- CreateEnum
CREATE TYPE "LlmProvider" AS ENUM ('GEMINI', 'OPENAI', 'GROQ', 'NVIDIA');

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "activeModel" TEXT,
ADD COLUMN     "activeProvider" "LlmProvider";

-- CreateTable
CREATE TABLE "LlmApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "LlmProvider" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "maskedKey" TEXT NOT NULL,
    "nvidiaBaseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmApiKey_userId_idx" ON "LlmApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LlmApiKey_userId_provider_key" ON "LlmApiKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "LlmApiKey" ADD CONSTRAINT "LlmApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
