import test from 'node:test';
import assert from 'node:assert/strict';
import { readEnv } from '../../src/config/env.js';
test('MySQL tiene nombre predeterminado y valida credenciales sin exponerlas', () => {
  const e = readEnv({ DB_PASSWORD: 'contraseña de prueba' });
  assert.equal(e.DB_NAME, 'DBsistema_prestamos');
  assert.equal(e.DB_PORT, 3306);
  assert.throws(
    () => readEnv({ DB_PASSWORD: 'secreto' }),
    (e) => !e.message.includes('secreto'),
  );
  assert.throws(
    () => readEnv({ DB_PASSWORD: 'contraseña de prueba', DB_NAME: 'mysql' }),
    /DB_NAME/,
  );
  assert.throws(
    () => readEnv({ DB_PASSWORD: 'contraseña de prueba', NODE_ENV: 'production' }),
    /HTTPS/,
  );
});
