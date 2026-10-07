import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireFromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const ExcelJS = requireFromApi('exceljs');

export const demoSheets = [
  {
    name: 'Organizaciones',
    headers: ['Organización', 'País', 'Nombre alternativo', 'Descripción', 'Sitio web oficial', 'Categoría propuesta'],
    rows: [
      ['Fundación Horizonte Comunitaria Demo', 'Bolivia', 'Horizonte Comunitaria', 'Organización enteramente ficticia para revisar cooperación comunitaria.', 'https://horizonte-comunitaria.example.test', 'Cooperación comunitaria'],
      ['Red Semilla Andina Demo', 'Perú', 'Red Semilla', 'Red ficticia dedicada a iniciativas locales de aprendizaje.', 'https://red-semilla.example.test', 'Educación'],
      ['Centro Puentes Vecinales Demo', 'Paraguay', null, null, null, null],
      [null, 'Ecuador', null, null, null, null],
    ],
    recordKind: 'ORGANIZATION',
    columnMapping: { name: 1, country: 2, alias: 3, description: 4, officialWebsite: 5 },
  },
  {
    name: 'Personas',
    headers: ['Nombre visible', 'Nombres', 'Apellidos'],
    rows: [
      ['Lucía Productora Demo', 'Lucía', 'Productora Demo'],
      ['Mateo Enlace Demo', 'Mateo', 'Enlace Demo'],
      [null, null, null],
    ],
    recordKind: 'PERSON',
    columnMapping: { displayName: 1, givenNames: 2, familyNames: 3 },
  },
  {
    name: 'Contactos',
    headers: ['Tipo', 'Valor', 'Organización', 'Persona', 'Etiqueta', 'Notas'],
    rows: [
      ['EMAIL', 'oficina@semilla.example.test', 'Red Semilla Andina Demo', null, 'Contacto general', 'Dirección ficticia; pendiente de revisión.'],
      ['EMAIL', 'lucia@semilla.example.test', null, 'Lucía Productora Demo', 'Contacto de proyecto', 'Dirección ficticia; pendiente de revisión.'],
      ['EMAIL', 'no-es-un-correo', 'Red Semilla Andina Demo', null, 'Dato a corregir', 'Fila sintética inválida para la demostración del preview.'],
    ],
    recordKind: 'CONTACT',
    columnMapping: { contactType: 1, contactValue: 2, organizationName: 3, personDisplayName: 4, label: 5, notes: 6 },
  },
  {
    name: 'Antecedentes',
    headers: ['Tipo', 'Fecha real del antecedente', 'Correo', 'Asunto', 'Observación original', 'Organización', 'Persona'],
    rows: [
      ['OTHER', '2025-05-12', 'programas@semilla.example.test', 'Antecedente de talleres ficticios', 'Registro histórico enteramente ficticio. No representa una comunicación real.', 'Red Semilla Andina Demo', 'Lucía Productora Demo'],
      ['TIPO INVENTADO', null, null, null, null, 'Red Semilla Andina Demo', null],
    ],
    recordKind: 'HISTORICAL_RECORD',
    columnMapping: { kind: 1, occurredOn: 2, email: 3, subject: 4, originalObservation: 5, organizationName: 6, personDisplayName: 7 },
  },
];

export async function createDemoWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CECASEM Conecta · datos sintéticos de demostración';
  workbook.subject = 'Muestra ficticia para Subfase 6.2';
  workbook.created = new Date('2026-10-06T12:00:00.000Z');

  for (const definition of demoSheets) {
    const sheet = workbook.addWorksheet(definition.name);
    sheet.addRow(definition.headers);
    for (const row of definition.rows) sheet.addRow(row);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.columns = definition.headers.map((header) => ({ header, width: Math.min(42, Math.max(18, header.length + 3)) }));
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function demoWorkbookFilename() {
  return 'muestra-cecasem-demo-6.2.xlsx';
}

export const demoWorkbookPath = fileURLToPath(new URL('../../storage/demo/muestra-cecasem-demo-6.2.xlsx', import.meta.url));
