import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../src/app.js';
import { withTransaction } from '../../src/db/transaction.js';
import { hashPassword } from '../../src/core/seguridad.js';
import { testPool, fixture } from '../helpers/database.js';

const pool = testPool();
const password = 'Clave exclusiva de prueba de reservas';
let server, base, data, other, admin, borrower, stranger;
async function request(path, { method = 'GET', auth = admin, body, csrf = true } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Cookie: auth.cookie } : {}),
      ...(auth && csrf ? { 'X-CSRF-Token': auth.csrf } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), response };
}
async function login(id) {
  const name = (await pool.query('SELECT nombre_usuario FROM prestamos.usuarios WHERE id = $1', [id])).rows[0].nombre_usuario;
  const result = await request('/auth/login', { method: 'POST', auth: null, body: { nombre_usuario: name, password } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { cookie: result.response.headers.getSetCookie()[0].split(';')[0], csrf: result.body.csrf_token };
}
const at = (offset) => new Date(Date.now() + offset).toISOString();
const input = (extra = {}) => ({ unidad_id: data.unitId, inicio: at(60000), fin: at(3600000), modalidad: 'retiro', confirmar: true, ...extra });
async function create(extra = {}) {
  const result = await request('/reservas', { method: 'POST', auth: borrower, body: input(extra) });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function decision(row, action, options = {}) {
  return request(`/reservas/${row.id}/${action}`, { method: 'POST', body: { confirmar: true,
    ...(action !== 'confirmar' ? { motivo: 'Decisión exclusiva de pruebas' } : {}) }, ...options });
}
before(async () => {
  const hash = await hashPassword(password);
  [data, other] = await withTransaction(pool, async (client) => {
    const values = [await fixture(client), await fixture(client, { historical: true, rol: 'estudiante' })];
    for (const row of values) await client.query('UPDATE prestamos.usuarios SET password_hash = $2 WHERE id IN ($1, $3)', [row.userId, hash, row.adminId]);
    return values;
  });
  server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp(pool, { appOrigin: base, loginLimit: 1000 }));
  admin = await login(data.adminId); borrower = await login(data.userId); stranger = await login(other.userId);
});
after(async () => {
  try {
    if (data) { await pool.query("UPDATE prestamos.politicas_prestamo SET vigencia_fin = clock_timestamp() + interval '100 milliseconds' WHERE id = $1", [data.policyId]); await delay(150); }
  } finally { if (server) await new Promise((resolve) => server.close(resolve)); await pool.end(); }
});

test('reservas exigen sesión, CSRF, titular real y permisos administrativos', async () => {
  assert.equal((await request('/reservas/mias', { auth: null })).status, 401);
  assert.equal((await request('/reservas', { auth: borrower })).status, 403);
  assert.equal((await request('/reservas', { method: 'POST', auth: borrower, csrf: false, body: input() })).status, 403);
  assert.equal((await request('/reservas', { method: 'POST', auth: borrower, body: input({ solicitante_id: other.userId }) })).status, 400);
  assert.equal((await request('/reservas', { method: 'POST', auth: borrower, body: input({ inicio: at(-1000) }) })).status, 400);
  const row = await create();
  assert.equal(row.solicitante_id, data.userId);
  assert.equal((await request(`/reservas/${row.id}`, { auth: stranger })).status, 404);
  assert.equal((await decision(row, 'cancelar', { auth: stranger })).status, 404);
  assert.equal((await decision(row, 'confirmar', { auth: borrower })).status, 403);
  assert.equal((await decision(row, 'rechazar')).status, 200);
  assert.equal((await decision(row, 'confirmar')).status, 409);
});
test('solo confirmar bloquea: cruces rechazados, intervalos adyacentes aceptados y cancelación libera', async () => {
  const row = await create(); const conflict = await create({ inicio: row.inicio, fin: row.fin });
  const adjacent = await create({ inicio: row.fin, fin: new Date(new Date(row.fin).getTime() + 3600000).toISOString() });
  const available = () => request(`/reservas/disponibilidad?${new URLSearchParams({ unidad_id: row.unidad_id, inicio: row.inicio, fin: row.fin })}`, { auth: borrower });
  assert.equal((await available()).body.disponible, true);
  assert.equal((await decision(row, 'confirmar')).status, 200);
  assert.equal((await decision(row, 'confirmar')).status, 200);
  assert.equal((await available()).body.disponible, false);
  assert.equal((await decision(conflict, 'confirmar')).status, 409);
  assert.equal((await decision(adjacent, 'confirmar')).status, 200);
  assert.equal((await decision(row, 'cancelar', { auth: borrower })).status, 200);
  assert.equal((await available()).body.disponible, true);
  await decision(conflict, 'cancelar', { auth: borrower }); await decision(adjacent, 'cancelar', { auth: borrower });
});
test('entrega vinculada respeta intervalo, consume reserva y conserva auditoría en una transacción', async () => {
  const row = await create({ inicio: at(200), fin: at(3600000) });
  assert.equal((await decision(row, 'confirmar')).status, 200);
  const body = { solicitante_id: data.userId, unidad_id: data.unitId, reserva_id: row.id,
    vencimiento: row.fin, modalidad: 'retiro', condicion_entrega: 'Apto', accesorios_entrega: [], confirmar: true };
  // La confirmación no permite una entrega anticipada.
  assert.equal((await request('/prestamos', { method: 'POST', body })).status, 409);
  await delay(Math.max(0, new Date(row.inicio).getTime() - Date.now()) + 20);
  const { reserva_id: ignored, ...direct } = body;
  assert.equal((await request('/prestamos', { method: 'POST', body: direct })).status, 409);
  const delivered = await request('/prestamos', { method: 'POST', body });
  assert.equal(delivered.status, 201, JSON.stringify(delivered.body));
  assert.equal(delivered.body.reserva_id, row.id);
  const current = (await request(`/reservas/${row.id}`, { auth: borrower })).body;
  assert.equal(current.estado_actual, 'atendida'); assert.equal(current.prestamo_id, delivered.body.id);
  assert.equal((await decision(row, 'cancelar')).status, 409);
  const audit = await request(`/auditoria?entidad=reservas&entidad_id=${row.id}`);
  assert.equal(audit.body.total, 3);
  assert.equal((await request(`/prestamos/${delivered.body.id}/devolucion`, { method: 'POST', body: {
    condicion_devolucion: 'Apto', accesorios_devolucion: [], apta: true, estado_unidad: 'disponible', confirmar: true,
  } })).status, 200);
});
test('rechazo de entrega por reserva incompatible no cambia inventario ni reserva', async () => {
  const row = await create({ unidad_id: data.secondUnitId });
  assert.equal((await decision(row, 'confirmar')).status, 200);
  const result = await request('/prestamos', { method: 'POST', body: { solicitante_id: data.userId, unidad_id: data.unitId,
    reserva_id: row.id, vencimiento: row.fin, modalidad: 'retiro', condicion_entrega: 'Apto', accesorios_entrega: [], confirmar: true } });
  assert.equal(result.status, 409);
  assert.equal((await request(`/reservas/${row.id}`)).body.estado_actual, 'confirmada');
  assert.equal((await pool.query('SELECT estado FROM prestamos.unidades_inventario WHERE id = $1', [data.unitId])).rows[0].estado, 'disponible');
  await decision(row, 'cancelar');
});
