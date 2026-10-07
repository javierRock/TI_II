import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readEnv } from '../../src/config/env.js';

test('valida configuración y aplica valores por defecto', () => {
  const env = readEnv({ DATABASE_URL: 'postgresql://api:secreto@localhost/prestamos' });
  assert.equal(env.PORT, 3000);
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.HOST, '127.0.0.1');
});

test('permite escuchar dentro del contenedor sin cambiar el origen del navegador', () => {
  const env = readEnv({ DATABASE_URL: 'postgresql://api:secreto@postgres/prestamos', HOST: '0.0.0.0',
    APP_ORIGIN: 'http://localhost:3000' });
  assert.equal(env.HOST, '0.0.0.0');
  assert.equal(env.APP_ORIGIN, 'http://localhost:3000');
  assert.throws(() => readEnv({ DATABASE_URL: 'postgresql://api:secreto@postgres/prestamos', HOST: '192.168.0.1' }), /HOST/);
});

test('rechaza URLs no PostgreSQL y puertos inválidos sin exponer secretos', () => {
  assert.throws(() => readEnv({ DATABASE_URL: 'https://api:secreto@localhost/prestamos', PORT: '70000' }),
    (error) => error.message.includes('DATABASE_URL') && error.message.includes('PORT') && !error.message.includes('secreto'));
});

test('producción exige un origen HTTPS explícito sin ruta', () => {
  const base = { DATABASE_URL: 'postgresql://api:secreto@localhost/prestamos', NODE_ENV: 'production' };
  assert.throws(() => readEnv(base), /HTTPS/);
  assert.throws(() => readEnv({ ...base, APP_ORIGIN: 'https://prestamos.example/ruta' }), /sin ruta/);
  assert.equal(readEnv({ ...base, APP_ORIGIN: 'https://prestamos.example' }).APP_ORIGIN, 'https://prestamos.example');
});

test('el proceso de producción no carga secretos del .env local', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import './src/config/env.js'; if (process.env.ADMIN_DATABASE_URL || process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL) process.exit(1);"], {
    cwd: new URL('../../', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'production' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('Docker puede impedir la carga del .env local también en desarrollo', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import './src/config/env.js'; if (process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL) process.exit(1);"], {
    cwd: new URL('../../', import.meta.url), env: { PATH: process.env.PATH, NODE_ENV: 'development', SKIP_DOTENV: '1' }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});
