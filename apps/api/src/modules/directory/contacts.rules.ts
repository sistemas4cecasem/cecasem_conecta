import { ContactType } from '../../generated/prisma/client';
import { normalizeEmail } from '../users/identity-normalization';
import { DirectoryError } from './directory.errors';
import { institutionalText, website } from './directory.rules';
import type { ContactContextDto, ContactInputDto } from './contacts.dto';
export function contactFields(input: ContactInputDto) {
  if (!Object.values(ContactType).includes(input.type) || typeof input.value !== 'string') throw new DirectoryError('INVALID_DIRECTORY');
  let value = input.value.trim();
  if (!value || value.length > 2048) throw new DirectoryError('INVALID_DIRECTORY');
  const label = institutionalText(input.label,150,input.type===ContactType.OTHER);
  let normalizedValue:string|null = null;
  if(input.type===ContactType.EMAIL) {
    try { value=normalizeEmail(value); normalizedValue=value; } catch { throw new DirectoryError('INVALID_DIRECTORY'); }
  } else if(input.type===ContactType.PHONE) {
    if (!/^\+?[\d ().-]+$/.test(value) || value.replace(/\D/g,'').length<6 || value.replace(/\D/g,'').length>20) throw new DirectoryError('INVALID_DIRECTORY');
  } else if([ContactType.LINKEDIN,ContactType.FORM,ContactType.WEB].some(type=>type===input.type)) {
    value=website(value)!;
    if(input.type===ContactType.LINKEDIN) {
      const host=new URL(value).hostname.toLowerCase();
      if(host!=='linkedin.com' && !host.endsWith('.linkedin.com')) throw new DirectoryError('INVALID_DIRECTORY');
    }
  }
  return {type:input.type,value,normalizedValue,label};
}
export function contactContext(input:ContactContextDto) {
  return {sourceDescription:institutionalText(input.sourceDescription,1000),sourceUrl:website(input.sourceUrl),notes:institutionalText(input.notes,5000)};
}
