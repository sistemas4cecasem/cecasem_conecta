export interface DirectorySearchQuery {
  q: string;
  page: number;
  pageSize: number;
  includeInactive: boolean;
}
export interface SearchPage<T> { items: T[]; total: number; page: number; pageSize: number }
export interface SearchOrganization {
  type: 'ORGANIZATION'; id: string; name: string; alias: string | null; country: string | null; isActive: boolean;
  parent: { id: string; name: string; isActive: boolean } | null;
  duplicateOf: { id: string; name: string; isActive: boolean } | null;
}
export interface SearchPerson {
  type: 'PERSON'; id: string; displayName: string; isActive: boolean;
  duplicateOf: { id: string; displayName: string; isActive: boolean } | null;
  currentRelations: { id: string; positionTitle: string | null; organization: { id: string; name: string; isActive: boolean } }[];
  currentRelationsTotal: number;
}
export interface SearchEmail {
  type: 'EMAIL'; id: string; value: string; condition: 'USABLE' | 'UNUSABLE';
  people: { items: { id: string; isActive: boolean; person: Omit<SearchPerson, 'type' | 'currentRelations' | 'currentRelationsTotal'> }[]; total: number; limit: number };
  organizations: { items: { id: string; isActive: boolean; organization: Omit<SearchOrganization, 'type' | 'alias' | 'country' | 'parent'> }[]; total: number; limit: number };
}
