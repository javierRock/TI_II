import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfToken, sessionToken, tokenHash, sameToken, validToken, hashPassword, verifyPassword } from '../../src/core/seguridad.js';
import { id } from '../../src/shared/schemas.js';
import { accountSchema } from '../../src/modules/personas/personas.schemas.js';

test('tokens aleatorios, hashes y CSRF vinculado a la sesión', () => {
  const a = sessionToken();
  const b = sessionToken();
  assert.ok(validToken(a));
  assert.equal(validToken('invalido'), false);
  assert.notEqual(a, b);
  assert.match(tokenHash(a), /^[a-f0-9]{64}$/);
  assert.notEqual(csrfToken(a), tokenHash(a));
  assert.ok(sameToken(csrfToken(a), csrfToken(a)));
  assert.equal(sameToken(csrfToken(a), csrfToken(b)), false);
  assert.equal(sameToken('a', 'bb'), false);
});

test('Argon2id verifica claves y rechaza claves incorrectas', async () => {
  const hash = await hashPassword('Clave de prueba segura 2026');
  assert.ok(hash.startsWith('$argon2id$'));
  assert.equal(await verifyPassword(hash, 'Clave de prueba segura 2026'), true);
  assert.equal(await verifyPassword(hash, 'clave equivocada'), false);
  assert.equal(await verifyPassword('hash corrupto', 'cualquier clave'), false);
});

test('validación de identificadores no pierde precisión ni lanza errores con texto inválido', () => {
  assert.ok(id.safeParse('9223372036854775807').success);
  for (const value of ['0', '-1', 'abc', '9223372036854775808', 1]) assert.equal(id.safeParse(value).success, false);
});

test('crear cuenta no permite asignar atribución administrativa ni omitir perfil', () => {
  assert.equal(accountSchema.safeParse({ nombre_usuario: 'docente', password: 'Clave de prueba segura 2026', rol: 'docente' }).success, false);
  assert.equal(accountSchema.safeParse({ nombre_usuario: 'admin', password: 'Clave de prueba segura 2026', rol: 'personal_administrativo', atribucion_admin: true }).success, false);
});
