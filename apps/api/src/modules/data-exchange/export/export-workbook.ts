import ExcelJS from 'exceljs';

export type ExportType = 'organizations' | 'contacts' | 'processes' | 'opportunities';
export type CellValue = string | number | boolean | null;

export interface ExportRows {
  organizations?: { id: string; name: string; alias: string | null; country: string | null; isActive: boolean;
    parent: { id: string; name: string } | null; categories: { category: { id: string; name: string } }[];
    contacts: { id: string; isActive: boolean; lastVerifiedAt: Date | null; dataImportBatchId: string | null;
      contactMethod: { id: string; type: string; value: string; label: string | null; condition: string } }[];
    createdAt: Date; updatedAt: Date; lastVerifiedAt: Date | null; verificationStatus: string;
    dataImportBatchId: string | null; dataImportBatch: { originalFilename: string } | null }[];
  contacts?: { id: string; displayName: string; givenNames: string | null; familyNames: string | null; isActive: boolean;
    createdAt: Date; updatedAt: Date; lastVerifiedAt: Date | null; dataImportBatchId: string | null; dataImportBatch: { originalFilename: string } | null;
    verificationStatus: string; contacts: { id: string; isActive: boolean; lastVerifiedAt: Date | null; dataImportBatchId: string | null;
      contactMethod: { id: string; type: string; value: string; label: string | null; condition: string } }[];
    relations: { id: string; organizationId: string; positionTitle: string | null; area: string | null; isCurrent: boolean;
      startDate: Date | null; endDate: Date | null; lastVerifiedAt: Date | null; dataImportBatchId: string | null;
      organization: { id: string; name: string } }[] }[];
  processes?: { id: string; purpose: string; state: string; createdAt: Date; lastActivityAt: Date; currentResult: string | null;
    closedAt: Date | null; organization: { id: string; name: string } | null; person: { id: string; displayName: string } | null;
    createdBy: { id: string; givenNames: string; familyNames: string }; participants: { joinedAt: Date; origin: string;
      user: { id: string; givenNames: string; familyNames: string } }[] }[];
  opportunities?: { id: string; name: string; description: string | null; url: string | null; deadline: Date | null;
    requirements: string | null; status: string; discardReason: string | null; finalResult: string | null; createdAt: Date; updatedAt: Date;
    createdBy: { id: string; givenNames: string; familyNames: string }; organizations: { organization: { id: string; name: string } }[];
    process: { id: string; purpose: string } | null; communication: { id: string } | null }[];
}

const timestamp = (value: Date | null | undefined) => value ? value.toISOString() : null;
const civilDate = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null;
const personName = (user: { givenNames: string; familyNames: string }) => `${user.givenNames} ${user.familyNames}`.trim();

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: CellValue[][]) {
  if (!rows.length) return;
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach(values => {
    const row = sheet.addRow(values);
    row.eachCell({ includeEmpty: true }, cell => {
      if (typeof cell.value === 'string') cell.numFmt = '@';
    });
  });
  const lastColumn = sheet.getColumn(headers.length).letter;
  sheet.autoFilter = { from: 'A1', to: `${lastColumn}${rows.length + 1}` };
  headers.forEach((header, index) => {
    const values = rows.slice(0, 100).map(row => String(row[index] ?? '').length);
    sheet.getColumn(index + 1).width = Math.min(48, Math.max(14, header.length + 2, ...values.map(length => Math.min(length + 2, 48))));
  });
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 24;
}

export function buildExportWorkbook(type: ExportType, data: ExportRows): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CECASEM Conecta';
  workbook.created = new Date();
  workbook.modified = workbook.created;

  if (type === 'organizations') {
    const rows = data.organizations ?? [];
    addSheet(workbook, 'Organizaciones', ['Identificador', 'Nombre', 'Alias', 'País', 'Estado', 'Organización matriz', 'Creada', 'Última modificación', 'Última verificación', 'Condición de verificación', 'Lote de importación', 'Archivo de origen'],
      rows.map(row => [row.id, row.name, row.alias, row.country, row.isActive ? 'Activa' : 'Inactiva', row.parent?.name ?? null,
        timestamp(row.createdAt), timestamp(row.updatedAt), timestamp(row.lastVerifiedAt), row.verificationStatus, row.dataImportBatchId, row.dataImportBatch?.originalFilename ?? null]));
    const categories = rows.flatMap(row => row.categories.map(link => [row.id, row.name, link.category.id, link.category.name]));
    addSheet(workbook, 'Categorías', ['Identificador de organización', 'Organización', 'Identificador de categoría', 'Categoría'], categories);
    const contacts = rows.flatMap(row => row.contacts.map(contact => [contact.id, row.id, row.name, contact.contactMethod.id,
      contact.contactMethod.type, contact.contactMethod.value, contact.contactMethod.label, contact.contactMethod.condition,
      contact.isActive ? 'Vigente' : 'Inactivo', timestamp(contact.lastVerifiedAt), contact.dataImportBatchId]));
    addSheet(workbook, 'Medios de contacto', ['Identificador de asociación', 'Identificador de organización', 'Organización', 'Identificador de medio', 'Tipo', 'Valor', 'Etiqueta', 'Condición del medio', 'Estado de asociación', 'Última verificación', 'Lote de importación'], contacts);
  } else if (type === 'contacts') {
    const people = data.contacts ?? [];
    addSheet(workbook, 'Personas', ['Identificador', 'Nombre', 'Nombres', 'Apellidos', 'Estado', 'Creada', 'Última modificación', 'Última verificación', 'Condición de verificación', 'Lote de importación', 'Archivo de origen'],
      people.map(row => [row.id, row.displayName, row.givenNames, row.familyNames, row.isActive ? 'Activa' : 'Inactiva', timestamp(row.createdAt), timestamp(row.updatedAt),
        timestamp(row.lastVerifiedAt), row.verificationStatus, row.dataImportBatchId, row.dataImportBatch?.originalFilename ?? null]));
    const methods = people.flatMap(person => person.contacts.map(contact => [contact.id, person.id, person.displayName, contact.contactMethod.id,
      contact.contactMethod.type, contact.contactMethod.value, contact.contactMethod.label, contact.contactMethod.condition,
      contact.isActive ? 'Vigente' : 'Inactivo', timestamp(contact.lastVerifiedAt), contact.dataImportBatchId]));
    addSheet(workbook, 'Medios de contacto', ['Identificador de asociación', 'Identificador de persona', 'Persona', 'Identificador de medio', 'Tipo', 'Valor', 'Etiqueta', 'Condición del medio', 'Estado de asociación', 'Última verificación', 'Lote de importación'], methods);
    const relations = people.flatMap(person => person.relations.map(relation => [relation.id, person.id, person.displayName, relation.organizationId,
      relation.organization.name, relation.positionTitle, relation.area, relation.isCurrent ? 'Vigente' : 'Histórico', civilDate(relation.startDate), civilDate(relation.endDate),
      timestamp(relation.lastVerifiedAt), relation.dataImportBatchId]));
    addSheet(workbook, 'Vínculos institucionales', ['Identificador de vínculo', 'Identificador de persona', 'Persona', 'Identificador de organización', 'Organización', 'Cargo', 'Área', 'Estado', 'Fecha de inicio', 'Fecha de fin', 'Última verificación', 'Lote de importación'], relations);
  } else if (type === 'processes') {
    const processes = data.processes ?? [];
    addSheet(workbook, 'Procesos', ['Identificador', 'Objetivo', 'Tipo de actor', 'Identificador de actor', 'Actor principal', 'Estado', 'Identificador de creador', 'Creador', 'Creado', 'Última actividad', 'Resultado de cierre', 'Fecha de cierre'],
      processes.map(row => [row.id, row.purpose, row.organization ? 'Organización' : 'Persona', row.organization?.id ?? row.person?.id ?? null,
        row.organization?.name ?? row.person?.displayName ?? null, row.state, row.createdBy.id, personName(row.createdBy), timestamp(row.createdAt),
        timestamp(row.lastActivityAt), row.currentResult, timestamp(row.closedAt)]));
    const participants = processes.flatMap(process => process.participants.map(participant => [process.id, participant.user.id, personName(participant.user),
      participant.origin, timestamp(participant.joinedAt)]));
    addSheet(workbook, 'Participantes', ['Identificador de proceso', 'Identificador de usuario', 'Participante', 'Origen de participación', 'Fecha de incorporación'], participants);
  } else {
    const opportunities = data.opportunities ?? [];
    addSheet(workbook, 'Oportunidades', ['Identificador', 'Nombre', 'Descripción', 'Enlace de postulación', 'Requisitos', 'Fecha límite', 'Estado', 'Identificador de proceso de origen', 'Objetivo del proceso', 'Identificador de comunicación de origen', 'Identificador de creador', 'Creador', 'Creada', 'Última modificación', 'Resultado final', 'Motivo de descarte'],
      opportunities.map(row => [row.id, row.name, row.description, row.url, row.requirements, civilDate(row.deadline), row.status, row.process?.id ?? null, row.process?.purpose ?? null,
        row.communication?.id ?? null, row.createdBy.id, personName(row.createdBy), timestamp(row.createdAt), timestamp(row.updatedAt), row.finalResult, row.discardReason]));
    const organizations = opportunities.flatMap(opportunity => opportunity.organizations.map(link => [opportunity.id, link.organization.id, link.organization.name]));
    addSheet(workbook, 'Organizaciones', ['Identificador de oportunidad', 'Identificador de organización', 'Organización'], organizations);
  }
  return workbook;
}

export function exportFileName(type: ExportType, now = new Date()): string {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return `cecasem-${type}-${date}.xlsx`;
}
