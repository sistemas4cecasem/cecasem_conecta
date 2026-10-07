CREATE FUNCTION preserve_communication_original() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."bodyOriginal" IS DISTINCT FROM OLD."bodyOriginal" THEN
    RAISE EXCEPTION 'El cuerpo original de la comunicación es inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Communication_body_original_immutable"
BEFORE UPDATE ON "Communication"
FOR EACH ROW EXECUTE FUNCTION preserve_communication_original();
