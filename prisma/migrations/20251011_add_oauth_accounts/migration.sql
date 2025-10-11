-- AlterTable User: Add OAuth fields
ALTER TABLE "User" 
  ADD COLUMN IF NOT EXISTS "googleId" TEXT,
  ADD COLUMN IF NOT EXISTS "yandexId" TEXT,
  ADD COLUMN IF NOT EXISTS "mailruId" TEXT;

-- Create unique indexes for OAuth IDs
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_yandexId_key" ON "User"("yandexId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_mailruId_key" ON "User"("mailruId");

-- CreateTable OAuthAccount
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_providerId_key" ON "OAuthAccount"("provider", "providerId");
CREATE INDEX IF NOT EXISTS "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");
CREATE INDEX IF NOT EXISTS "OAuthAccount_provider_idx" ON "OAuthAccount"("provider");
CREATE INDEX IF NOT EXISTS "OAuthAccount_email_idx" ON "OAuthAccount"("email");

-- AddForeignKey
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'OAuthAccount_userId_fkey'
    ) THEN
        ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

