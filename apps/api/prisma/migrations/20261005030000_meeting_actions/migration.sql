-- PostgreSQL requiere confirmar nuevos valores antes de usarlos en constraints.
ALTER TYPE "AuditAction" ADD VALUE 'MEETING_RECORDED';
ALTER TYPE "ParticipantOrigin" ADD VALUE 'MEETING_CREATED';
