BEGIN;
CREATE UNIQUE INDEX "ContactMethod_email_unique" ON "ContactMethod" ("normalizedValue") WHERE type = 'EMAIL';
ALTER TABLE "ContactMethod" ADD CONSTRAINT "ContactMethod_version_check" CHECK (version > 0),
  ADD CONSTRAINT "ContactMethod_value_check" CHECK (length(btrim(value)) > 0 AND value = btrim(value)),
  ADD CONSTRAINT "ContactMethod_email_check" CHECK (
    (type = 'EMAIL' AND "normalizedValue" IS NOT NULL AND value = "normalizedValue"
      AND value = lower(btrim(value)) AND length(value) <= 254)
    OR (type <> 'EMAIL' AND "normalizedValue" IS NULL)),
  ADD CONSTRAINT "ContactMethod_other_label_check" CHECK (type <> 'OTHER' OR (label IS NOT NULL AND length(btrim(label)) > 0));
ALTER TABLE "PersonContact" ADD CONSTRAINT "PersonContact_version_check" CHECK (version > 0);
ALTER TABLE "OrganizationContact" ADD CONSTRAINT "OrganizationContact_version_check" CHECK (version > 0);
ALTER TABLE "DirectoryChange" DROP CONSTRAINT "DirectoryChange_target_check", DROP CONSTRAINT "DirectoryChange_field_check";
ALTER TABLE "DirectoryChange" ADD CONSTRAINT "DirectoryChange_target_check" CHECK (
  num_nonnulls("organizationId","categoryId","personId","personRelationId","contactMethodId","personContactId","organizationContactId") = 1),
  ADD CONSTRAINT "DirectoryChange_field_check" CHECK (
    (("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
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
  );
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_action_fields_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_action_fields_check" CHECK (
  (("contactMethodId" IS NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL) AND (
  ("personId" IS NULL AND "personRelationId" IS NULL AND (

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

  ))
  OR ("targetUserId" IS NULL AND "organizationId" IS NULL AND "categoryId" IS NULL
    AND "actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "passwordResetTokenId" IS NULL AND "emailAccountId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL
    AND (
      (action IN ('PERSON_UPDATED','PERSON_STATUS_CHANGED') AND "personId" IS NOT NULL AND "personRelationId" IS NULL)
      OR (action IN ('PERSON_RELATION_UPDATED','PERSON_RELATION_ENDED') AND "personRelationId" IS NOT NULL AND "personId" IS NULL)
    ))
))
  OR ("actorUserId" IS NOT NULL AND "operationId" IS NOT NULL
    AND "targetUserId" IS NULL AND "passwordResetTokenId" IS NULL AND "previousRole" IS NULL AND "newRole" IS NULL AND "emailAccountId" IS NULL
    AND "organizationId" IS NULL AND "categoryId" IS NULL AND "personId" IS NULL AND "personRelationId" IS NULL
    AND (
      (action IN ('CONTACT_METHOD_UPDATED','CONTACT_METHOD_CONDITION_CHANGED') AND "contactMethodId" IS NOT NULL AND "personContactId" IS NULL AND "organizationContactId" IS NULL)
      OR (action IN ('CONTACT_ASSOCIATION_CREATED','CONTACT_ASSOCIATION_UPDATED','CONTACT_ASSOCIATION_ENDED','CONTACT_ASSOCIATION_STATUS_CHANGED')
        AND "contactMethodId" IS NULL AND num_nonnulls("personContactId","organizationContactId")=1)
    ))
);
COMMIT;
