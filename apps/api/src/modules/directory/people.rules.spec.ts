import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { assertVersion } from './directory.rules';
import { calendarDate,classifyPersonInstitutionalStatus,personFields,relationFields } from './people.rules';
import { OrganizationPersonCreateDto,PersonInputDto,RelationCreateDto,PeopleQueryDto } from './people.dto';
describe('Reglas mínimas de personas y episodios',()=>{
  it('persona independiente requiere solo presentación y no inventa apellidos',()=>{
    expect(personFields({displayName:'  Nombre   conocido '})).toEqual({displayName:'Nombre conocido',givenNames:null,familyNames:null});
  });
  it('corrección de nombres no incluye verificación ni organización',()=>{
    expect(Object.keys(personFields({displayName:'Ana',givenNames:'Ana',familyNames:'Pérez'}))).toEqual(['displayName','givenNames','familyNames']);
  });
  it.each([undefined,null,''])('fecha ausente %s permanece desconocida',value=>{expect(calendarDate(value)).toBeNull();});
  it.each(['2024','2024-02','2023-02-29','2024-02-30','2024-13-01','0000-01-01','2024-01-01T00:00:00Z'])('rechaza fecha incompleta o imposible %s',value=>{expect(()=>calendarDate(value)).toThrow();});
  it('acepta fecha completa bisiesta sin zona horaria local',()=>{expect(calendarDate('2024-02-29')?.toISOString()).toBe('2024-02-29T00:00:00.000Z');});
  it('finalizado sin fechas conserva ausencia; no usa fecha actual',()=>{expect(relationFields({isCurrent:false})).toMatchObject({isCurrent:false,startDate:null,endDate:null});});
  it('vigente no permite fecha final y el fin no precede al inicio',()=>{
    expect(()=>relationFields({isCurrent:true,endDate:'2024-01-01'})).toThrow();
    expect(()=>relationFields({isCurrent:false,startDate:'2024-02-01',endDate:'2024-01-01'})).toThrow();
  });
  it('fuente sencilla opcional, URL segura y cargo desconocido válidos',()=>{
    expect(relationFields({isCurrent:true,sourceDescription:'  Sitio   oficial ',sourceUrl:'https://example.test'})).toMatchObject({positionTitle:null,sourceDescription:'Sitio oficial',sourceUrl:'https://example.test'});
    expect(()=>relationFields({isCurrent:true,sourceUrl:'javascript:alert(1)'})).toThrow();
  });
  it('conflicto de versión no permite sustituir una edición nueva',()=>{expect(()=>assertVersion(2,1)).toThrow();expect(()=>assertVersion(2,2)).not.toThrow();});
  it('DTO no exige organización en persona y sí en episodio',()=>{
    expect(validateSync(plainToInstance(PersonInputDto,{displayName:'Ana'}))).toEqual([]);
    expect(validateSync(plainToInstance(RelationCreateDto,{positionTitle:'Directora'})).some(error=>error.property==='organizationId')).toBe(true);
  });
  it('el alta contextual valida exactamente una persona nueva o existente',()=>{
    const options={whitelist:true,forbidNonWhitelisted:true};
    expect(validateSync(plainToInstance(OrganizationPersonCreateDto,{personMode:'new',person:{displayName:'Ana'},isCurrent:true}),options)).toEqual([]);
    expect(validateSync(plainToInstance(OrganizationPersonCreateDto,{personMode:'existing',personId:'11111111-1111-4111-8111-111111111111',isCurrent:true}),options)).toEqual([]);
    expect(validateSync(plainToInstance(OrganizationPersonCreateDto,{personMode:'new',person:{displayName:'Ana'},personId:'11111111-1111-4111-8111-111111111111'}),options).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(OrganizationPersonCreateDto,{personMode:'existing',isCurrent:true}),options).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(OrganizationPersonCreateDto,{personMode:'new',person:{displayName:'Ana'},organizationId:'11111111-1111-4111-8111-111111111111'}),options).some(error=>error.property==='organizationId')).toBe(true);
  });
  it.each([
    [0,false,'NO_KNOWN_LINKS'],[0,true,'HISTORICAL_ONLY'],[1,false,'CURRENT'],[2,true,'CURRENT'],
  ] as const)('clasifica episodios vigentes e históricos (%s, %s)',(current,history,expected)=>{
    expect(classifyPersonInstitutionalStatus(current,history)).toBe(expected);
  });
  it.each(['all','without-current','none','historical-only','current'])('acepta filtro institucional %s',institutionalStatus=>{
    expect(validateSync(plainToInstance(PeopleQueryDto,{institutionalStatus})).filter(error=>error.property==='institutionalStatus')).toEqual([]);
  });
  it('rechaza filtro institucional desconocido y conserva all como valor predeterminado',()=>{
    expect(plainToInstance(PeopleQueryDto,{}).institutionalStatus).toBe('all');
    expect(validateSync(plainToInstance(PeopleQueryDto,{institutionalStatus:'independent'})).some(error=>error.property==='institutionalStatus')).toBe(true);
  });
  it('paginación de personas mantiene límites del directorio',()=>{expect(validateSync(plainToInstance(PeopleQueryDto,{pageSize:101}))).not.toEqual([]);});
});
