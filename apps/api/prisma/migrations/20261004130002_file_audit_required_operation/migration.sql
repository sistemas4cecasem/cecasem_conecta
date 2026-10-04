-- CHECK no debe aceptar NULL como resultado de la igualdad operationId/fileUploadId.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_file_operation_check"
 CHECK (action <> 'FILES_ATTACHED' OR "operationId" IS NOT NULL);
