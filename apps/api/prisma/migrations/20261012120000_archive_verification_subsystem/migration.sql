-- Retain all existing verification and interval settings data while taking the
-- subsystem out of the active schema and API. These are forward-only renames.
BEGIN;

ALTER TABLE "Verification" RENAME TO "HistoricalVerification";
ALTER TABLE "VerificationSettings" RENAME TO "ArchivedVerificationSettings";

ALTER TABLE "Organization" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "Person" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "PersonOrganizationRelation" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "PersonContact" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "OrganizationContact" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "ImportedHistoricalRecord" RENAME COLUMN "lastVerifiedAt" TO "legacyLastVerifiedAt";
ALTER TABLE "ContactMethod" RENAME COLUMN "valueVersion" TO "legacyValueVersion";

COMMENT ON TABLE "HistoricalVerification" IS 'Archived verification events retained for historical traceability. No active workflow writes or reads this table.';
COMMENT ON TABLE "ArchivedVerificationSettings" IS 'Archived verification interval configuration. No active workflow reads or writes this table.';
COMMENT ON COLUMN "Organization"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "Person"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "PersonOrganizationRelation"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "PersonContact"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "OrganizationContact"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "ImportedHistoricalRecord"."legacyLastVerifiedAt" IS 'Archived verification metadata retained during subsystem retirement.';
COMMENT ON COLUMN "ContactMethod"."legacyValueVersion" IS 'Archived verification concurrency metadata retained during subsystem retirement.';

COMMIT;
