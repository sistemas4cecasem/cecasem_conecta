import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { assertVersion } from './directory.rules';
import { calendarDate,personFields,relationFields } from './people.rules';
import { PersonInputDto,RelationCreateDto,PeopleQueryDto } from './people.dto';
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
  it('paginación de personas mantiene límites del directorio',()=>{expect(validateSync(plainToInstance(PeopleQueryDto,{pageSize:101}))).not.toEqual([]);});
});
