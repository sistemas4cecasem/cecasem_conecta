BEGIN;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_name_check"
  CHECK (length(btrim(name)) > 0 AND name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))),
  ADD CONSTRAINT "Organization_version_check" CHECK (version > 0),
  ADD CONSTRAINT "Organization_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> id);
ALTER TABLE "Category" ADD CONSTRAINT "Category_name_check"
  CHECK (length(btrim(name)) > 0 AND name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))
    AND "normalizedName" = lower(name)),
  ADD CONSTRAINT "Category_version_check" CHECK (version > 0);
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_target_check"
  CHECK (("organizationId" IS NOT NULL AND "categoryId" IS NULL)
    OR ("categoryId" IS NOT NULL AND "organizationId" IS NULL)),
  ADD CONSTRAINT "DirectoryChange_field_check" CHECK (
    (field = 'isActive' AND jsonb_typeof("previousValue") = 'boolean' AND jsonb_typeof("newValue") = 'boolean')
    OR (field = 'name' AND jsonb_typeof("previousValue") = 'string' AND jsonb_typeof("newValue") = 'string')
    OR ("organizationId" IS NOT NULL AND field IN ('country','alias','description','officialWebsite','parentId')
      AND jsonb_typeof("previousValue") IN ('string','null') AND jsonb_typeof("newValue") IN ('string','null'))
    OR ("organizationId" IS NOT NULL AND field = 'categoryIds'
      AND jsonb_typeof("previousValue") = 'array' AND jsonb_typeof("newValue") = 'array'
      AND NOT jsonb_path_exists("previousValue", '$[*] ? (@.type() != "string")')
      AND NOT jsonb_path_exists("newValue", '$[*] ? (@.type() != "string")'))
  ), ADD CONSTRAINT "DirectoryChange_difference_check" CHECK ("previousValue" <> "newValue");

-- Preserve every Fase 1 action invariant, including the formerly NOT NULL user target.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (
  ("targetUserId" IS NOT NULL AND "organizationId" IS NULL AND "categoryId" IS NULL AND "operationId" IS NULL
    AND (
      (action IN ('PASSWORD_RESET_ISSUED','PASSWORD_RESET_REGENERATED','PASSWORD_RESET_COMPLETED','PASSWORD_RESET_REVOKED')
        AND "passwordResetTokenId" IS NOT NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
        AND ((action = 'PASSWORD_RESET_COMPLETED' AND "actorUserId" IS NULL)
          OR (action IN ('PASSWORD_RESET_ISSUED','PASSWORD_RESET_REGENERATED') AND "actorUserId" IS NOT NULL)
          OR action = 'PASSWORD_RESET_REVOKED'))
      OR (action = 'USER_ROLE_CHANGED' AND "actorUserId" IS NOT NULL
        AND "previousRole" IS NOT NULL AND "newRole" IS NOT NULL AND "previousRole" <> "newRole"
        AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
      OR (action IN ('USER_DEACTIVATED','USER_REACTIVATED') AND "actorUserId" IS NOT NULL
        AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL)
      OR (action IN ('MAILBOX_ASSIGNED','MAILBOX_REMOVED') AND "actorUserId" IS NOT NULL
        AND "emailAccountId" IS NOT NULL AND "previousRole" IS NULL AND "newRole" IS NULL AND "passwordResetTokenId" IS NULL)
    ))
  OR ("targetUserId" IS NULL AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
    AND (
      (action IN ('ORGANIZATION_UPDATED','ORGANIZATION_STATUS_CHANGED') AND "organizationId" IS NOT NULL AND "categoryId" IS NULL)
      OR (action IN ('CATEGORY_UPDATED','CATEGORY_STATUS_CHANGED') AND "categoryId" IS NOT NULL AND "organizationId" IS NULL)
    ))
);
COMMIT;
