-- La proyección y su hecho histórico deben confirmarse juntos, sin impedir limpieza
-- transaccional de fixtures cuando ambos registros dejan de existir.
CREATE FUNCTION check_communication_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE communication_id uuid; current_validity "CommunicationValidity"; has_invalidation boolean;
BEGIN
 IF TG_TABLE_NAME = 'Communication' THEN
   communication_id := COALESCE(NEW.id, OLD.id);
 ELSE
   communication_id := COALESCE(NEW."communicationId", OLD."communicationId");
 END IF;
 SELECT validity INTO current_validity FROM "Communication" WHERE id = communication_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT EXISTS (SELECT 1 FROM "CommunicationAmendment" WHERE "communicationId" = communication_id AND type = 'INVALIDATION') INTO has_invalidation;
 IF (current_validity = 'INVALIDATED') <> has_invalidation THEN
   RAISE EXCEPTION 'La invalidación requiere un registro histórico coherente' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Communication_invalidation_consistency"
 AFTER INSERT OR UPDATE ON "Communication" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_communication_invalidation();
CREATE CONSTRAINT TRIGGER "CommunicationAmendment_invalidation_consistency"
 AFTER INSERT OR UPDATE OR DELETE ON "CommunicationAmendment" DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_communication_invalidation();
