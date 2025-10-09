ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;

-- Set values for existing rows
UPDATE "User"
SET "createdAt" = COALESCE("createdAt", NOW()),
    "updatedAt" = NOW()
WHERE "createdAt" IS NULL OR "updatedAt" IS NULL;

-- Ensure updatedAt auto-updates via trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'user_updated_at_trigger'
  ) THEN
    CREATE TRIGGER user_updated_at_trigger
    BEFORE UPDATE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION moddatetime('updatedAt');
  END IF;
END $$;

-- Make columns not null
ALTER TABLE "User"
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT NOW(),
  ALTER COLUMN "updatedAt" SET NOT NULL;
