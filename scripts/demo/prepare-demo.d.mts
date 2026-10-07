export interface DemoDirectoryCounts {
  organizations: number;
  people: number;
  contactMethods: number;
}

export interface DemoPreviewEvent {
  stage: 'before' | 'after';
  definition: { name: string; recordKind: string };
  preview: unknown;
  directoryCounts: DemoDirectoryCounts;
}

export interface DemoPrepareOptions {
  baseUrl?: string;
  adminEmail: string;
  adminPassword: string;
  credentialsPath?: string;
  workbookPath?: string;
  allowTestPort?: boolean;
  assumeYes?: boolean;
  fetchImpl?: typeof fetch;
  onPreview?: (event: DemoPreviewEvent) => void | Promise<void>;
}

export interface DemoImportSummary {
  worksheetName: string;
  recordKind: string;
  batchId: string;
  analyzedRows: number;
  readyRows: number;
  reviewRows: number;
  invalidRows: number;
  possibleMatches: number;
  rows: { READY: number; NEEDS_REVIEW: number; INVALID: number };
}

export interface DemoPrepareResult {
  organizationId: string;
  similarOrganizationId: string;
  restrictedOrganizationId: string;
  personId: string;
  intentId: string;
  processId: string;
  sentCommunicationId: string;
  receivedCommunicationId: string;
  opportunityId: string;
  meetingId: string;
  restrictionId: string;
  batches: Array<{ id: string; status: string; importedRows: number; invalidRows: number }>;
  credentialsPath: string;
  workbookPath: string;
  previews: DemoImportSummary[];
}

export declare function prepareDemoDataset(options: DemoPrepareOptions): Promise<DemoPrepareResult>;
