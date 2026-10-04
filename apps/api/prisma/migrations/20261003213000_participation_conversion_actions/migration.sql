-- Orígenes admitidos por la interfaz pública de productores formales.
ALTER TYPE "ParticipantOrigin" ADD VALUE 'SENT_COMMUNICATION';
ALTER TYPE "ParticipantOrigin" ADD VALUE 'RECEIVED_COMMUNICATION';
ALTER TYPE "AuditAction" ADD VALUE 'CONTACT_INTENT_CONVERTED';
