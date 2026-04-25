-- Store only SHA-256(apiKey) in apiKeyHash; drop raw apiKey column.
-- Backfill uses pgcrypto.digest (enable extension if the host allows it).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE "User" SET "apiKeyHash" = encode(digest("apiKey", 'sha256'), 'hex');

DROP INDEX IF EXISTS "User_apiKey_key";
ALTER TABLE "User" DROP COLUMN "apiKey";

DROP INDEX IF EXISTS "User_apiKeyHash_idx";
CREATE UNIQUE INDEX "User_apiKeyHash_key" ON "User"("apiKeyHash");
