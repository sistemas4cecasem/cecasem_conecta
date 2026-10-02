BEGIN;
-- No backfill: las etiquetas que nunca fueron guardadas no pueden inventarse.
ALTER TABLE "DirectoryChange" ADD COLUMN "referenceSnapshot" JSONB;
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_snapshot_check" CHECK (
  "referenceSnapshot" IS NULL OR (
    jsonb_typeof("referenceSnapshot") = 'object'
    AND "referenceSnapshot" ?& ARRAY['previous','next','related']
    AND jsonb_typeof("referenceSnapshot"->'previous') = 'array'
    AND jsonb_typeof("referenceSnapshot"->'next') = 'array'
    AND jsonb_typeof("referenceSnapshot"->'related') = 'array'
  )
);
ALTER TABLE "DirectoryChange" DROP CONSTRAINT "DirectoryChange_field_check";
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_field_check" CHECK (
  ((("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
    (field = 'isActive' AND "personRelationId" IS NULL AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR (field = 'name' AND ("organizationId" IS NOT NULL OR "categoryId" IS NOT NULL) AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("organizationId" IS NOT NULL AND field IN ('country','alias','description','officialWebsite','parentId')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("organizationId" IS NOT NULL AND field = 'categoryIds'
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
);
COMMIT;
