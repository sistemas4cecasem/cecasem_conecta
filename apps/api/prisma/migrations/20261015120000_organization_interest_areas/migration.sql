BEGIN;

ALTER TABLE "Organization" ADD COLUMN "interestAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Preserve assigned names (including inactive catalog entries) without inferring new data.
UPDATE "Organization" o SET "interestAreas" = (
  SELECT array_agg(c.name ORDER BY c.name, c.id)
  FROM "OrganizationCategory" oc JOIN "Category" c ON c.id = oc."categoryId"
  WHERE oc."organizationId" = o.id
) WHERE EXISTS (SELECT 1 FROM "OrganizationCategory" oc WHERE oc."organizationId" = o.id);

-- Retain the retired catalog, frozen links and all foreign keys for institutional history.
ALTER TABLE "Category" RENAME TO "ArchivedCategory";
ALTER TABLE "OrganizationCategory" RENAME TO "ArchivedOrganizationCategory";

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_interestAreas_check" CHECK (
  cardinality("interestAreas") <= 100 AND array_position("interestAreas", NULL) IS NULL
  AND coalesce(array_length("interestAreas", 2), 0) = 0
);

ALTER TABLE "DirectoryChange" DROP CONSTRAINT "DirectoryChange_field_check";
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_field_check" CHECK ((
  ((("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
    (field = 'isActive' AND "personRelationId" IS NULL AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR (field = 'name' AND ("organizationId" IS NOT NULL OR "categoryId" IS NOT NULL) AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("organizationId" IS NOT NULL AND field IN ('country','alias','description','officialWebsite','parentId','branchOfId')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("organizationId" IS NOT NULL AND field IN ('categoryIds', 'interestAreas')
      AND jsonb_typeof("previousValue") = 'array' AND jsonb_typeof("newValue") = 'array'
      AND NOT jsonb_path_exists("previousValue", '$[*] ? (@.type() != "string")')
      AND NOT jsonb_path_exists("newValue", '$[*] ? (@.type() != "string")'))
    OR ("personId" IS NOT NULL AND field = 'displayName' AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("personId" IS NOT NULL AND field IN ('givenNames','familyNames')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("personRelationId" IS NOT NULL AND field = 'isCurrent' AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR ("personRelationId" IS NOT NULL AND field IN ('positionTitle','area','startDate','endDate','sourceDescription','sourceUrl','notes')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
  ))
    OR ("contactMethodId" IS NOT NULL AND (
      (field = 'value' AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
      OR (field = 'label' AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
      OR (field = 'condition' AND "previousValue" IN ('"USABLE"'::jsonb,'"UNUSABLE"'::jsonb) AND "newValue" IN ('"USABLE"'::jsonb,'"UNUSABLE"'::jsonb))))
    OR (("personContactId" IS NOT NULL OR "organizationContactId" IS NOT NULL) AND (
      (field = 'associationCreated' AND jsonb_typeof("previousValue") = 'null' AND jsonb_typeof("newValue") = 'string')
      OR (field = 'isActive' AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
      OR (field IN ('sourceDescription','sourceUrl','notes') AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))))
  )
  OR ("personRelationId" IS NOT NULL AND field = 'relationCreated'
    AND jsonb_typeof("previousValue") = 'null' AND jsonb_typeof("newValue") = 'string')
) OR (("organizationId" IS NOT NULL AND field='duplicateOfOrganizationId' OR "personId" IS NOT NULL AND field='duplicateOfPersonId')
 AND jsonb_typeof("previousValue")='null' AND jsonb_typeof("newValue")='string')
 OR (("organizationId" IS NOT NULL AND field='consolidatedOrganizationIds' OR "personId" IS NOT NULL AND field='consolidatedPersonIds')
 AND jsonb_typeof("previousValue")='array' AND jsonb_typeof("newValue")='array'
 AND NOT jsonb_path_exists("previousValue", '$[*] ? (@.type() != "string")') AND NOT jsonb_path_exists("newValue", '$[*] ? (@.type() != "string")')));


COMMIT;
