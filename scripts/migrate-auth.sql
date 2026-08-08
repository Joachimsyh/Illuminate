ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

CREATE TABLE IF NOT EXISTS "LoginSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "userAgent" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "LoginSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginSession_userId_idx" ON "LoginSession"("userId");
CREATE INDEX IF NOT EXISTS "LoginSession_createdAt_idx" ON "LoginSession"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LoginSession_userId_fkey'
  ) THEN
    ALTER TABLE "LoginSession"
      ADD CONSTRAINT "LoginSession_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
