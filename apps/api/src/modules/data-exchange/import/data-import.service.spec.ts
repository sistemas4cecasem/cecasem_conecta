import ExcelJS from 'exceljs';
import { DataImportRecordKind } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { UsersService } from '../../users/users.service';
import { DirectoryImportService } from '../../directory/directory-import.service';
import { DataImportService } from './data-import.service';

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Referencias');
  sheet.addRow(['Nombre', 'País']); sheet.addRow(['Fundación de prueba', null]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('DataImportService preview', () => {
  it('persiste únicamente el lote y filas del análisis, sin crear fichas de negocio', async () => {
    const tx = {
      dataImportBatch: { create: jest.fn().mockResolvedValue({ id: 'batch', status: 'ANALYZED', analyzedRows: 1, readyRows: 1, reviewRows: 0, invalidRows: 0 }) },
      organization: { create: jest.fn() }, person: { create: jest.fn() }, contactMethod: { create: jest.fn() },
      importedHistoricalRecord: { create: jest.fn() }, relationshipProcess: { create: jest.fn() }, communication: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => Promise.resolve(callback(tx))) };
    const directory = { assertAdministrator: jest.fn(), matches: jest.fn().mockResolvedValue(new Map()) };
    const users = {};
    const service = new DataImportService(prisma as unknown as PrismaService, users as unknown as UsersService, directory as unknown as DirectoryImportService);
    const result = await service.preview({ originalname: 'historial.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbookBuffer() },
      { worksheetName: 'Referencias', headerRow: 1, recordKind: DataImportRecordKind.ORGANIZATION, columnMapping: '{"name":1,"country":2}' }, 'admin');
    expect(result).toMatchObject({ id: 'batch', status: 'ANALYZED', analyzedRows: 1, readyRows: 1 });
    expect(directory.assertAdministrator).toHaveBeenCalled(); expect(directory.matches).toHaveBeenCalledTimes(1);
    expect(tx.dataImportBatch.create).toHaveBeenCalledTimes(1);
    for (const model of [tx.organization, tx.person, tx.contactMethod, tx.importedHistoricalRecord, tx.relationshipProcess, tx.communication]) expect(model.create).not.toHaveBeenCalled();
  });
});
