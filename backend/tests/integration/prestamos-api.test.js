import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/core/seguridad.js';
import { withTransaction } from '../../src/db/transaction.js';
import { testPool, fixture } from '../helpers/database.js';

const pool = testPool();
const password = 'Clave exclusiva de pruebas de préstamos';
const policies = [];
let server, base, data, other, third, admin, secondAdmin, borrower, otherBorrower, general, specific, firstLoan;

async function request(path, { method = 'GET', body, auth = admin, csrf = true } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, { method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: auth.cookie } : {}), ...(auth && csrf ? { 'X-CSRF-Token': auth.csrf } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json(), response };
}
async function login(userId) {
  const username = (await pool.query('SELECT nombre_usuario FROM prestamos.usuarios WHERE id = $1', [userId])).rows[0].nombre_usuario;
  const result = await request('/auth/login', { method: 'POST', auth: null, body: { nombre_usuario: username, password } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { cookie: result.response.headers.getSetCookie()[0].split(';')[0], csrf: result.body.csrf_token };
}
const deadline = (ms = 3600000) => new Date(Date.now() + ms).toISOString();
const delivery = (overrides = {}) => ({ solicitante_id: data.userId, unidad_id: data.unitId,
  vencimiento: deadline(), modalidad: 'retiro', condicion_entrega: 'Apto', accesorios_entrega: ['Cable', 'Cable'], confirmar: true, ...overrides });
const receipt = (overrides = {}) => ({ condicion_devolucion: 'Inspeccionado y apto', accesorios_devolucion: ['Cable', 'Cable'],
  apta: true, estado_unidad: 'disponible', confirmar: true, ...overrides });

async function newPolicy(overrides = {}) {
  const input = { rol: null, nombre: `Prueba HTTP prestamos ${randomUUID()}`, vigencia_inicio: new Date().toISOString(),
    vigencia_fin: deadline(60000), cupo_total: 2, duracion_cantidad: 2, duracion_unidad: 'horas',
    modalidades: ['retiro', 'en_sitio'], tolerancia_horas: 2, ...overrides };
  const result = await request('/politicas', { method: 'POST', body: input });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  policies.push(result.body.id);
  return result.body;
}
async function approve(policy, auth = admin, extra = {}) {
  return request(`/politicas/${policy.id}/aprobar`, { method: 'POST', auth,
    body: { confirmar: true, referencia_aprobacion: 'EXCLUSIVO: autorización ficticia de pruebas automáticas', ...extra } });
}

before(async () => {
  const hash = await hashPassword(password);
  [data, other, third] = await withTransaction(pool, async (client) => {
    const fixtures = [await fixture(client, { historical: true }),
      await fixture(client, { historical: true, rol: 'estudiante' }), await fixture(client, { historical: true })];
    for (const value of fixtures) {
      await client.query('UPDATE prestamos.usuarios SET password_hash = $3 WHERE id IN ($1::bigint, $2::bigint)', [value.userId, value.adminId, hash]);
    }
    await client.query("UPDATE prestamos.unidades_inventario SET accesorios = '[\"Cable\",\"Cable\"]'::jsonb WHERE id IN ($1, $2)", [fixtures[0].unitId, fixtures[0].secondUnitId]);
    return fixtures;
  });
  server = createApp(pool, { loginLimit: 1000 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login(data.adminId);
  secondAdmin = await login(other.adminId);
  borrower = await login(data.userId);
  otherBorrower = await login(other.userId);
});
after(async () => {
  try {
    // Solo versiones identificadas creadas por esta prueba en la base _test.
    // Conservar historial, pero cerrar sus intervalos para futuras ejecuciones.
    let waitUntil = Date.now();
    for (const id of policies) {
      const policy = (await request(`/politicas/${id}`)).body;
      if (!policy.aprobada_en || (policy.vigencia_fin && new Date(policy.vigencia_fin) <= new Date())) continue;
      const end = new Date(Math.max(Date.now() + 150, new Date(policy.vigencia_inicio).getTime() + 150));
      if (!policy.vigencia_fin || end < new Date(policy.vigencia_fin)) {
        const result = await request(`/politicas/${id}/vigencia`, { method: 'PATCH', body: {
          vigencia_fin: end.toISOString(), confirmar: true, motivo: 'Final de prueba automática; no borrar historial',
        } });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        waitUntil = Math.max(waitUntil, end.getTime());
      }
    }
    await delay(Math.max(0, waitUntil - Date.now()) + 50);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

test('políticas y entregas exigen administrador, sesión y CSRF', async () => {
  assert.equal((await request('/politicas', { auth: null })).status, 401);
  assert.equal((await request('/politicas', { auth: borrower })).status, 403);
  assert.equal((await request('/prestamos', { method: 'POST', auth: borrower, body: delivery() })).status, 403);
  assert.equal((await request('/prestamos', { method: 'POST', csrf: false, body: delivery() })).status, 403);
  assert.equal((await request('/prestamos', { method: 'POST', body: { ...delivery(), autorizado_por: other.adminId } })).status, 400);
});

test('no entrega sin política aprobada; borrador y aprobación conservan valores y referencia', async () => {
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery() })).status, 409);
  general = await newPolicy();
  assert.equal(general.estado, 'borrador');
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery() })).status, 409);
  const changed = await request(`/politicas/${general.id}`, { method: 'PATCH', body: { nombre: general.nombre } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.tolerancia_horas, 2);
  assert.equal((await request(`/politicas/${general.id}/aprobar`, { method: 'POST', body: { confirmar: true } })).status, 400);
  const approved = await approve(general);
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.estado, 'vigente');
  const audit = await request(`/auditoria?entidad=politicas_prestamo&entidad_id=${general.id}&accion=politica.aprobada`);
  assert.equal(audit.status, 200);
  assert.equal(audit.body.total, 1);
  assert.match(audit.body.datos[0].detalle.referencia_aprobacion, /EXCLUSIVO/);
});

test('política por rol tiene prioridad; versiones aprobadas y solapamientos están protegidos', async () => {
  specific = await newPolicy({ rol: 'docente', cupo_total: 1, duracion_cantidad: 1, modalidades: ['retiro'], tolerancia_horas: 1 });
  const approved = await approve(specific, secondAdmin);
  assert.equal(approved.status, 200);
  assert.equal((await request(`/politicas/${specific.id}`, { method: 'PATCH', body: { cupo_total: 10 } })).status, 409);
  const conflict = await newPolicy({ rol: 'docente', cupo_total: 3 });
  assert.equal((await approve(conflict)).status, 409);
  assert.equal((await request(`/politicas/${conflict.id}`)).body.estado, 'borrador');
  assert.equal((await request('/politicas', { method: 'POST', body: { rol: null, nombre: 'No soportada', vigencia_inicio: new Date().toISOString(),
    cupo_total: 1, duracion_cantidad: 1, duracion_unidad: 'horas', modalidades: ['retiro'], garantia_exigida: true } })).status, 400);
});

test('entrega valida plazo, modalidad, componentes y guarda condiciones efectivas del rol', async () => {
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery({ vencimiento: deadline(-1000) }) })).status, 400);
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery({ vencimiento: deadline(7200000) }) })).status, 400);
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery({ modalidad: 'en_sitio' }) })).status, 409);
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery({ accesorios_entrega: ['Cable'] }) })).status, 400);
  const result = await request('/prestamos', { method: 'POST', body: delivery() });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  firstLoan = result.body;
  assert.equal(firstLoan.autorizado_por, data.adminId);
  assert.equal(firstLoan.politica_condiciones_id, specific.id);
  assert.equal(firstLoan.cupo_aplicado, 1);
  assert.equal(firstLoan.duracion_max_horas, 1);
  assert.equal(firstLoan.tolerancia_horas, 1);
  assert.equal(firstLoan.estado, 'activo');
  assert.equal(firstLoan.unidad_estado, 'prestada');
});

test('historial personal no revela préstamos de otras personas ni acepta identidad ajena', async () => {
  const own = await request('/prestamos/mios', { auth: borrower });
  assert.equal(own.status, 200);
  assert.ok(own.body.datos.every((loan) => loan.solicitante_id === data.userId));
  assert.equal(own.body.datos.some((loan) => loan.id === firstLoan.id), true);
  assert.equal((await request(`/prestamos/${firstLoan.id}`, { auth: otherBorrower })).status, 404);
  assert.equal((await request('/prestamos/mios?solicitante_id=1', { auth: borrower })).status, 400);
  assert.equal((await request('/prestamos', { auth: borrower })).status, 403);
  assert.equal((await request('/auditoria', { auth: borrower })).status, 403);
});

test('unidad prestada y cupo bloquean nuevas entregas sin dejar operaciones parciales', async () => {
  const sameUnit = await request('/prestamos', { method: 'POST', body: delivery({ solicitante_id: other.userId }) });
  assert.equal(sameUnit.status, 409);
  const overQuota = await request('/prestamos', { method: 'POST', body: delivery({ unidad_id: data.secondUnitId }) });
  assert.equal(overQuota.status, 409);
  assert.match(overQuota.body.error, /cupo/);
  assert.equal((await pool.query('SELECT estado FROM prestamos.unidades_inventario WHERE id = $1', [data.secondUnitId])).rows[0].estado, 'disponible');
});

test('inspección con daño o faltantes exige mantenimiento; devolver es idempotente', async () => {
  assert.equal((await request(`/prestamos/${firstLoan.id}/devolucion`, { method: 'POST', body: receipt({ accesorios_devolucion: ['Cable'] }) })).status, 400);
  assert.equal((await request(`/prestamos/${firstLoan.id}/devolucion`, { method: 'POST', body: receipt({ apta: false }) })).status, 400);
  const input = receipt({ apta: false, estado_unidad: 'mantenimiento', condicion_devolucion: 'Falta un cable', accesorios_devolucion: ['Cable'] });
  const result = await request(`/prestamos/${firstLoan.id}/devolucion`, { method: 'POST', body: input });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.estado, 'devuelto');
  assert.equal(result.body.destino_devolucion, 'mantenimiento');
  assert.equal(result.body.devolucion_apta, false);
  assert.equal(result.body.devolucion_repetida, false);
  const repeated = await request(`/prestamos/${firstLoan.id}/devolucion`, { method: 'POST', body: input });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.devolucion_en, result.body.devolucion_en);
  assert.equal(repeated.body.devolucion_repetida, true);
  assert.equal((await request(`/prestamos/${firstLoan.id}/devolucion`, { method: 'POST', body: receipt() })).status, 409);
  const audit = await request(`/auditoria?entidad=prestamos&entidad_id=${firstLoan.id}&accion=prestamo.devuelto`);
  assert.equal(audit.body.total, 1);
  assert.deepEqual(audit.body.datos[0].detalle.accesorios_faltantes, ['Cable']);
});

test('dos administradores con solicitantes diferentes compiten por una unidad sin doble entrega', async () => {
  const results = await Promise.all([
    request('/prestamos', { method: 'POST', body: delivery({ unidad_id: data.secondUnitId }) }),
    request('/prestamos', { method: 'POST', auth: secondAdmin, body: delivery({ unidad_id: data.secondUnitId, solicitante_id: other.userId }) }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const winner = results.find((result) => result.status === 201).body;
  if (winner.solicitante_id === other.userId) assert.equal(winner.politica_condiciones_id, general.id);
  const returns = await Promise.all([
    request(`/prestamos/${winner.id}/devolucion`, { method: 'POST', body: receipt() }),
    request(`/prestamos/${winner.id}/devolucion`, { method: 'POST', auth: secondAdmin, body: receipt() }),
  ]);
  assert.ok(returns.every((result) => result.status === 200));
  assert.deepEqual(returns.map((result) => result.body.devolucion_repetida).sort(), [false, true]);
  const audit = await request(`/auditoria?entidad=prestamos&entidad_id=${winner.id}&accion=prestamo.devuelto`);
  assert.equal(audit.body.total, 1);
});

test('entregas concurrentes de unidades distintas respetan cupo total por usuario', async () => {
  const unit = await request('/inventario/unidades', { method: 'POST', body: { bien_id: data.bienId,
    codigo_inventario: randomUUID(), ubicacion: 'Escuela', condicion_fisica: 'Apto', accesorios: ['Cable', 'Cable'] } });
  assert.equal(unit.status, 201);
  const results = await Promise.all([
    request('/prestamos', { method: 'POST', body: delivery({ unidad_id: data.secondUnitId }) }),
    request('/prestamos', { method: 'POST', auth: secondAdmin, body: delivery({ unidad_id: unit.body.id }) }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const winner = results.find((result) => result.status === 201).body;
  assert.equal((await request(`/prestamos/${winner.id}/devolucion`, { method: 'POST', body: receipt() })).status, 200);
});

test('uso en sitio inicia responsabilidad sin cambiar ubicación y aplica política general al estudiante', async () => {
  const original = (await pool.query('SELECT ubicacion FROM prestamos.unidades_inventario WHERE id = $1', [other.unitId])).rows[0].ubicacion;
  const result = await request('/prestamos', { method: 'POST', body: delivery({ unidad_id: other.unitId,
    solicitante_id: other.userId, modalidad: 'en_sitio', accesorios_entrega: [] }) });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.politica_condiciones_id, general.id);
  assert.equal((await pool.query('SELECT ubicacion FROM prestamos.unidades_inventario WHERE id = $1', [other.unitId])).rows[0].ubicacion, original);
  assert.equal((await request(`/prestamos/${result.body.id}/devolucion`, { method: 'POST', body: receipt({ accesorios_devolucion: [] }) })).status, 200);
});

test('vencimiento se deriva del reloj y una cuenta desactivada aún admite devolución administrativa', async () => {
  // Entrega HTTP con plazo corto; no cambiar vencimientos históricos por SQL.
  const result = await request('/prestamos', { method: 'POST', body: delivery({ unidad_id: data.secondUnitId, vencimiento: deadline(2000) }) });
  assert.equal(result.status, 201);
  await delay(Math.max(0, new Date(result.body.vencimiento).getTime() - Date.now()) + 50);
  const expired = await request(`/prestamos/${result.body.id}`, { auth: borrower });
  assert.equal(expired.body.estado, 'vencido');
  assert.equal((await request('/prestamos', { method: 'POST', body: delivery() })).status, 409);
  assert.equal((await request(`/personas/${data.personId}/estado`, { method: 'PATCH', body: { activo: false } })).status, 200);
  assert.equal((await request('/prestamos/mios', { auth: borrower })).status, 401);
  const closed = await request(`/prestamos/${result.body.id}/devolucion`, { method: 'POST', body: receipt() });
  assert.equal(closed.status, 200, JSON.stringify(closed.body));
  assert.equal(closed.body.estado, 'devuelto');
  assert.ok(Number(closed.body.retraso_segundos) > 0);
  assert.equal(Number(closed.body.exceso_tolerancia_segundos), 0);
  assert.equal(Number(closed.body.tarifa_diaria), 0);
  await request(`/personas/${data.personId}/estado`, { method: 'PATCH', body: { activo: true } });
  await request(`/personas/${data.personId}/cuenta`, { method: 'PATCH', body: { activo: true } });
  borrower = await login(data.userId);
});

test('devolución con retiro autorizado registra baja terminal sin inventar una pérdida', async () => {
  const result = await request('/prestamos', { method: 'POST', body: delivery({ unidad_id: data.secondUnitId }) });
  assert.equal(result.status, 201);
  const closed = await request(`/prestamos/${result.body.id}/devolucion`, { method: 'POST', body: receipt({
    apta: false, estado_unidad: 'baja', motivo_baja: 'Retiro autorizado exclusivamente de prueba', condicion_devolucion: 'Daño irreversible' }) });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.estado, 'devuelto');
  assert.ok(closed.body.devolucion_en);
  const unit = await request(`/inventario/unidades/${data.secondUnitId}`);
  assert.equal(unit.body.estado, 'baja');
  assert.ok(unit.body.baja_en);
});

test('auditoría consultable solo por administradores, sin modificaciones ni secretos', async () => {
  const result = await request('/auditoria?entidad=prestamos&limite=1');
  assert.equal(result.status, 200);
  assert.equal(result.body.datos.length, 1);
  const event = result.body.datos[0];
  assert.equal((await request(`/auditoria/${event.id}`)).status, 200);
  assert.equal((await request(`/auditoria/${event.id}`, { method: 'PATCH', body: { accion: 'alterada' } })).status, 404);
  const users = await request('/auditoria?entidad=usuarios&limite=100');
  assert.equal(JSON.stringify(users.body).includes('password_hash'), false);
  assert.equal(JSON.stringify(users.body).includes(password), false);
});

test('reemplazo aprobado es atómico y conserva condiciones de préstamos previos aunque el aprobador anterior esté inactivo', async () => {
  const result = await request('/prestamos', { method: 'POST', body: delivery({ unidad_id: third.unitId, accesorios_entrega: [] }) });
  assert.equal(result.status, 201);
  const adminPerson = (await pool.query('SELECT persona_id FROM prestamos.usuarios WHERE id = $1', [other.adminId])).rows[0].persona_id;
  await request(`/personas/${adminPerson}/estado`, { method: 'PATCH', body: { activo: false } });
  const next = await newPolicy({ rol: 'docente', cupo_total: 3, duracion_cantidad: 2,
    vigencia_inicio: deadline(5000), vigencia_fin: deadline(60000) });
  const replaced = await approve(next, admin, { sustituye_id: specific.id });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.equal(replaced.body.estado, 'programada');
  const old = await request(`/politicas/${specific.id}`);
  assert.equal(old.body.vigencia_fin, next.vigencia_inicio);
  const unchanged = await request(`/prestamos/${result.body.id}`);
  assert.equal(unchanged.body.cupo_aplicado, 1);
  assert.equal(unchanged.body.duracion_max_horas, 1);
  assert.equal(unchanged.body.politica_condiciones_id, specific.id);
  assert.equal((await request(`/prestamos/${result.body.id}/devolucion`, { method: 'POST', body: receipt({ accesorios_devolucion: [] }) })).status, 200);
});

test('error al aprobar sustitución revierte también la modificación de la versión previa', async () => {
  const shortened = await request(`/politicas/${general.id}/vigencia`, { method: 'PATCH', body: {
    vigencia_fin: deadline(6000), confirmar: true, motivo: 'Preparar ventana ficticia de prueba de rollback',
  } });
  assert.equal(shortened.status, 200);
  const blocker = await newPolicy({ rol: null, vigencia_inicio: deadline(8000), vigencia_fin: deadline(12000) });
  assert.equal((await approve(blocker)).status, 200);
  const candidate = await newPolicy({ rol: null, vigencia_inicio: deadline(3000), vigencia_fin: deadline(15000) });
  const before = (await request(`/politicas/${general.id}`)).body.vigencia_fin;
  const failed = await approve(candidate, admin, { sustituye_id: general.id });
  assert.equal(failed.status, 409);
  assert.equal((await request(`/politicas/${general.id}`)).body.vigencia_fin, before);
  assert.equal((await request(`/politicas/${candidate.id}`)).body.estado, 'borrador');
});
