import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { CommunicationsService } from '../communications/communications.service';
import { PERMISSIONS } from '../auth/authorization/permission';
import type { CommunicationTranslationDto } from './communication-translation.dto';
import { TranslationError, TranslationProvider } from './translation-provider';
const select = { id: true, communicationId: true, targetLanguage: true, detectedSourceLanguage: true, translatedText: true, createdAt: true } as const;
@Injectable()
export class CommunicationTranslationsService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService,
    private readonly communications: CommunicationsService, private readonly provider: TranslationProvider) {}
  async get(id: string, actorId: string): Promise<CommunicationTranslationDto | null> {
    return this.users.withLockedCredentials(actorId, async (actor, tx) => {
      const source = await this.communications.translationSource(id, actor, PERMISSIONS.TRANSLATION_READ, tx);
      const row = await tx.communicationTranslation.findUnique({ where: { communicationId_targetLanguage_sourceFingerprint: { communicationId: id, targetLanguage: 'es', sourceFingerprint: source.requestFingerprint } }, select });
      return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
    });
  }
  async request(id: string, actorId: string): Promise<CommunicationTranslationDto> {
    const source = await this.users.withLockedCredentials(actorId, (actor, tx) => this.communications.translationSource(id, actor, PERMISSIONS.TRANSLATION_REQUEST, tx));
    const cached = await this.get(id, actorId); if (cached) return cached;
    if (!source.bodyOriginal.trim()) throw new TranslationError('TRANSLATION_EMPTY_BODY');
    // Ninguna transacción/lock de PostgreSQL se mantiene durante HTTP externo.
    const result = await this.provider.translate({ text: source.bodyOriginal, sourceLanguage: 'auto', targetLanguage: 'es' });
    return this.users.withLockedCredentials(actorId, async (actor, tx) => {
      await this.communications.translationSource(id, actor, PERMISSIONS.TRANSLATION_REQUEST, tx);
      await tx.communicationTranslation.createMany({ data: [{ communicationId: id, targetLanguage: 'es', sourceFingerprint: source.requestFingerprint,
        translatedText: result.translatedText, detectedSourceLanguage: result.detectedSourceLanguage ?? null, provider: this.provider.name, requestedByUserId: actorId }], skipDuplicates: true });
      const row = await tx.communicationTranslation.findUniqueOrThrow({ where: { communicationId_targetLanguage_sourceFingerprint: { communicationId: id, targetLanguage: 'es', sourceFingerprint: source.requestFingerprint } }, select });
      return { ...row, createdAt: row.createdAt.toISOString() };
    });
  }
}
