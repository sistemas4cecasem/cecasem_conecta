// Ejecutar por stdin desde apps/api, después de build. No crea cuentas ni imprime secretos.
const { PasswordService, PASSWORD_OPTIONS } = require('./dist/modules/auth/password.service.js');
const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');

async function benchmark() {
  const service = new PasswordService();
  await service.onModuleInit();
  const password = randomBytes(24).toString('base64url');
  await service.hashNew(password);
  const hashing = []; const verification = [];
  for (let i = 0; i < 5; i++) {
    let start = performance.now();
    const stored = await service.hashNew(password);
    hashing.push(performance.now() - start);
    start = performance.now();
    if (!await service.verify(password, stored)) throw new Error('Verification failed');
    verification.push(performance.now() - start);
  }
  const summarize = (values) => ({ samples: values.length,
    meanMs: Math.round(values.reduce((a, b) => a + b) / values.length), maxMs: Math.round(Math.max(...values)) });
  console.log(JSON.stringify({ platform: process.platform, node: process.version, parameters: PASSWORD_OPTIONS,
    hashing: summarize(hashing), verification: summarize(verification) }));
  if (Math.max(...hashing, ...verification) >= 1000) process.exitCode = 1;
}
benchmark().catch(() => { console.error('Benchmark failed without exposing input or hash.'); process.exitCode = 1; });
