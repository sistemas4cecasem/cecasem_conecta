// Solo para unit/e2e con Prisma sustituido: no abre conexiones PostgreSQL.
process.env.DATABASE_URL ??= 'postgresql://test:example@localhost:5432/cecasem_test';
