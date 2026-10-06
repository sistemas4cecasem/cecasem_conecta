-- PostgreSQL requiere confirmar el nuevo valor del enum antes de usarlo en constraints o filas.
ALTER TYPE "AuditAction" ADD VALUE 'DATA_IMPORT_BATCH_APPLIED';
ALTER TYPE "AuditAction" ADD VALUE 'DATA_IMPORT_BATCH_FAILED';
