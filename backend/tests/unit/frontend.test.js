import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { createApi, ApiError } from '../../../frontend/js/api.js';
import { lines, query, isAdmin, isoDate, errorText } from '../../../frontend/js/format.js';

test('sirve frontend y módulos con CSP, sin exponer configuración ni rutas de API inexistentes', async () => {
  const server = createApp({ query() { throw new Error('No consultar BD para archivos públicos'); } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.equal(index.headers.get('cache-control'), 'no-store');
    const csp = index.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|upgrade-insecure-requests/);
    assert.match(await index.text(), /<html lang="es">/);
    for (const path of ['/styles.css', '/js/app.js', '/js/views/loans.js']) assert.equal((await fetch(`${base}${path}`)).status, 200);
    for (const path of ['/.env', '/backend/.env', '/backend/src/config/env.js', '/db/sql/001_nucleo.sql', '/api/v1/inexistente']) {
      assert.equal((await fetch(`${base}${path}`)).status, 404);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('CSP en producción mantiene upgrade-insecure-requests', async () => {
  const server = createApp({}, { production: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`);
    assert.match(response.headers.get('content-security-policy'), /upgrade-insecure-requests/);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('cliente envía JSON, cookie same-origin y CSRF en escrituras; logout 204', async () => {
  const calls = [];
  const api = createApi({ fetcher: async (url, options) => { calls.push([url, options]); return new Response(null, { status: 204 }); } });
  api.setSession({ csrf_token: 'csrf-exclusivo-de-prueba' });
  await api.request('/catalogo/unidades');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[0][1].headers['X-CSRF-Token'], undefined);
  assert.equal(await api.request('/auth/logout', { method: 'POST', body: {} }), null);
  assert.equal(calls[1][1].headers['X-CSRF-Token'], 'csrf-exclusivo-de-prueba');
  assert.equal(calls[1][1].headers['Content-Type'], 'application/json');
  assert.equal(calls[1][1].body, '{}');
  api.setSession(null);
  await api.request('/auth/login', { method: 'POST', body: {} });
  assert.equal(calls[2][1].headers['X-CSRF-Token'], undefined);
  await assert.rejects(api.request('//ajeno.test'), /Ruta de API inválida/);
});

test('cliente distingue credenciales erróneas de expiración y conserva errores por campo', async () => {
  let expired = 0;
  const api = createApi({ onUnauthorized: () => expired++, fetcher: async () => Response.json({ error: 'Rechazado', campos: [{ campo: 'body.nombre', mensaje: 'Obligatorio' }] }, { status: 401 }) });
  await assert.rejects(api.request('/auth/login'), (error) => error instanceof ApiError && /body.nombre: Obligatorio/.test(errorText(error)));
  assert.equal(expired, 0);
  await assert.rejects(api.request('/auth/me'), /Rechazado/);
  assert.equal(expired, 1);
});

test('cliente no reintenta mutaciones automáticamente y advierte si resultado es incierto', async () => {
  let requests = 0;
  const api = createApi({ fetcher: async () => { requests++; throw new TypeError('Network'); } });
  await assert.rejects(api.request('/prestamos', { method: 'POST', body: {} }), /podría haberse guardado/);
  assert.equal(requests, 1);
});

test('helpers conservan IDs bigint, cantidad de accesorios y autorización separada', () => {
  assert.deepEqual(lines('Cable\n Cable \r\n\nControl'), ['Cable', 'Cable', 'Control']);
  assert.equal(query({ unidad_id: '9223372036854775807', disponible: false, q: '', pagina: 2 }), 'unidad_id=9223372036854775807&disponible=false&pagina=2');
  assert.equal(isAdmin({ rol: 'personal_administrativo', atribucion_admin: false }), false);
  assert.equal(isAdmin({ rol: 'estudiante', atribucion_admin: true }), false);
  assert.equal(isAdmin({ rol: 'docente', atribucion_admin: true }), true);
  assert.equal(isoDate('2026-10-06T12:00:00-05:00'), '2026-10-06T17:00:00.000Z');
  assert.throws(() => isoDate(''), /fecha y hora/);
});
