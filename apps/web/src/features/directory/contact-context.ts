import type { ContactAssociation, ContactContextValues } from './contacts.contracts';
export function contextValues(row?:ContactAssociation):ContactContextValues {return {sourceDescription:row?.sourceDescription??'',sourceUrl:row?.sourceUrl??'',notes:row?.notes??''};}
export function associationPath(row:ContactAssociation) {return ('personId' in row?'person-contacts/':'organization-contacts/')+row.id;}
