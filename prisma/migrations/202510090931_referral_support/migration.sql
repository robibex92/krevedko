-- Ensure referral-related columns exist on "User"
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredBy" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER;

-- Normalize loyaltyPoints to non-null with default 0
UPDATE "User" SET "loyaltyPoints" = 0 WHERE "loyaltyPoints" IS NULL;
ALTER TABLE "User" ALTER COLUMN "loyaltyPoints" SET DEFAULT 0;
ALTER TABLE "User" ALTER COLUMN "loyaltyPoints" SET NOT NULL;

-- Ensure unique index for referral codes exists
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode") WHERE "referralCode" IS NOT NULL;

-- Ensure self-referencing foreign key for referredBy exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_referredBy_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_referredBy_fkey"
      FOREIGN KEY ("referredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
