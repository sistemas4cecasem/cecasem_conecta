import { ContactType } from '../../generated/prisma/client';
import { contactContext, contactFields } from './contacts.rules';
describe('Medios canónicos y contexto de asociación',()=>{
  it.each([' Contacto@Fundacion.org ','CONTACTO@FUNDACION.ORG','contacto@fundacion.org'])('correo %s reutiliza trim + lowercase',value=>{
    expect(contactFields({type:ContactType.EMAIL,value})).toMatchObject({value:'contacto@fundacion.org',normalizedValue:'contacto@fundacion.org'});
  });
  it('preserva puntos y +; no inventa equivalencias por proveedor',()=>{
    const a=contactFields({type:ContactType.EMAIL,value:'Nombre.Apellido+Proyecto@GMAIL.com'});
    const b=contactFields({type:ContactType.EMAIL,value:'nombreapellido@gmail.com'});
    expect(a.value).toBe('nombre.apellido+proyecto@gmail.com');expect(a.normalizedValue).not.toBe(b.normalizedValue);
  });
  it.each(['','sin-arroba','x @example.org','x@example','x'.repeat(255)+'@example.org'])('rechaza correo inválido %s',value=>{expect(()=>contactFields({type:ContactType.EMAIL,value})).toThrow();});
  it.each([ContactType.PHONE,ContactType.LINKEDIN,ContactType.FORM,ContactType.WEB,ContactType.OTHER])('tipo %s no recibe unicidad/normalización de EMAIL',type=>{
    const value=type===ContactType.PHONE?'+591 (2) 123-4567':type===ContactType.OTHER?'Canal de mensajería institucional':'https://www.linkedin.com/in/persona';
    expect(contactFields({type,value,label:'Descripción del canal'})).toMatchObject({value,normalizedValue:null});
  });
  it.each(['abc','123','+591 1234 ext 8','++12345678'])('rechaza teléfono evidentemente inválido %s',value=>{expect(()=>contactFields({type:ContactType.PHONE,value})).toThrow();});
  it.each(['javascript:alert(1)','https://linkedin.com.evil.test/in/a','https://example.org','https://user:secret@linkedin.com/in/a'])('rechaza LinkedIn inválido %s',value=>{expect(()=>contactFields({type:ContactType.LINKEDIN,value})).toThrow();});
  it('OTHER requiere descripción comprensible y no impone catálogo nuevo',()=>{expect(()=>contactFields({type:ContactType.OTHER,value:'Canal'})).toThrow();expect(contactFields({type:ContactType.OTHER,value:'Canal',label:'Telegram público'}).label).toBe('Telegram público');});
  it('el contexto no incluye valor del medio, estado ni verificación',()=>{
    expect(contactContext({sourceDescription:'  Sitio   oficial ',notes:'Dato informado'})).toEqual({sourceDescription:'Sitio oficial',sourceUrl:null,notes:'Dato informado'});
  });
  it('fuente admite ausencia y rechaza credenciales en URL',()=>{expect(contactContext({})).toEqual({sourceDescription:null,sourceUrl:null,notes:null});expect(()=>contactContext({sourceUrl:'https://user:secret@example.org'})).toThrow();});
});
