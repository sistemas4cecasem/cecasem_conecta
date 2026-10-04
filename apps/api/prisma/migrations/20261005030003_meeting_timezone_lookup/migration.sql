CREATE OR REPLACE FUNCTION validate_meeting_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin uuid;
BEGIN
 IF NEW.timezone !~ '^(UTC|[A-Za-z_]+(/[A-Za-z0-9_+.-]+)+)$' THEN
  RAISE EXCEPTION 'Zona horaria inválida' USING ERRCODE='23514';
 END IF;
 -- Resolución directa: evita enumerar todas las zonas por cada fila de una carga.
 PERFORM timezone(NEW.timezone, CURRENT_TIMESTAMP);
 IF NEW."opportunityId" IS NOT NULL THEN
  SELECT "processId" INTO origin FROM "Opportunity" WHERE id=NEW."opportunityId" FOR SHARE;
  IF NEW."processId" IS NOT NULL AND origin IS NOT NULL AND NEW."processId"<>origin THEN
   RAISE EXCEPTION 'Vínculo de reunión incoherente' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW."processId",NEW."opportunityId",NEW."createdByUserId",NEW."createdAt",NEW."requestKey",NEW."requestFingerprint") IS DISTINCT FROM ROW(OLD."processId",OLD."opportunityId",OLD."createdByUserId",OLD."createdAt",OLD."requestKey",OLD."requestFingerprint") THEN
   RAISE EXCEPTION 'Origen histórico inmutable' USING ERRCODE='23514';
  END IF;
  IF ROW(NEW."scheduledAt",NEW.timezone,NEW.modality,NEW."meetingUrl",NEW.location,NEW.purpose) IS DISTINCT FROM ROW(OLD."scheduledAt",OLD.timezone,OLD.modality,OLD."meetingUrl",OLD.location,OLD.purpose)
   AND (OLD.status<>'SCHEDULED' OR OLD."scheduledAt"<=CURRENT_TIMESTAMP OR NEW."scheduledAt"<=CURRENT_TIMESTAMP) THEN
   RAISE EXCEPTION 'Planificación consolidada inmutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'SCHEDULED' AND ROW(NEW.status,NEW."completedAt",NEW."cancelledAt",NEW."cancellationReason") IS DISTINCT FROM ROW(OLD.status,OLD."completedAt",OLD."cancelledAt",OLD."cancellationReason") THEN
   RAISE EXCEPTION 'Estado consolidado inmutable' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
