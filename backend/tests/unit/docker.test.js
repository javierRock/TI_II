import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dockerEnvironment } from '../../scripts/docker-environment.js';
import { readDemoConfiguration } from '../../scripts/demo-config.js';

test('la API Docker recibe solo su conexión restringida y codifica contraseñas especiales', () => {
  const env = dockerEnvironment({ POSTGRES_API_PASSWORD: 'clave:@/#% especial', DOCKER_DB_NAME: 'prestamos_demo' });
  const url = new URL(env.DATABASE_URL);
  assert.equal(url.hostname, 'postgres');
  assert.equal(url.pathname, '/prestamos_demo');
  assert.equal(decodeURIComponent(url.password), 'clave:@/#% especial');
  assert.equal(env.SKIP_DOTENV, '1');
  assert.equal(Object.hasOwn(env, 'ADMIN_DATABASE_URL'), false);
  assert.equal(Object.hasOwn(env, 'MIGRATION_DATABASE_URL'), false);
});

test('las herramientas Docker preparan conexiones de propietario, pruebas y demo', () => {
  const env = dockerEnvironment({ POSTGRES_API_PASSWORD: 'api-secreto', POSTGRES_OWNER_PASSWORD: 'owner-secreto',
    POSTGRES_ADMIN_PASSWORD: 'admin-secreto' });
  assert.equal(new URL(env.MIGRATION_DATABASE_URL).username, 'prestamos_owner');
  assert.equal(new URL(env.ADMIN_DATABASE_URL).pathname, '/postgres');
  assert.equal(new URL(env.DEMO_DATABASE_URL).pathname, '/prestamos_demo');
  assert.equal(new URL(env.TEST_DATABASE_URL).pathname, '/prestamos_test');
  assert.throws(() => dockerEnvironment({ POSTGRES_API_PASSWORD: 'reemplazar_api' }), /propias/);
  assert.throws(() => dockerEnvironment({ POSTGRES_API_PASSWORD: 'secreto', DOCKER_DB_NAME: '../postgres' }), /inválido/);
});

const demoSource = {
  DEMO_MODE: 'true', NODE_ENV: 'development',
  MIGRATION_DATABASE_URL: 'postgresql://owner:clave@localhost/prestamos_demo',
  DATABASE_URL: 'postgresql://api:clave@localhost/prestamos_demo',
  DEMO_ADMIN_PASSWORD: 'Administrador ficticio 2026', DEMO_USER_PASSWORD: 'Solicitante ficticio 2026',
};
test('el seed exige consentimiento, aislamiento y contraseñas válidas sin revelar secretos', () => {
  assert.equal(readDemoConfiguration(demoSource).adminPassword, demoSource.DEMO_ADMIN_PASSWORD);
  for (const change of [
    { DEMO_MODE: 'false' }, { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://api:clave@localhost/prestamos' },
    { DATABASE_URL: 'postgresql://owner:clave@localhost/prestamos_demo' },
    { MIGRATION_DATABASE_URL: 'https://owner:clave@localhost/prestamos_demo' },
    { DEMO_ADMIN_PASSWORD: '' }, { DEMO_USER_PASSWORD: 'reemplazar_demo_usuario' },
    { DEMO_USER_PASSWORD: demoSource.DEMO_ADMIN_PASSWORD },
  ]) {
    assert.throws(() => readDemoConfiguration({ ...demoSource, ...change }), (error) => {
      assert.equal(error.message.includes('clave@'), false);
      assert.equal(error.message.includes(demoSource.DEMO_ADMIN_PASSWORD), false);
      return true;
    });
  }
});

test('el generador Docker crea secretos distintos y no sobrescribe una configuración existente', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'prestamos-docker-config-'));
  try {
    await mkdir(join(directory, 'backend', 'scripts'), { recursive: true });
    const script = join(directory, 'backend', 'scripts', 'docker-config.mjs');
    await copyFile(new URL('../../scripts/docker-config.js', import.meta.url), script);
    const first = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const content = await readFile(join(directory, '.env.docker'), 'utf8');
    const secrets = content.split('\n').filter((line) => /^[A-Z_]*PASSWORD=/.test(line)).map((line) => line.split('=')[1]);
    assert.equal(secrets.length, 5);
    assert.equal(new Set(secrets).size, 5);
    for (const value of secrets) {
      assert.match(value, /^[0-9a-f]{48}$/);
      assert.equal(first.stdout.includes(value), false);
    }
    assert.equal(spawnSync(process.execPath, [script], { encoding: 'utf8' }).status, 0);
    assert.equal(await readFile(join(directory, '.env.docker'), 'utf8'), content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
