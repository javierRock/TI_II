import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app.js';
import { hashPassword, tokenHash, sessionToken } from '../../src/core/seguridad.js';
import { withTransaction } from '../../src/db/transaction.js';
import { testPool, fixture, lend } from '../helpers/database.js';

const password = 'Clave exclusiva para pruebas 2026';
const pool = testPool();
let server, base, data, admin, borrower, plan, studentPerson, studentAccount;

async function request(path, { method = 'GET', body, auth, csrf = true, headers = {} } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Cookie: auth.cookie } : {}),
      ...(auth && csrf ? { 'X-CSRF-Token': auth.csrf } : {}), ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const payload = response.status === 204 ? null : await response.json();
  return { status: response.status, body: payload, response };
}
async function login(username, options = {}) {
  const result = await request('/auth/login', { method: 'POST', body: { nombre_usuario: username, password }, ...options });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return { cookie: result.response.headers.getSetCookie()[0].split(';')[0], csrf: result.body.csrf_token, result };
}
const personInput = () => ({ documento: randomUUID().slice(0, 32), nombre_completo: 'Persona de prueba', correo: 'persona@example.test' });

before(async () => {
  const hash = await hashPassword(password);
  data = await withTransaction(pool, async (client) => {
    const value = await fixture(client, { historical: true });
    await client.query('UPDATE prestamos.usuarios SET password_hash = $2 WHERE id IN ($1::bigint, $3::bigint)', [value.adminId, hash, value.userId]);
    const users = await client.query('SELECT id, nombre_usuario FROM prestamos.usuarios WHERE id IN ($1, $2)', [value.adminId, value.userId]);
    return { ...value, adminUsername: users.rows.find((row) => row.id === value.adminId).nombre_usuario,
      borrowerUsername: users.rows.find((row) => row.id === value.userId).nombre_usuario };
  });
  server = createApp(pool, { loginLimit: 1000 }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  admin = await login(data.adminUsername);
  borrower = await login(data.borrowerUsername);
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('login usa cookie HttpOnly y solo almacena el hash del token', async () => {
  const cookies = admin.result.response.headers.getSetCookie()[0];
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /SameSite=Lax/);
  assert.match(cookies, /Path=\/api\/v1/);
  const token = admin.cookie.split('=')[1];
  assert.equal(admin.result.body.usuario.id, data.adminId);
  assert.equal(JSON.stringify(admin.result.body).includes(token), false);
  assert.equal(JSON.stringify(admin.result.body).includes('password_hash'), false);
  const session = await pool.query('SELECT token_hash FROM prestamos.sesiones WHERE usuario_id = $1 AND revocada_en IS NULL', [data.adminId]);
  assert.ok(session.rows.some((row) => row.token_hash === tokenHash(token)));
});

test('credenciales erróneas y usuario inexistente devuelven el mismo error sin secretos', async () => {
  const wrong = await request('/auth/login', { method: 'POST', body: { nombre_usuario: data.adminUsername, password: 'incorrecta' } });
  const missing = await request('/auth/login', { method: 'POST', body: { nombre_usuario: randomUUID(), password: 'incorrecta' } });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(wrong.body, missing.body);
  const events = await pool.query("SELECT detalle FROM prestamos.eventos_historial WHERE accion = 'login' AND entidad_id = $1", [data.adminId]);
  assert.equal(JSON.stringify(events.rows).includes('incorrecta'), false);
  assert.equal(JSON.stringify(events.rows).includes(password), false);
});

test('rutas privadas exigen sesión y atribución administrativa, no solo rol base', async () => {
  assert.equal((await request('/personas')).status, 401);
  assert.equal((await request('/catalogo/bienes')).status, 401);
  assert.equal((await request('/personas', { auth: borrower })).status, 403);
  assert.equal((await request(`/inventario/unidades/${data.unitId}`, { auth: borrower })).status, 403);
  assert.equal((await request('/personas', { method: 'POST', auth: borrower, body: personInput() })).status, 403);
  const me = await request('/auth/me?id=otro_usuario', { auth: borrower });
  assert.equal(me.status, 200);
  assert.equal(me.body.usuario.id, data.userId);
});

test('escrituras exigen CSRF y rechazan orígenes ajenos', async () => {
  const input = personInput();
  assert.equal((await request('/personas', { method: 'POST', auth: admin, csrf: false, body: input })).status, 403);
  assert.equal((await request('/personas', { method: 'POST', auth: admin, body: input, headers: { Origin: 'https://otro.example' } })).status, 403);
  assert.equal((await request('/auth/login', { method: 'POST', body: { nombre_usuario: data.adminUsername, password }, headers: { Origin: 'https://otro.example' } })).status, 403);
});

test('registro y edición de personas conservan documento y no permiten campos desconocidos', async () => {
  const input = personInput();
  const created = await request('/personas', { method: 'POST', auth: admin, body: input });
  assert.equal(created.status, 201);
  const duplicate = await request('/personas', { method: 'POST', auth: admin, body: { ...input, documento: input.documento.toUpperCase() } });
  assert.equal(duplicate.status, 409);
  assert.equal((await request(`/personas/${created.body.id}`, { method: 'PATCH', auth: admin, body: { documento: 'otro' } })).status, 400);
  const updated = await request(`/personas/${created.body.id}`, { method: 'PATCH', auth: admin, body: { nombre_completo: 'Nombre corregido' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.nombre_completo, 'Nombre corregido');
  const audit = await pool.query("SELECT actor_usuario_id FROM prestamos.eventos_historial WHERE entidad = 'personas' AND entidad_id = $1 ORDER BY id DESC", [created.body.id]);
  assert.ok(audit.rows.every((row) => row.actor_usuario_id === data.adminId));
});

test('planes y cuentas estudiante se registran atómicamente con semestre válido', async () => {
  const result = await request('/planes-estudio', { method: 'POST', auth: admin, body: {
    codigo: randomUUID(), programa: 'Programa de prueba', nombre: 'Plan aprobado de prueba', semestres: [1, 15],
  } });
  assert.equal(result.status, 201);
  plan = result.body;
  const person = await request('/personas', { method: 'POST', auth: admin, body: personInput() });
  studentPerson = person.body;
  const input = { nombre_usuario: `est-${randomUUID()}`, password, rol: 'estudiante',
    perfil: { tipo: 'estudiante', codigo: randomUUID(), habilitado: true, plan_id: plan.id, semestre: 16 } };
  assert.equal((await request(`/personas/${studentPerson.id}/cuenta`, { method: 'POST', auth: admin, body: input })).status, 400);
  assert.equal((await pool.query('SELECT id FROM prestamos.usuarios WHERE persona_id = $1', [studentPerson.id])).rowCount, 0);
  input.perfil.semestre = 15;
  const created = await request(`/personas/${studentPerson.id}/cuenta`, { method: 'POST', auth: admin, body: input });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.perfiles[0].semestre, 15);
  assert.equal(JSON.stringify(created.body).includes('password_hash'), false);
  assert.equal(created.body.atribucion_admin, false);
  studentAccount = created.body;
  const malicious = { ...input, nombre_usuario: randomUUID(), atribucion_admin: true };
  assert.equal((await request(`/personas/${studentPerson.id}/cuenta`, { method: 'POST', auth: admin, body: malicious })).status, 400);
});

test('una cuenta administrativa nueva no obtiene atribuciones por su rol base', async () => {
  const person = await request('/personas', { method: 'POST', auth: admin, body: personInput() });
  const username = `personal-${randomUUID()}`;
  const account = await request(`/personas/${person.body.id}/cuenta`, { method: 'POST', auth: admin,
    body: { nombre_usuario: username, password, rol: 'personal_administrativo' } });
  assert.equal(account.status, 201);
  assert.equal(account.body.atribucion_admin, false);
  const session = await login(username);
  assert.equal((await request('/personas', { auth: session })).status, 403);
  assert.equal((await request('/catalogo/bienes', { auth: session })).status, 200);
});

test('estudiante consulta catálogo, no personas ni datos privados de inventario', async () => {
  const student = await login(studentAccount.nombre_usuario);
  assert.equal((await request('/personas', { auth: student })).status, 403);
  const catalog = await request('/catalogo/unidades?limite=100', { auth: student });
  assert.equal(catalog.status, 200);
  for (const row of catalog.body.datos) {
    assert.equal('solicitante_id' in row, false);
    assert.equal('observaciones' in row, false);
    assert.equal('documento' in row, false);
  }
  const privileged = await request('/inventario/bienes', { method: 'POST', auth: student, body: { tipo_id: data.typeId, nombre: 'No autorizado' } });
  assert.equal(privileged.status, 403);
});

test('catálogo pagina, valida filtros y no simula disponibilidad futura', async () => {
  const result = await request('/catalogo/bienes?pagina=1&limite=1', { auth: borrower });
  assert.equal(result.status, 200);
  assert.equal(result.body.datos.length, 1);
  assert.equal(result.body.limite, 1);
  assert.equal((await request('/catalogo/bienes?limite=101', { auth: borrower })).status, 400);
  assert.equal((await request('/catalogo/unidades?inicio=2030-01-01', { auth: borrower })).status, 400);
  assert.equal((await request('/catalogo/bienes?tipo=computadora', { auth: borrower })).status, 400);
  assert.equal((await request('/catalogo/bienes?q=%25', { auth: borrower })).body.total, 0);
  assert.equal((await request("/catalogo/bienes?q=%27%20OR%201%3D1--", { auth: borrower })).body.total, 0);
  assert.equal((await request('/catalogo/bienes/abc', { auth: borrower })).status, 400);
});

test('inventario controla categoría, identidad técnica, baja y confirmación explícita', async () => {
  const bookType = (await pool.query("SELECT id FROM prestamos.tipos_bien WHERE codigo = 'libro'")).rows[0].id;
  assert.equal((await request('/inventario/bienes', { method: 'POST', auth: admin, body: { tipo_id: bookType, nombre: 'Libro', marca: 'Incompatible' } })).status, 400);
  const good = await request('/inventario/bienes', { method: 'POST', auth: admin, body: {
    tipo_id: data.typeId, nombre: 'Visor autorizado de prueba', marca: 'Marca API', modelo: randomUUID(),
  } });
  assert.equal(good.status, 201);
  const input = { bien_id: good.body.id, codigo_inventario: randomUUID(), ubicacion: 'Escuela', condicion_fisica: 'Apto', serie: randomUUID(), accesorios: ['Cable'] };
  assert.equal((await request('/inventario/unidades', { method: 'POST', auth: admin, body: { ...input, adscrito_laboratorio: true } })).status, 400);
  const unit = await request('/inventario/unidades', { method: 'POST', auth: admin, body: input });
  assert.equal(unit.status, 201, JSON.stringify(unit.body));
  assert.equal(unit.body.marca, 'Marca API');
  assert.deepEqual(unit.body.accesorios, ['Cable']);
  assert.equal((await request('/inventario/unidades', { method: 'POST', auth: admin, body: { ...input, codigo_inventario: randomUUID() } })).status, 409);
  const path = `/inventario/unidades/${unit.body.id}/estado`;
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { estado: 'prestada' } })).status, 400);
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { estado: 'mantenimiento' } })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { estado: 'disponible' } })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { estado: 'baja', motivo: 'Retiro aprobado' } })).status, 400);
  const retired = await request(path, { method: 'PATCH', auth: admin, body: { estado: 'baja', motivo: 'Retiro aprobado', confirmar: true } });
  assert.equal(retired.status, 200);
  assert.ok(retired.body.baja_en);
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { estado: 'disponible' } })).status, 409);
});

test('desactivar titular revoca accesos sin borrar su préstamo abierto', async () => {
  const loan = await withTransaction(pool, (client) => lend(client, data));
  assert.equal((await request(`/inventario/unidades/${data.unitId}/estado`, { method: 'PATCH', auth: admin, body: { estado: 'baja', motivo: 'No permitido', confirmar: true } })).status, 409);
  assert.equal((await request(`/personas/${data.personId}/estado`, { method: 'PATCH', auth: admin, body: { activo: false } })).status, 200);
  assert.equal((await request('/catalogo/bienes', { auth: borrower })).status, 401);
  const inactiveLogin = await request('/auth/login', { method: 'POST', body: { nombre_usuario: data.borrowerUsername, password } });
  assert.equal(inactiveLogin.status, 401);
  assert.equal((await pool.query('SELECT estado_cierre FROM prestamos.prestamos WHERE id = $1', [loan.id])).rows[0].estado_cierre, 'abierto');
  await request(`/personas/${data.personId}/estado`, { method: 'PATCH', auth: admin, body: { activo: true } });
  assert.equal((await request('/auth/login', { method: 'POST', body: { nombre_usuario: data.borrowerUsername, password } })).status, 401);
  assert.equal((await request(`/personas/${data.personId}/cuenta`, { method: 'PATCH', auth: admin, body: { activo: true } })).status, 200);
  borrower = await login(data.borrowerUsername);
});

test('cambiar rol exige perfil y revoca la sesión anterior sin eliminar antecedentes', async () => {
  const path = `/personas/${data.personId}/cuenta`;
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { rol: 'estudiante' } })).status, 409);
  const profile = { tipo: 'estudiante', codigo: randomUUID(), habilitado: true, plan_id: plan.id, semestre: 15 };
  assert.equal((await request(`/personas/${data.personId}/perfil`, { method: 'PUT', auth: admin, body: profile })).status, 200);
  assert.equal((await request(path, { method: 'PATCH', auth: admin, body: { rol: 'estudiante' } })).status, 200);
  assert.equal((await request('/auth/me', { auth: borrower })).status, 401);
  const detail = await request(`/personas/${data.personId}`, { auth: admin });
  assert.equal(detail.body.cuenta.perfiles.length, 2);
  assert.equal(detail.body.cuenta.rol, 'estudiante');
  assert.equal(JSON.stringify(detail.body).includes('password_hash'), false);
});

test('logout y rotación de sesión invalidan inmediatamente las cookies antiguas', async () => {
  const first = await login(data.adminUsername);
  const second = await login(data.adminUsername, { auth: first });
  assert.equal((await request('/auth/me', { auth: first })).status, 401);
  assert.equal((await request('/auth/logout', { method: 'POST', auth: second, csrf: false, body: {} })).status, 403);
  assert.equal((await request('/auth/logout', { method: 'POST', auth: second, body: {} })).status, 204);
  assert.equal((await request('/auth/me', { auth: second })).status, 401);
});

test('una sesión expirada se rechaza sin tareas programadas', async () => {
  const token = sessionToken();
  await pool.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, creado_en, expira_en)
    VALUES ($1, $2, clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 minute')`, [data.adminId, tokenHash(token)]);
  assert.equal((await request('/auth/me', { auth: { cookie: `prestamos_session=${token}` }, csrf: false })).status, 401);
});

test('límite de login responde 429 sin revelar cuentas', async () => {
  const limited = createApp(pool, { loginLimit: 2 }).listen(0, '127.0.0.1');
  await once(limited, 'listening');
  try {
    const url = `http://127.0.0.1:${limited.address().port}/api/v1/auth/login`;
    const statuses = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_usuario: randomUUID(), password: 'incorrecta' }) });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses, [401, 401, 429]);
  } finally {
    await new Promise((resolve) => limited.close(resolve));
  }
});
