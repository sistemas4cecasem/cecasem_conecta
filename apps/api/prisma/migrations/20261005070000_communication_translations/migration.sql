CREATE TABLE "CommunicationTranslation" (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  "communicationId" UUID NOT NULL,
  "targetLanguage" VARCHAR(10) NOT NULL,
  "sourceFingerprint" VARCHAR(64) NOT NULL,
  "translatedText" TEXT NOT NULL,
  "detectedSourceLanguage" VARCHAR(20),
  provider VARCHAR(40) NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationTranslation_pkey" PRIMARY KEY (id),
  CONSTRAINT "CommunicationTranslation_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "Communication"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CommunicationTranslation_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CommunicationTranslation_content_check" CHECK ("targetLanguage"='es' AND "sourceFingerprint" ~ '^[0-9a-f]{64}$' AND length(btrim("translatedText"))>0 AND octet_length("translatedText")<=8388608 AND length(provider)>0)
);
CREATE UNIQUE INDEX "CommunicationTranslation_communicationId_targetLanguage_sou_key" ON "CommunicationTranslation"("communicationId","targetLanguage","sourceFingerprint");
CREATE INDEX "CommunicationTranslation_requestedByUserId_idx" ON "CommunicationTranslation"("requestedByUserId");
CREATE FUNCTION communication_translation_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fingerprint TEXT;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'translation is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT "requestFingerprint" INTO fingerprint FROM "Communication" WHERE id=NEW."communicationId";
  IF fingerprint IS DISTINCT FROM NEW."sourceFingerprint" THEN RAISE EXCEPTION 'translation source mismatch' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CommunicationTranslation_integrity" BEFORE INSERT OR UPDATE ON "CommunicationTranslation" FOR EACH ROW EXECUTE FUNCTION communication_translation_integrity();
