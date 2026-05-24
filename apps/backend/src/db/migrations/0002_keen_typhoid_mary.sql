ALTER TABLE "users" ADD COLUMN "tier_level" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Backfill existing players to the tier their lifetime wager already earns, so
-- their next settled bet does not retroactively pay out every tier-up reward.
-- Thresholds mirror packages/shared/src/tiers.ts (keep in sync if they change).
UPDATE "users" SET "tier_level" = CASE
  WHEN "total_wagered" >= 40000000 THEN 5
  WHEN "total_wagered" >= 6000000  THEN 4
  WHEN "total_wagered" >= 1000000  THEN 3
  WHEN "total_wagered" >= 150000   THEN 2
  WHEN "total_wagered" >= 25000    THEN 1
  ELSE 0
END;