import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DirectoryExportService } from '../../directory/directory-export.service';
import { RelationshipProcessesService } from '../../relationships/relationship-processes.service';
import { OpportunitiesService } from '../../opportunities/opportunities.service';
import { ExportFiltersDto } from './export.dto';
import { buildExportWorkbook, exportFileName, type ExportRows, type ExportType } from './export-workbook';

const BATCH_SIZE = 500;

@Injectable()
export class DataExportService {
  constructor(private readonly directory: DirectoryExportService, private readonly processes: RelationshipProcessesService,
    private readonly opportunities: OpportunitiesService) {}

  private async page(type: ExportType, filters: ExportFiltersDto, page: number, pageSize: number, actorId: string) {
    if (type === 'organizations') return this.directory.organizations({ name: filters.name, country: filters.country,
      categoryId: filters.categoryId, status: filters.organizationStatus, verificationStatus: filters.verificationStatus,
      withCommunications: filters.withCommunications }, page, pageSize, actorId);
    if (type === 'contacts') return this.directory.contacts({ name: filters.name, status: filters.personStatus,
      contactType: filters.contactType, relationStatus: filters.relationStatus }, page, pageSize, actorId);
    if (type === 'processes') return this.processes.exportPage({ state: filters.processState,
      createdByUserId: filters.createdByUserId, organizationId: filters.processOrganizationId, personId: filters.processPersonId }, page, pageSize, actorId);
    return this.opportunities.exportPage({ status: filters.opportunityStatus,
      organizationId: filters.opportunityOrganizationId, processId: filters.opportunityProcessId }, page, pageSize, actorId);
  }

  async preview(type: ExportType, filters: ExportFiltersDto | undefined, actorId: string) {
    const result = await this.page(type, filters ?? {}, 1, 1, actorId);
    return { type, count: result.total, unit: type === 'contacts' ? 'personas' : 'registros' };
  }

  private async allPages<T>(count: number, loadPage: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; items.length < count; page++) {
      const result = await loadPage(page, BATCH_SIZE);
      items.push(...result.items);
      if (result.items.length < BATCH_SIZE) break;
    }
    return items;
  }

  async create(type: ExportType, filters: ExportFiltersDto | undefined, actorId: string) {
    const selectedFilters = filters ?? {};
    const summary = await this.preview(type, selectedFilters, actorId);
    if (!summary.count) throw new UnprocessableEntityException('Los filtros no encontraron información para exportar.');
    const data: ExportRows = {};
    if (type === 'organizations') data.organizations = await this.allPages(summary.count, (page, pageSize) => this.directory.organizations({ name: selectedFilters.name,
      country: selectedFilters.country, categoryId: selectedFilters.categoryId, status: selectedFilters.organizationStatus,
      verificationStatus: selectedFilters.verificationStatus, withCommunications: selectedFilters.withCommunications }, page, pageSize, actorId));
    else if (type === 'contacts') data.contacts = await this.allPages(summary.count, (page, pageSize) => this.directory.contacts({ name: selectedFilters.name,
      status: selectedFilters.personStatus, contactType: selectedFilters.contactType, relationStatus: selectedFilters.relationStatus }, page, pageSize, actorId));
    else if (type === 'processes') data.processes = await this.allPages(summary.count, (page, pageSize) => this.processes.exportPage({ state: selectedFilters.processState,
      createdByUserId: selectedFilters.createdByUserId, organizationId: selectedFilters.processOrganizationId, personId: selectedFilters.processPersonId }, page, pageSize, actorId));
    else data.opportunities = await this.allPages(summary.count, (page, pageSize) => this.opportunities.exportPage({ status: selectedFilters.opportunityStatus,
      organizationId: selectedFilters.opportunityOrganizationId, processId: selectedFilters.opportunityProcessId }, page, pageSize, actorId));
    const workbook = buildExportWorkbook(type, data);
    if (!workbook.worksheets.length) throw new UnprocessableEntityException('Los filtros no encontraron información para exportar.');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: exportFileName(type), count: summary.count };
  }
}
