import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type CommunicationDirection, type CommunicationValidity } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { normalizeEmail } from '../users/identity-normalization';
import { hasPermission } from '../auth/authorization/role-permissions';
import { PERMISSIONS } from '../auth/authorization/permission';
import { RelationshipSearchService, type SearchProcess } from '../relationships/relationship-search.service';

export interface EmailCommunication {
  type: 'COMMUNICATION'; id: string; matchedAddress: string; direction: CommunicationDirection; validity: CommunicationValidity;
  occurredAt: string; registeredBy: { id: string; displayName: string; isActive: boolean }; process: SearchProcess;
}
export interface ImportedEmailHistory {
  type: 'IMPORTED_HISTORICAL_RECORD'; id: string; kind: 'SENT' | 'RECEIVED' | 'OTHER' | 'UNKNOWN'; occurredOn: string | null;
  subject: string | null; body: string | null; originalObservation: string | null; lastVerifiedAt: string | null;
  batch: { id: string; originalFilename: string; createdAt: string };
  organization: { id: string; name: string } | null; person: { id: string; displayName: string } | null;
}
export interface EmailHistory {
  address: string; items: EmailCommunication[]; total: number; page: number; pageSize: number;
  lastValidContact: EmailCommunication | null;
  importedRecords: { items: ImportedEmailHistory[]; total: number; page: number; pageSize: number };
}

/** Snapshots históricos exactos; nunca infiere comunicaciones a partir del Directorio. */
@Injectable()
export class CommunicationSearchService {
  constructor(private readonly prisma: PrismaService, private readonly users: UsersService, private readonly relationships: RelationshipSearchService) {}

  async history(query: { address: string; page: number; pageSize: number }, actorId: string): Promise<EmailHistory> {
    const address = normalizeEmail(query.address);
    return this.prisma.$transaction(async tx => {
      const actor = await this.users.findIdentityById(actorId, tx);
      if (!actor?.isActive || ![PERMISSIONS.COMMUNICATION_READ, PERMISSIONS.PROCESS_READ, PERMISSIONS.DIRECTORY_READ].every(permission => hasPermission(actor.role, permission))) throw new ForbiddenException();
      const where: Prisma.CommunicationWhereInput = { OR: [{ senderNormalizedAddress: address }, { recipients: { some: { normalizedAddress: address } } }] };
      const select = { id: true, processId: true, direction: true, validity: true, occurredAt: true, senderSnapshot: true, senderNormalizedAddress: true,
        registeredBy: { select: { id: true, givenNames: true, familyNames: true, isActive: true } },
        recipients: { where: { normalizedAddress: address }, select: { addressOriginal: true }, orderBy: [{ type: 'asc' as const }, { position: 'asc' as const }], take: 1 } } satisfies Prisma.CommunicationSelect;
      const orderBy = [{ occurredAt: 'desc' as const }, { id: 'desc' as const }];
      const rows = await tx.communication.findMany({ where, select, orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
      const total = await tx.communication.count({ where });
      const importedWhere = { email: address };
      const [importedRows, importedTotal] = await Promise.all([
        tx.importedHistoricalRecord.findMany({ where: importedWhere, orderBy: [{ occurredOn: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize, take: query.pageSize,
          select: { id: true, kind: true, occurredOn: true, subject: true, body: true, originalObservation: true, lastVerifiedAt: true,
            batch: { select: { id: true, originalFilename: true, createdAt: true } },
            organization: { select: { id: true, name: true } }, person: { select: { id: true, displayName: true } } } }),
        tx.importedHistoricalRecord.count({ where: importedWhere }),
      ]);
      const latest = await tx.communication.findFirst({ where: { ...where, validity: 'VALID' }, select, orderBy });
      const processes = await this.relationships.contexts([...rows.map(row => row.processId), ...(latest ? [latest.processId] : [])], tx);
      const project = (row: (typeof rows)[number]): EmailCommunication => ({ type: 'COMMUNICATION', id: row.id,
        matchedAddress: row.senderNormalizedAddress === address ? row.senderSnapshot : row.recipients[0].addressOriginal,
        direction: row.direction, validity: row.validity, occurredAt: row.occurredAt.toISOString(),
        registeredBy: { id: row.registeredBy.id, displayName: [row.registeredBy.givenNames, row.registeredBy.familyNames].join(' '), isActive: row.registeredBy.isActive },
        process: processes.get(row.processId)! });
      return { address, items: rows.map(project), total, page: query.page, pageSize: query.pageSize, lastValidContact: latest ? project(latest) : null,
        importedRecords: { items: importedRows.map(row => ({ type: 'IMPORTED_HISTORICAL_RECORD' as const, ...row,
          occurredOn: row.occurredOn?.toISOString().slice(0, 10) ?? null, lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
          batch: { ...row.batch, createdAt: row.batch.createdAt.toISOString() } })), total: importedTotal, page: query.page, pageSize: query.pageSize } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
