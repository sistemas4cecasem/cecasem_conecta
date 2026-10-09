import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { hash } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  AuditAction,
  CommunicationDirection,
  ContactIntentState,
  MeetingAttendance,
  MeetingEventType,
  MeetingModality,
  MeetingStatus,
  OpportunityEventType,
  OpportunityStatus,
  ParticipantOrigin,
  PrismaClient,
  ProcessAuthority,
  ProcessEventType,
  ProcessResult,
  ProcessState,
  RecipientType,
  RestrictionState,
  UserRole,
} from './generated/prisma/client.js';
import { validateDatabaseUrl } from './config/database-url.js';

const SEED_VERSION = 1;
const PASSWORD_OPTIONS = { type: 2, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
const idPrefixes = {
  user: 'a1000000-0000-4000-a000',
  organization: 'a2000000-0000-4000-a000',
  person: 'a3000000-0000-4000-a000',
  category: 'a4000000-0000-4000-a000',
  contactMethod: 'a5000000-0000-4000-a000',
  relation: 'a6000000-0000-4000-a000',
  association: 'a7000000-0000-4000-a000',
  intent: 'a8000000-0000-4000-a000',
  process: 'a9000000-0000-4000-a000',
  processEvent: 'aa000000-0000-4000-a000',
  restriction: 'ab000000-0000-4000-a000',
  emailAccount: 'ac000000-0000-4000-a000',
  communication: 'ad000000-0000-4000-a000',
  recipient: 'ae000000-0000-4000-a000',
  note: 'af000000-0000-4000-a000',
  opportunity: 'b1000000-0000-4000-a000',
  opportunityEvent: 'b2000000-0000-4000-a000',
  meeting: 'b3000000-0000-4000-a000',
  meetingParticipant: 'b4000000-0000-4000-a000',
  agreement: 'b5000000-0000-4000-a000',
  meetingEvent: 'b6000000-0000-4000-a000',
  operation: 'b7000000-0000-4000-a000',
} as const;

type IdKind = keyof typeof idPrefixes;
function seedId(kind: IdKind, number: number): string {
  return `${idPrefixes[kind]}-${String(number).padStart(12, '0')}`;
}
function fingerprint(key: string): string {
  return createHash('sha256').update(`cecasem-conecta-seed-v${SEED_VERSION}:${key}`).digest('hex');
}
function daysAgo(now: Date, days: number, hours = 0): Date {
  return new Date(now.getTime() - (days * 24 + hours) * 60 * 60 * 1000);
}
function daysAhead(now: Date, days: number, hours = 0): Date {
  return new Date(now.getTime() + (days * 24 + hours) * 60 * 60 * 1000);
}
function dateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function normalizedCategory(name: string): string {
  return name.toLowerCase();
}

const seedUsers = [
  { key: 'admin1', givenNames: 'Alicia', familyNames: 'Administradora Demo', email: 'admin1@seed.example.test', role: UserRole.ADMINISTRATOR },
  { key: 'admin2', givenNames: 'Bruno', familyNames: 'Administrador Demo', email: 'admin2@seed.example.test', role: UserRole.ADMINISTRATOR },
  { key: 'board1', givenNames: 'Camila', familyNames: 'Directorio Demo', email: 'directorio1@seed.example.test', role: UserRole.BOARD },
  { key: 'board2', givenNames: 'Dario', familyNames: 'Directorio Demo', email: 'directorio2@seed.example.test', role: UserRole.BOARD },
  { key: 'research1', givenNames: 'Elena', familyNames: 'Busqueda Demo', email: 'busqueda1@seed.example.test', role: UserRole.RESEARCH },
  { key: 'research2', givenNames: 'Fabian', familyNames: 'Busqueda Demo', email: 'busqueda2@seed.example.test', role: UserRole.RESEARCH },
  { key: 'research3', givenNames: 'Gabriela', familyNames: 'Busqueda Demo', email: 'busqueda3@seed.example.test', role: UserRole.RESEARCH },
  { key: 'research4', givenNames: 'Hugo', familyNames: 'Busqueda Demo', email: 'busqueda4@seed.example.test', role: UserRole.RESEARCH },
  { key: 'planning1', givenNames: 'Ines', familyNames: 'Planificacion Demo', email: 'planificacion1@seed.example.test', role: UserRole.PLANNING },
  { key: 'planning2', givenNames: 'Javier', familyNames: 'Planificacion Demo', email: 'planificacion2@seed.example.test', role: UserRole.PLANNING },
] as const;
type SeedUserKey = typeof seedUsers[number]['key'];
type SeedUser = typeof seedUsers[number] & { id: string };

const categories = [
  'Cooperación internacional',
  'Educación y formación',
  'Salud comunitaria',
  'Desarrollo rural',
  'Medioambiente',
] as const;

const organizations = [
  { name: 'Fundación Semilla Andina (Demo)', alias: 'Semilla Andina Demo', category: 0, area: 'Cochabamba', summary: 'Organización ficticia para probar alianzas de desarrollo comunitario.' },
  { name: 'Asociación Puentes del Sur (Demo)', alias: 'Puentes del Sur Demo', category: 1, area: 'La Paz', summary: 'Organización ficticia para probar intercambio de metodologías educativas.' },
  { name: 'Instituto Voces del Territorio (Demo)', alias: 'Voces del Territorio Demo', category: 0, area: 'Oruro', summary: 'Organización ficticia para probar investigación y participación territorial.' },
  { name: 'Red Mujeres del Altiplano (Demo)', alias: 'Mujeres del Altiplano Demo', category: 2, area: 'La Paz', summary: 'Organización ficticia para probar coordinación de iniciativas comunitarias.' },
  { name: 'Centro de Innovación Rural (Demo)', alias: 'Innovación Rural Demo', category: 3, area: 'Tarija', summary: 'Organización ficticia para probar proyectos productivos y convocatorias.' },
  { name: 'Universidad Comunitaria del Valle (Demo)', alias: 'Universidad del Valle Demo', category: 1, area: 'Cochabamba', summary: 'Organización ficticia para probar convenios académicos y formación.' },
  { name: 'Cooperativa Bosques Vivos (Demo)', alias: 'Bosques Vivos Demo', category: 4, area: 'Santa Cruz', summary: 'Organización ficticia para probar colaboración ambiental.' },
  { name: 'Observatorio de Salud Local (Demo)', alias: 'Salud Local Demo', category: 2, area: 'Potosí', summary: 'Organización ficticia para probar intercambio de información en salud.' },
  { name: 'Fundación Ruta de Aprendizaje (Demo)', alias: 'Ruta de Aprendizaje Demo', category: 1, area: 'Sucre', summary: 'Organización ficticia con una restricción de contacto activa para pruebas.' },
  { name: 'Alianza Manos Abiertas (Demo)', alias: 'Manos Abiertas Demo', category: 0, area: 'Beni', summary: 'Organización ficticia con una restricción de contacto activa para pruebas.' },
] as const;

const people = [
  { givenNames: 'Ana', familyNames: 'Rojas Demo', title: 'Directora ejecutiva' },
  { givenNames: 'Mateo', familyNames: 'Vargas Demo', title: 'Coordinador de alianzas' },
  { givenNames: 'Beatriz', familyNames: 'Mamani Demo', title: 'Responsable de formación' },
  { givenNames: 'Nicolas', familyNames: 'Lopez Demo', title: 'Especialista de proyectos' },
  { givenNames: 'Carla', familyNames: 'Flores Demo', title: 'Directora de investigación' },
  { givenNames: 'Oscar', familyNames: 'Quispe Demo', title: 'Enlace territorial' },
  { givenNames: 'Daniela', familyNames: 'Rivera Demo', title: 'Presidenta de la red' },
  { givenNames: 'Pablo', familyNames: 'Choque Demo', title: 'Responsable de programas' },
  { givenNames: 'Estela', familyNames: 'Soria Demo', title: 'Gerenta de innovación' },
  { givenNames: 'Ruben', familyNames: 'Arce Demo', title: 'Coordinador técnico' },
  { givenNames: 'Fernanda', familyNames: 'Cruz Demo', title: 'Vicerrectora comunitaria' },
  { givenNames: 'Sergio', familyNames: 'Vega Demo', title: 'Director de extensión' },
  { givenNames: 'Gabriela', familyNames: 'Paz Demo', title: 'Presidenta de la cooperativa' },
  { givenNames: 'Hector', familyNames: 'Mendez Demo', title: 'Responsable ambiental' },
  { givenNames: 'Irma', familyNames: 'Salazar Demo', title: 'Directora del observatorio' },
  { givenNames: 'Jorge', familyNames: 'Lima Demo', title: 'Analista de datos' },
  { givenNames: 'Karen', familyNames: 'Torrez Demo', title: 'Directora de educación' },
  { givenNames: 'Luis', familyNames: 'Calle Demo', title: 'Gestor de cooperación' },
  { givenNames: 'Mariela', familyNames: 'Villarroel Demo', title: 'Directora de programas' },
  { givenNames: 'Nelson', familyNames: 'Gutierrez Demo', title: 'Coordinador regional' },
] as const;

type ProcessStateStep = { state: ProcessState; days: number };
type ProcessSpec = {
  organization: number;
  person: number;
  purpose: string;
  creator: SeedUserKey;
  states: readonly ProcessStateStep[];
  result?: ProcessResult;
  closure?: string;
  intent?: number;
};

const processSpecs: readonly ProcessSpec[] = [
  { organization: 1, person: 1, purpose: 'Explorar talleres ficticios de aprendizaje comunitario.', creator: 'research1', states: [{ state: ProcessState.PREPARATION, days: 4 }], intent: 1 },
  { organization: 2, person: 3, purpose: 'Intercambiar metodologías de formación para equipos locales.', creator: 'research1', states: [{ state: ProcessState.PREPARATION, days: 50 }, { state: ProcessState.IN_PROGRESS, days: 47 }] },
  { organization: 3, person: 5, purpose: 'Consultar a una persona referente sobre investigación territorial.', creator: 'board2', states: [{ state: ProcessState.PREPARATION, days: 40 }, { state: ProcessState.IN_PROGRESS, days: 38 }, { state: ProcessState.WAITING_RESPONSE, days: 30 }] },
  { organization: 4, person: 7, purpose: 'Negociar una agenda de colaboración comunitaria.', creator: 'research3', states: [{ state: ProcessState.PREPARATION, days: 65 }, { state: ProcessState.IN_PROGRESS, days: 61 }, { state: ProcessState.WAITING_RESPONSE, days: 40 }, { state: ProcessState.NEGOTIATION, days: 30 }] },
  { organization: 5, person: 9, purpose: 'Preparar una iniciativa piloto de innovación rural.', creator: 'research2', states: [{ state: ProcessState.PREPARATION, days: 100 }, { state: ProcessState.IN_PROGRESS, days: 92 }, { state: ProcessState.NEGOTIATION, days: 80 }, { state: ProcessState.CLOSED, days: 75 }], result: ProcessResult.ACHIEVED, closure: 'La organización confirmó el piloto y acordó un plan de trabajo inicial.' },
  { organization: 6, person: 11, purpose: 'Explorar un convenio de formación universitaria.', creator: 'research3', states: [{ state: ProcessState.PREPARATION, days: 60 }, { state: ProcessState.IN_PROGRESS, days: 55 }, { state: ProcessState.WAITING_RESPONSE, days: 50 }, { state: ProcessState.CLOSED, days: 20 }], result: ProcessResult.NO_RESPONSE, closure: 'Se cerró después de registrar varios intentos sin respuesta.' },
  { organization: 7, person: 13, purpose: 'Consultar opciones de colaboración para conservación comunitaria.', creator: 'research4', states: [{ state: ProcessState.PREPARATION, days: 18 }, { state: ProcessState.IN_PROGRESS, days: 15 }, { state: ProcessState.CLOSED, days: 10 }], result: ProcessResult.OTHER, closure: 'La contraparte priorizó otro calendario de trabajo; se podrá evaluar una nueva iniciativa posteriormente.' },
  { organization: 8, person: 15, purpose: 'Presentar una propuesta de intercambio de datos de salud comunitaria.', creator: 'research2', states: [{ state: ProcessState.PREPARATION, days: 35 }, { state: ProcessState.IN_PROGRESS, days: 25 }, { state: ProcessState.CLOSED, days: 18 }], result: ProcessResult.REJECTED, closure: 'La organización decidió no participar en esta propuesta específica.' },
];

type StoredCredentials = { version: number; password: string };

async function demoPassword(path: string): Promise<string> {
  let password: string | undefined;
  try {
    const credentials = JSON.parse(await readFile(path, 'utf8')) as StoredCredentials;
    if (credentials.version === SEED_VERSION && typeof credentials.password === 'string' && credentials.password.length >= 24) {
      password = credentials.password;
    }
  } catch {
    // Al iniciar por primera vez aún no existe el archivo local de credenciales.
  }
  password ??= `Cecasem-Demo-${randomBytes(24).toString('base64url')}`;
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify({
    note: 'Credencial local para las cuentas ficticias creadas por prisma:seed. Archivo ignorado por Git.',
    version: SEED_VERSION,
    password,
    accounts: seedUsers.map(({ key, email, role }) => ({ key, email, role })),
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return password;
}

async function seed(): Promise<void> {
  if (existsSync('.env')) loadEnvFile('.env');
  if (process.env.NODE_ENV === 'production') throw new Error('El seed ficticio solo se puede ejecutar fuera de producción.');
  const databaseUrl = validateDatabaseUrl(process.env.DATABASE_URL);
  const root = resolve(process.cwd(), '../..');
  const credentialsPath = resolve(root, 'storage/seed/demo-accounts.local.json');
  const password = await demoPassword(credentialsPath);
  const passwordHashes = {} as Record<SeedUserKey, string>;
  for (const user of seedUsers) passwordHashes[user.key] = await hash(password.normalize('NFC'), PASSWORD_OPTIONS);
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, application_name: 'cecasem-conecta-seed' });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: [] });
  const now = new Date();
  const users = Object.fromEntries(seedUsers.map((user, index) => [user.key, { ...user, id: seedId('user', index + 1) }])) as Record<SeedUserKey, SeedUser>;

  try {
    await prisma.$connect();
    await prisma.$transaction(async tx => {
      for (const user of Object.values(users)) {
        await tx.user.upsert({
          where: { id: user.id },
          create: { id: user.id, givenNames: user.givenNames, familyNames: user.familyNames, username: `${user.givenNames.toLowerCase()}.${user.familyNames.split(' ')[0].toLowerCase()}`, email: user.email,
            role: user.role, passwordHash: passwordHashes[user.key], mustChangePassword: false, isActive: true, createdAt: daysAgo(now, 150), updatedAt: daysAgo(now, 150) },
          update: {},
        });
      }

      for (const [index, name] of categories.entries()) {
        const id = seedId('category', index + 1);
        await tx.category.upsert({ where: { id }, create: { id, name, normalizedName: normalizedCategory(name) }, update: {} });
      }

      for (const [index, organization] of organizations.entries()) {
        const id = seedId('organization', index + 1);
        const data = { name: organization.name, alias: organization.alias, country: 'Bolivia', description: organization.summary,
          officialWebsite: `https://org-${index + 1}.example.test`, isActive: true, lastVerifiedAt: null };
        await tx.organization.upsert({ where: { id }, create: { id, ...data, createdAt: daysAgo(now, 200 - index), updatedAt: daysAgo(now, 200 - index) }, update: {} });
        await tx.organizationCategory.upsert({
          where: { organizationId_categoryId: { organizationId: id, categoryId: seedId('category', organization.category + 1) } },
          create: { organizationId: id, categoryId: seedId('category', organization.category + 1) }, update: {},
        });
      }

      for (const [index, person] of people.entries()) {
        const id = seedId('person', index + 1);
        const organizationIndex = Math.floor(index / 2);
        const data = { givenNames: person.givenNames, familyNames: person.familyNames, displayName: `${person.givenNames} ${person.familyNames}`,
          isActive: true, lastVerifiedAt: null };
        await tx.person.upsert({ where: { id }, create: { id, ...data, createdAt: daysAgo(now, 195 - organizationIndex), updatedAt: daysAgo(now, 195 - organizationIndex) }, update: {} });
        const relationId = seedId('relation', index + 1);
        await tx.personOrganizationRelation.upsert({
          where: { id: relationId },
          create: { id: relationId, personId: id, organizationId: seedId('organization', organizationIndex + 1), positionTitle: person.title,
            area: organizations[organizationIndex].area, isCurrent: true, startDate: new Date(Date.UTC(2022, organizationIndex % 12, 1)),
            sourceDescription: 'Relación sintética de demostración; pendiente de verificación.', sourceUrl: `https://org-${organizationIndex + 1}.example.test`, lastVerifiedAt: null,
            createdAt: daysAgo(now, 195 - organizationIndex), updatedAt: daysAgo(now, 195 - organizationIndex) },
          update: {},
        });
      }

      for (const [index] of organizations.entries()) {
        const contactMethodId = seedId('contactMethod', index + 1);
        const email = `contacto${index + 1}@seed.example.test`;
        await tx.contactMethod.upsert({ where: { id: contactMethodId },
          create: { id: contactMethodId, type: 'EMAIL', value: email, normalizedValue: email, label: 'Correo institucional ficticio', condition: 'USABLE' },
          update: {} });
        const associationId = seedId('association', index + 1);
        await tx.organizationContact.upsert({ where: { id: associationId },
          create: { id: associationId, organizationId: seedId('organization', index + 1), contactMethodId,
            sourceDescription: 'Dato ficticio de seed; pendiente de verificación.', sourceUrl: `https://org-${index + 1}.example.test`, lastVerifiedAt: null },
          update: {} });
      }

      for (const [index] of people.entries()) {
        const contactNumber = index + 11;
        const contactMethodId = seedId('contactMethod', contactNumber);
        const email = `persona${index + 1}@seed.example.test`;
        await tx.contactMethod.upsert({ where: { id: contactMethodId },
          create: { id: contactMethodId, type: 'EMAIL', value: email, normalizedValue: email, label: 'Correo de persona ficticio', condition: 'USABLE' },
          update: {} });
        const associationId = seedId('association', contactNumber);
        await tx.personContact.upsert({ where: { id: associationId },
          create: { id: associationId, personId: seedId('person', index + 1), contactMethodId,
            sourceDescription: 'Dato ficticio de seed; pendiente de verificación.', sourceUrl: `https://org-${Math.floor(index / 2) + 1}.example.test`, lastVerifiedAt: null },
          update: {} });
      }

      const mailboxId = seedId('emailAccount', 1);
      const mailboxAddress = 'buzon.demo@seed.example.test';
      await tx.emailAccount.upsert({ where: { id: mailboxId },
        create: { id: mailboxId, address: mailboxAddress, displayName: 'Buzón institucional ficticio', provider: 'Cuenta de demostración sin sincronización', createdAt: daysAgo(now, 140), updatedAt: daysAgo(now, 140) },
        update: {} });
      for (const [userIndex, user] of Object.values(users).entries()) {
        await tx.userEmailAccount.upsert({ where: { userId_emailAccountId: { userId: user.id, emailAccountId: mailboxId } },
          create: { userId: user.id, emailAccountId: mailboxId, createdAt: daysAgo(now, 130) }, update: {} });
        const auditId = seedId('operation', 1_100 + userIndex + 1);
        await tx.auditEvent.upsert({ where: { id: auditId }, create: { id: auditId, action: AuditAction.MAILBOX_ASSIGNED,
          emailAccountId: mailboxId, targetUserId: user.id, actorUserId: users.admin1.id, createdAt: daysAgo(now, 130) }, update: {} });
      }

      const intentSpecs = [
        { number: 1, targetOrganization: 1, targetPerson: null, author: 'research1' as const, purpose: processSpecs[0].purpose, state: ContactIntentState.CONVERTED, createdDaysAgo: 8 },
        { number: 2, targetOrganization: 8, targetPerson: null, author: 'research4' as const, purpose: 'Consultar si existe interés en un intercambio de indicadores comunitarios.', state: ContactIntentState.ACTIVE, createdDaysAgo: 3 },
        { number: 3, targetOrganization: null, targetPerson: 16, author: 'research2' as const, purpose: 'Preparar una primera conversación sobre el uso de información local.', state: ContactIntentState.ACTIVE, createdDaysAgo: 1 },
      ];
      for (const intent of intentSpecs) {
        const id = seedId('intent', intent.number);
        const createdAt = daysAgo(now, intent.createdDaysAgo);
        const convertedAt = daysAgo(now, 4);
        await tx.contactIntent.upsert({ where: { id },
          create: { id, purpose: intent.purpose, authorUserId: users[intent.author].id,
            organizationId: intent.targetOrganization ? seedId('organization', intent.targetOrganization) : null,
            personId: intent.targetPerson ? seedId('person', intent.targetPerson) : null, state: intent.state,
            createdAt, updatedAt: intent.state === ContactIntentState.CONVERTED ? convertedAt : createdAt,
            lastActivityAt: intent.state === ContactIntentState.CONVERTED ? convertedAt : createdAt },
          update: {} });
        await tx.auditEvent.upsert({ where: { id: seedId('operation', 100 + intent.number) },
          create: { id: seedId('operation', 100 + intent.number), action: AuditAction.CONTACT_INTENT_CREATED, contactIntentId: id,
            actorUserId: users[intent.author].id, operationId: seedId('operation', 100 + intent.number), createdAt }, update: {} });
        if (intent.state === ContactIntentState.CONVERTED) {
          await tx.auditEvent.upsert({ where: { id: seedId('operation', 200 + intent.number) },
            create: { id: seedId('operation', 200 + intent.number), action: AuditAction.CONTACT_INTENT_CONVERTED, contactIntentId: id,
              actorUserId: users[intent.author].id, operationId: seedId('operation', 200 + intent.number), createdAt: convertedAt }, update: {} });
        }
      }

      for (const [index, spec] of processSpecs.entries()) {
        const processId = seedId('process', index + 1);
        const actor = users[spec.creator];
        const timestamps = spec.states.map(step => daysAgo(now, step.days));
        const lastTimestamp = timestamps[timestamps.length - 1];
        const isClosed = spec.states.at(-1)?.state === ProcessState.CLOSED;
        await tx.relationshipProcess.upsert({ where: { id: processId },
          create: { id: processId, purpose: spec.purpose,
            organizationId: seedId('organization', spec.organization), personId: null,
            ...(index === 2 ? { organizationId: null, personId: seedId('person', spec.person) } : {}),
            sourceIntentId: spec.intent ? seedId('intent', spec.intent) : null, createdByUserId: actor.id,
            state: spec.states[spec.states.length - 1].state, version: spec.states.length,
            createdAt: timestamps[0], updatedAt: lastTimestamp, lastActivityAt: lastTimestamp,
            currentResult: spec.result ?? null, closureObservation: spec.closure ?? null,
            closedAt: isClosed ? lastTimestamp : null, closedByUserId: isClosed ? actor.id : null },
          update: {} });
        await tx.processParticipant.upsert({ where: { processId_userId: { processId, userId: actor.id } },
          create: { processId, userId: actor.id, joinedAt: timestamps[0], origin: ParticipantOrigin.PROCESS_CREATOR }, update: {} });

        let previousState: ProcessState | null = null;
        for (const [stepIndex, step] of spec.states.entries()) {
          const isFirst = stepIndex === 0;
          const isFinalClose = step.state === ProcessState.CLOSED;
          const eventId = seedId('processEvent', (index + 1) * 10 + stepIndex + 1);
          const eventType = isFirst ? ProcessEventType.CREATED : isFinalClose ? ProcessEventType.CLOSED : ProcessEventType.STATE_CHANGED;
          const event = { id: eventId, processId, type: eventType, previousState,
            newState: step.state, result: isFinalClose ? spec.result ?? null : null,
            observation: isFinalClose ? spec.closure ?? null : null, actorUserId: actor.id,
            authority: isFirst ? ProcessAuthority.PARTICIPANT : actor.role === UserRole.ADMINISTRATOR ? ProcessAuthority.ADMINISTRATOR : actor.role === UserRole.BOARD ? ProcessAuthority.BOARD : ProcessAuthority.PARTICIPANT,
            version: stepIndex + 1, createdAt: timestamps[stepIndex] };
          await tx.relationshipProcessEvent.createMany({ data: [event], skipDuplicates: true });
          const action = isFirst ? AuditAction.PROCESS_CREATED : isFinalClose ? AuditAction.PROCESS_CLOSED : AuditAction.PROCESS_STATE_CHANGED;
          await tx.auditEvent.upsert({ where: { id: seedId('operation', 300 + (index + 1) * 10 + stepIndex) },
            create: { id: seedId('operation', 300 + (index + 1) * 10 + stepIndex), action, processEventId: eventId,
              actorUserId: actor.id, operationId: eventId, createdAt: timestamps[stepIndex] }, update: {} });
          previousState = step.state;
        }
      }

      const restrictions = [
        { number: 1, organization: 9, state: RestrictionState.ACTIVE, daysAgo: 15, reason: 'Solicitud ficticia de no iniciar nuevos contactos mientras revisan su política institucional.' },
        { number: 2, organization: 10, state: RestrictionState.ACTIVE, daysAgo: 7, reason: 'La organización pidió pausar cualquier contacto hasta nuevo aviso.' },
        { number: 3, organization: 7, state: RestrictionState.LIFTED, daysAgo: 80, reason: 'Restricción ficticia anterior para probar el historial de levantamiento.' },
      ] as const;
      for (const restriction of restrictions) {
        const id = seedId('restriction', restriction.number);
        const createdAt = daysAgo(now, restriction.daysAgo);
        const liftedAt = daysAgo(now, 60);
        const registrar = users[restriction.number === 2 ? 'board2' : 'admin1'];
        const lifter = restriction.state === RestrictionState.LIFTED ? users.admin2 : null;
        await tx.contactRestriction.upsert({ where: { id },
          create: { id, organizationId: seedId('organization', restriction.organization), personId: null, reason: restriction.reason,
            state: restriction.state, registeredByUserId: registrar.id, createdAt, updatedAt: restriction.state === RestrictionState.LIFTED ? liftedAt : createdAt,
            liftedAt: restriction.state === RestrictionState.LIFTED ? liftedAt : null, liftedByUserId: lifter?.id ?? null,
            liftReason: lifter ? 'La organización ficticia confirmó que la pausa había terminado.' : null, version: lifter ? 2 : 1 },
          update: {} });
        await tx.auditEvent.upsert({ where: { id: seedId('operation', 400 + restriction.number * 2) },
          create: { id: seedId('operation', 400 + restriction.number * 2), action: AuditAction.CONTACT_RESTRICTION_CREATED,
            contactRestrictionId: id, actorUserId: registrar.id, operationId: seedId('operation', 400 + restriction.number * 2), createdAt }, update: {} });
        if (lifter) await tx.auditEvent.upsert({ where: { id: seedId('operation', 401 + restriction.number * 2) },
          create: { id: seedId('operation', 401 + restriction.number * 2), action: AuditAction.CONTACT_RESTRICTION_LIFTED,
            contactRestrictionId: id, actorUserId: lifter.id, operationId: seedId('operation', 401 + restriction.number * 2), createdAt: liftedAt }, update: {} });
      }

      const mailbox = await tx.emailAccount.findUniqueOrThrow({ where: { id: mailboxId } });
      const communicationSpecs = [
        { number: 1, process: 2, direction: CommunicationDirection.SENT, actor: 'board1' as const, person: 3, days: 3, subject: 'Presentación de la propuesta de formación', body: 'Mensaje ficticio: compartimos una propuesta inicial para intercambiar metodologías de formación. No se envió ningún correo desde CECASEM Conecta.' },
        { number: 2, process: 3, direction: CommunicationDirection.SENT, actor: 'research2' as const, person: 5, days: 28, subject: 'Consulta sobre investigación territorial', body: 'Mensaje ficticio: consultamos disponibilidad para una conversación sobre investigación territorial. No se envió ningún correo desde CECASEM Conecta.' },
        { number: 3, process: 4, direction: CommunicationDirection.SENT, actor: 'research3' as const, person: 7, days: 25, subject: 'Borrador de agenda de colaboración', body: 'Mensaje ficticio: proponemos revisar una agenda de colaboración y sus próximos pasos. No se envió ningún correo desde CECASEM Conecta.' },
        { number: 4, process: 4, direction: CommunicationDirection.RECEIVED, actor: 'research4' as const, person: 7, days: 20, subject: 'Respuesta y propuesta de reunión', body: 'Respuesta ficticia: la contraparte propone una reunión para revisar actividades y responsabilidades.' },
        { number: 5, process: 5, direction: CommunicationDirection.SENT, actor: 'research2' as const, person: 9, days: 85, subject: 'Propuesta de piloto rural', body: 'Mensaje ficticio: compartimos un borrador para un piloto rural y solicitamos comentarios.' },
        { number: 6, process: 5, direction: CommunicationDirection.RECEIVED, actor: 'research1' as const, person: 9, days: 79, subject: 'Confirmación de colaboración piloto', body: 'Respuesta ficticia: la organización confirma interés y propone coordinar un plan inicial.' },
        { number: 7, process: 6, direction: CommunicationDirection.SENT, actor: 'research3' as const, person: 11, days: 50, subject: 'Invitación a explorar un convenio', body: 'Mensaje ficticio: invitamos a conversar sobre un convenio de formación; no se registró respuesta posterior.' },
      ];
      const communicationIds = new Map<number, string>();
      for (const spec of communicationSpecs) {
        const id = seedId('communication', spec.number);
        communicationIds.set(spec.number, id);
        const personEmail = `persona${spec.person}@seed.example.test`;
        const occurredAt = daysAgo(now, spec.days);
        const isSent = spec.direction === CommunicationDirection.SENT;
        const sender = isSent ? mailbox.address : personEmail;
        const requestKey = seedId('operation', 500 + spec.number);
        const data = { processId: seedId('process', spec.process), direction: spec.direction, validity: 'VALID' as const,
          emailAccountId: isSent ? mailboxId : null, accountAddressSnapshot: isSent ? mailbox.address : null,
          accountDisplayNameSnapshot: isSent ? mailbox.displayName : null,
          senderSnapshot: sender, senderNormalizedAddress: sender.toLowerCase(), subject: spec.subject, bodyOriginal: spec.body,
          sentAt: spec.direction === CommunicationDirection.SENT ? occurredAt : null,
          receivedAt: spec.direction === CommunicationDirection.RECEIVED ? occurredAt : null,
          occurredAt, createdAt: occurredAt, registeredByUserId: users[spec.actor].id, requestKey, requestFingerprint: fingerprint(`communication:${spec.number}`) };
        await tx.communication.upsert({ where: { id }, create: { id, ...data }, update: {} });
        const addresses = spec.direction === CommunicationDirection.SENT
          ? [{ address: personEmail, type: RecipientType.TO }, ...(spec.number === 1 ? [{ address: 'contacto2@seed.example.test', type: RecipientType.CC }] : []), ...(spec.number === 3 ? [{ address: 'archivo@seed.example.test', type: RecipientType.BCC }] : [])]
          : [{ address: mailbox.address, type: RecipientType.TO }];
        for (const [position, recipient] of addresses.entries()) {
          const recipientId = seedId('recipient', spec.number * 10 + position + 1);
          await tx.communicationRecipient.upsert({ where: { id: recipientId },
            create: { id: recipientId, communicationId: id, type: recipient.type, addressOriginal: recipient.address,
              normalizedAddress: recipient.address.toLowerCase(), position, ...(recipient.address === mailbox.address ? { emailAccountId: mailboxId, emailAccountDisplayNameSnapshot: mailbox.displayName } : {}) }, update: {} });
        }
        await tx.processParticipant.upsert({ where: { processId_userId: { processId: seedId('process', spec.process), userId: users[spec.actor].id } },
          create: { processId: seedId('process', spec.process), userId: users[spec.actor].id, joinedAt: occurredAt,
            origin: spec.direction === CommunicationDirection.SENT ? ParticipantOrigin.SENT_COMMUNICATION : ParticipantOrigin.RECEIVED_COMMUNICATION }, update: {} });
        const auditId = seedId('operation', 600 + spec.number);
        await tx.auditEvent.upsert({ where: { id: auditId },
          create: { id: auditId, action: spec.direction === CommunicationDirection.SENT ? AuditAction.SENT_COMMUNICATION_REGISTERED : AuditAction.RECEIVED_COMMUNICATION_REGISTERED,
            communicationId: id, ...(spec.direction === CommunicationDirection.RECEIVED ? { processId: seedId('process', spec.process) } : {}),
            actorUserId: users[spec.actor].id, operationId: requestKey, createdAt: occurredAt }, update: {} });
      }

      for (const [processNumber, activityDaysAgo] of [[2, 3], [3, 28], [4, 20]] as const) {
        const lastActivityAt = daysAgo(now, activityDaysAgo);
        await tx.relationshipProcess.updateMany({ where: { id: seedId('process', processNumber), lastActivityAt: { lt: lastActivityAt } },
          data: { lastActivityAt, updatedAt: lastActivityAt } });
      }

      for (const note of [
        { number: 1, process: 2, author: 'research4' as const, days: 2, body: 'Nota interna ficticia: preparar una versión breve de la propuesta antes de la próxima conversación. Esta nota no representa un correo enviado.' },
        { number: 2, process: 4, author: 'board1' as const, days: 19, body: 'Nota interna ficticia: confirmar disponibilidad del equipo y compartir opciones de agenda.' },
      ]) {
        const id = seedId('note', note.number);
        await tx.internalNote.upsert({ where: { id }, create: { id, processId: seedId('process', note.process), body: note.body,
          authorUserId: users[note.author].id, createdAt: daysAgo(now, note.days) }, update: {} });
      }

      const opportunitySpecs = [
        { number: 1, name: 'Convocatoria ficticia de colaboración comunitaria', process: 4, communication: 4, creator: 'planning1' as const,
          status: OpportunityStatus.PREPARING, states: [OpportunityStatus.PENDING_REVIEW, OpportunityStatus.PREPARING],
          description: 'Oportunidad sintética derivada de una respuesta registrada en el proceso.', discardReason: null, finalResult: null },
        { number: 2, name: 'Fondo ficticio de formación local', process: 2, communication: null, creator: 'planning2' as const,
          status: OpportunityStatus.PENDING_REVIEW, states: [OpportunityStatus.PENDING_REVIEW],
          description: 'Registro de oportunidad para revisar requisitos y decidir si se prepara una postulación.', discardReason: null, finalResult: null },
        { number: 3, name: 'Programa ficticio de innovación rural', process: 6, communication: null, creator: 'planning1' as const,
          status: OpportunityStatus.DISCARDED, states: [OpportunityStatus.PENDING_REVIEW, OpportunityStatus.DISCARDED],
          description: 'Oportunidad de muestra para probar la conservación del motivo de descarte.', discardReason: 'El plazo y los requisitos no son compatibles con la capacidad disponible.', finalResult: null },
      ];
      for (const opportunity of opportunitySpecs) {
        const id = seedId('opportunity', opportunity.number);
        const createdAt = daysAgo(now, 10 - opportunity.number);
        const opportunityData = { name: opportunity.name, description: opportunity.description,
          url: `https://convocatoria-${opportunity.number}.example.test`, deadline: dateOnly(daysAhead(now, 45 + opportunity.number)),
          requirements: 'Revisar criterios de elegibilidad, cronograma y documentación de respaldo ficticios.', status: opportunity.status,
          discardReason: opportunity.discardReason, finalResult: opportunity.finalResult, processId: seedId('process', opportunity.process),
          communicationId: opportunity.communication ? communicationIds.get(opportunity.communication)! : null,
          createdByUserId: users[opportunity.creator].id, createdAt, updatedAt: opportunity.status === OpportunityStatus.DISCARDED ? daysAgo(now, 2) : createdAt,
          version: opportunity.states.length, requestKey: seedId('operation', 700 + opportunity.number), requestFingerprint: fingerprint(`opportunity:${opportunity.number}`) };
        await tx.opportunity.upsert({ where: { id }, create: { id, ...opportunityData }, update: {} });
        await tx.opportunityOrganization.upsert({ where: { opportunityId_organizationId: { opportunityId: id, organizationId: seedId('organization', opportunity.process) } },
          create: { opportunityId: id, organizationId: seedId('organization', opportunity.process) }, update: {} });
        for (const [eventIndex, status] of opportunity.states.entries()) {
          const eventId = seedId('opportunityEvent', opportunity.number * 10 + eventIndex + 1);
          const previousStatus = eventIndex === 0 ? null : opportunity.states[eventIndex - 1];
          const finalDiscard = status === OpportunityStatus.DISCARDED;
          const type = eventIndex === 0 ? OpportunityEventType.CREATED : finalDiscard ? OpportunityEventType.DISCARDED : OpportunityEventType.STATUS_CHANGED;
          const eventAt = eventIndex === 0 ? createdAt : daysAgo(now, 2);
          const changes = finalDiscard
            ? { discardReason: { previous: null, next: opportunity.discardReason } }
            : eventIndex === 0 ? { description: { previous: null, next: { name: opportunity.name, description: opportunity.description } } } : {};
          await tx.opportunityEvent.createMany({ data: [{ id: eventId, opportunityId: id, type,
            previousStatus, newStatus: status, changes,
            actorUserId: users[opportunity.creator].id, createdAt: eventAt, version: eventIndex + 1 }], skipDuplicates: true });
          const auditId = seedId('operation', 750 + opportunity.number * 10 + eventIndex);
          const action = eventIndex === 0 ? AuditAction.OPPORTUNITY_CREATED : finalDiscard ? AuditAction.OPPORTUNITY_DISCARDED : AuditAction.OPPORTUNITY_STATUS_CHANGED;
          await tx.auditEvent.upsert({ where: { id: auditId }, create: { id: auditId, action, opportunityEventId: eventId,
            actorUserId: users[opportunity.creator].id, operationId: eventId, createdAt: eventAt }, update: {} });
        }
      }

      const meetingSpecs = [
        { number: 1, process: 4, opportunity: 1, creator: 'planning1' as const, person: 7, status: MeetingStatus.SCHEDULED,
          scheduledAt: daysAhead(now, 14, 17), createdAt: daysAgo(now, 1), modality: MeetingModality.ONLINE,
          purpose: 'Revisar el plan ficticio de colaboración, responsables y próximos pasos.', meetingUrl: 'https://reunion.example.test/agenda-1', location: null },
        { number: 2, process: 5, opportunity: null, creator: 'planning2' as const, person: 9, status: MeetingStatus.COMPLETED,
          scheduledAt: daysAgo(now, 77), createdAt: daysAgo(now, 80), modality: MeetingModality.IN_PERSON,
          purpose: 'Reunión ficticia de cierre para acordar el piloto rural.', meetingUrl: null, location: 'Sala de reuniones ficticia, Cochabamba' },
      ];
      for (const meeting of meetingSpecs) {
        const id = seedId('meeting', meeting.number);
        const completedAt = meeting.status === MeetingStatus.COMPLETED ? new Date(meeting.scheduledAt.getTime() + 60 * 60 * 1000) : null;
        const participants = [
          { number: 1, user: meeting.creator, personId: null, name: `${users[meeting.creator].givenNames} ${users[meeting.creator].familyNames}`, organization: 'CECASEM Demo', role: 'Planificación' },
          { number: 2, user: null, personId: meeting.person, name: `${people[meeting.person - 1].givenNames} ${people[meeting.person - 1].familyNames}`,
            organization: organizations[meeting.process - 1].name, role: people[meeting.person - 1].title },
        ];
        const participantIds = participants.map(participant => seedId('meetingParticipant', meeting.number * 10 + participant.number));
        const agreementId = seedId('agreement', meeting.number);
        const eventCount = meeting.status === MeetingStatus.SCHEDULED ? 4 : 5;
        await tx.meeting.upsert({ where: { id }, create: { id, processId: seedId('process', meeting.process),
          opportunityId: meeting.opportunity ? seedId('opportunity', meeting.opportunity) : null, scheduledAt: meeting.scheduledAt,
          timezone: 'America/La_Paz', modality: meeting.modality, meetingUrl: meeting.meetingUrl, location: meeting.location,
          purpose: meeting.purpose, status: meeting.status, completedAt, createdByUserId: users[meeting.creator].id,
          createdAt: meeting.createdAt, updatedAt: completedAt ?? meeting.createdAt, version: eventCount, requestKey: seedId('operation', 800 + meeting.number),
          requestFingerprint: fingerprint(`meeting:${meeting.number}`) }, update: {} });
        for (const [participantIndex, participant] of participants.entries()) {
          const participantId = participantIds[participantIndex];
          await tx.meetingParticipant.upsert({ where: { id: participantId }, create: { id: participantId, meetingId: id,
            userId: participant.user ? users[participant.user].id : null,
            personId: participant.personId ? seedId('person', participant.personId) : null,
            nameSnapshot: participant.name, organizationSnapshot: participant.organization, roleSnapshot: participant.role,
            attendance: meeting.status === MeetingStatus.COMPLETED ? MeetingAttendance.ATTENDED : MeetingAttendance.UNKNOWN,
            createdByUserId: users[meeting.creator].id, createdAt: meeting.createdAt }, update: {} });
        }
        const agreementText = meeting.status === MeetingStatus.COMPLETED
          ? 'Acuerdo ficticio: compartir un calendario inicial de actividades y revisar avances en un mes.'
          : 'Acuerdo propuesto: validar responsables y fechas durante la reunión.';
        await tx.meetingAgreement.createMany({ data: [{ id: agreementId, meetingId: id,
          text: agreementText, createdByUserId: users[meeting.creator].id, createdAt: meeting.createdAt }], skipDuplicates: true });
        const eventDefinitions = [
          { type: MeetingEventType.CREATED, participantId: null, agreementId: null },
          { type: MeetingEventType.PARTICIPANT_ADDED, participantId: participantIds[0], agreementId: null },
          { type: MeetingEventType.PARTICIPANT_ADDED, participantId: participantIds[1], agreementId: null },
          { type: MeetingEventType.AGREEMENT_ADDED, participantId: null, agreementId },
          ...(meeting.status === MeetingStatus.COMPLETED ? [{ type: MeetingEventType.COMPLETED, participantId: null, agreementId: null }] : []),
        ];
        for (const [eventIndex, definition] of eventDefinitions.entries()) {
          const eventId = seedId('meetingEvent', meeting.number * 10 + eventIndex + 1);
          const isCompletionEvent = definition.type === MeetingEventType.COMPLETED;
          const eventAt = isCompletionEvent ? completedAt! : meeting.createdAt;
          const eventStatus = isCompletionEvent ? MeetingStatus.COMPLETED : MeetingStatus.SCHEDULED;
          await tx.meetingEvent.createMany({ data: [{ id: eventId, meetingId: id, type: definition.type,
            version: eventIndex + 1, snapshot: { status: eventStatus, scheduledAt: meeting.scheduledAt.toISOString(), purpose: meeting.purpose },
            changes: { type: definition.type, ...(isCompletionEvent ? { status: eventStatus } : {}) }, participantId: definition.participantId, agreementId: definition.agreementId,
            actorUserId: users[meeting.creator].id, createdAt: eventAt, requestKey: seedId('operation', 900 + meeting.number * 10 + eventIndex),
            requestFingerprint: fingerprint(`meeting-event:${meeting.number}:${eventIndex}`) }], skipDuplicates: true });
          const auditId = seedId('operation', 1_000 + meeting.number * 10 + eventIndex);
          await tx.auditEvent.upsert({ where: { id: auditId }, create: { id: auditId, action: AuditAction.MEETING_RECORDED,
            meetingEventId: eventId, actorUserId: users[meeting.creator].id, operationId: eventId, createdAt: eventAt }, update: {} });
        }
        await tx.processParticipant.upsert({ where: { processId_userId: { processId: seedId('process', meeting.process), userId: users[meeting.creator].id } },
          create: { processId: seedId('process', meeting.process), userId: users[meeting.creator].id, joinedAt: meeting.createdAt,
            origin: ParticipantOrigin.MEETING_CREATED }, update: {} });
        if (meeting.status === MeetingStatus.SCHEDULED) {
          await tx.relationshipProcess.updateMany({ where: { id: seedId('process', meeting.process), lastActivityAt: { lt: meeting.createdAt } },
            data: { lastActivityAt: meeting.createdAt, updatedAt: meeting.createdAt } });
        }
      }
    }, { timeout: 60_000 });

    console.info('Seed de desarrollo aplicado.');
    console.info(`Cuentas: ${seedUsers.length} (2 administradores, 2 directorio, 4 búsqueda y 2 planificación).`);
    console.info(`Directorio: ${organizations.length} organizaciones, ${people.length} personas y ${people.length} relaciones vigentes.`);
    console.info('Incluye 8 procesos con estados variados, 3 intenciones, 2 restricciones activas, comunicaciones, oportunidades, notas y reuniones.');
    console.info(`Credenciales locales: ${credentialsPath}`);
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      await pool.end();
    }
  }
}

seed().catch(error => {
  console.error('No se pudo aplicar el seed. Verifica DATABASE_URL, las migraciones y la disponibilidad de PostgreSQL.');
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
