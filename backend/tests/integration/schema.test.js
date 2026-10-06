import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPool, rollback, expectSqlError, fixture, lend, returnLoan } from '../helpers/database.js';

const pool = testPool();
after(() => pool.end());

test('esquema MVP tiene 12 tablas y solo cinco tipos de bienes', async () => {
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'prestamos'");
  assert.equal(tables.rowCount, 12);
  const types = await pool.query('SELECT codigo FROM prestamos.tipos_bien ORDER BY codigo');
  assert.deepEqual(types.rows.map((row) => row.codigo), ['carrito_robotica', 'libro', 'mesa_ping_pong', 'parlante', 'visor_3d']);
});

test('códigos únicos, exclusión de laboratorios y categorías fuera de alcance', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await expectSqlError(client, () => client.query(`INSERT INTO prestamos.tipos_bien (codigo, nombre) VALUES ('computadora', 'Computadora')`), '23514');
  const code = randomUUID();
  await data.unit(code);
  await expectSqlError(client, () => data.unit(code.toUpperCase()), '23505');
  await expectSqlError(client, () => client.query('UPDATE prestamos.unidades_inventario SET adscrito_laboratorio = true WHERE id = $1', [data.unitId]), '23514');
  await expectSqlError(client, () => client.query('UPDATE prestamos.unidades_inventario SET bien_id = -1 WHERE id = $1', [data.unitId]), '23503');
}));

test('ISBN compartido y unicidad de marca-modelo-serie', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const typeId = (await client.query("SELECT id FROM prestamos.tipos_bien WHERE codigo = 'libro'")).rows[0].id;
  await client.query(`INSERT INTO prestamos.bienes (tipo_id, nombre, isbn) VALUES ($1, 'Libro A', '9780000000000'), ($1, 'Libro B', '9780000000000')`, [typeId]);
  const serie = randomUUID();
  await data.unit(randomUUID(), serie);
  await expectSqlError(client, () => data.unit(randomUUID(), serie.toUpperCase()), '23505');
}));

test('semestre académico validado contra el plan, sin límite arbitrario de 12', async () => rollback(pool, async (client) => {
  const data = await fixture(client, { rol: 'estudiante' });
  await expectSqlError(client, () => client.query('UPDATE prestamos.perfiles_academicos SET semestre = 16 WHERE usuario_id = $1', [data.userId]), '23503');
  await expectSqlError(client, () => client.query('UPDATE prestamos.usuarios SET atribucion_admin = true, atribucion_otorgada_en = CURRENT_TIMESTAMP, atribucion_otorgada_por = $2 WHERE id = $1', [data.userId, data.adminId]), '23514');
  await lend(client, data);
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
}));

test('desactivar persona desactiva cuenta y revoca sesiones', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await client.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, expira_en) VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`, [data.userId, 'a'.repeat(64)]);
  await client.query('UPDATE prestamos.personas SET activo = false WHERE id = $1', [data.personId]);
  assert.equal((await client.query('SELECT activo FROM prestamos.usuarios WHERE id = $1', [data.userId])).rows[0].activo, false);
  assert.ok((await client.query('SELECT revocada_en FROM prestamos.sesiones WHERE usuario_id = $1', [data.userId])).rows[0].revocada_en);
  await expectSqlError(client, () => client.query('UPDATE prestamos.usuarios SET activo = true WHERE id = $1', [data.userId]), '23514');
  await expectSqlError(client, () => client.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, expira_en) VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`, [data.userId, 'b'.repeat(64)]), '23514');
}));

test('préstamo conserva condiciones, tiene estado activo y exige una actualización atómica de inventario', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const loan = await lend(client, data);
  assert.equal(loan.politica_condiciones_id, data.policyId);
  assert.equal(loan.cupo_aplicado, 2);
  assert.equal(loan.duracion_max_horas, 24);
  assert.equal((await client.query('SELECT estado FROM prestamos.v_prestamos_estado WHERE id = $1', [loan.id])).rows[0].estado, 'activo');
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  await expectSqlError(client, () => client.query("UPDATE prestamos.unidades_inventario SET estado = 'disponible' WHERE id = $1", [data.unitId]), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.unidades_inventario SET estado = 'baja', baja_en = clock_timestamp(), motivo_baja = 'Prueba' WHERE id = $1", [data.unitId]), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.prestamos SET vencimiento = vencimiento + interval '1 hour' WHERE id = $1", [loan.id]), '23514');
}));

test('no confirma un préstamo si la unidad no cambia a prestada', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await expectSqlError(client, async () => {
    await client.query(`INSERT INTO prestamos.prestamos (solicitante_id, autorizado_por, unidad_id, inicio, vencimiento, modalidad, condicion_entrega)
      VALUES ($1, $2, $3, $4, $5, 'retiro', 'Apto')`, [data.userId, data.adminId, data.unitId, data.inicio, new Date(data.inicio.getTime() + 3600000)]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  }, '23514');
}));

test('vencido sigue prestado, bloquea disponibilidad y consume cupo', async () => rollback(pool, async (client) => {
  const data = await fixture(client, { historical: true, cupo: 1 });
  const loan = await lend(client, data);
  assert.equal((await client.query('SELECT estado FROM prestamos.v_prestamos_estado WHERE id = $1', [loan.id])).rows[0].estado, 'vencido');
  assert.equal((await client.query('SELECT disponible FROM prestamos.v_disponibilidad_actual WHERE unidad_id = $1', [data.unitId])).rows[0].disponible, false);
  await expectSqlError(client, () => lend(client, data, { unitId: data.secondUnitId }), '23514');
}));

test('devolución de cuenta inactiva sigue gestionable y puede dejar unidad en mantenimiento', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const loan = await lend(client, data);
  await client.query('UPDATE prestamos.personas SET activo = false WHERE id = $1', [data.personId]);
  await returnLoan(client, data, loan, { estadoUnidad: 'mantenimiento' });
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  assert.equal((await client.query('SELECT estado FROM prestamos.v_prestamos_estado WHERE id = $1', [loan.id])).rows[0].estado, 'devuelto');
  assert.equal((await client.query('SELECT disponible FROM prestamos.v_disponibilidad_actual WHERE unidad_id = $1', [data.unitId])).rows[0].disponible, false);
  await expectSqlError(client, () => returnLoan(client, data, loan), '23514');
}));

test('políticas aprobadas no cambian condiciones ni solapan vigencias; funciones pendientes se rechazan', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await expectSqlError(client, () => client.query('UPDATE prestamos.politicas_prestamo SET cupo_total = 9 WHERE id = $1', [data.policyId]), '23514');
  await expectSqlError(client, () => client.query(`INSERT INTO prestamos.politicas_prestamo
    (rol, version, nombre, vigencia_inicio, vigencia_fin, aprobada_en, aprobada_por, cupo_total, duracion_cantidad, duracion_unidad, modalidades)
    SELECT rol, version + 1, 'Solapada', vigencia_inicio, vigencia_fin, aprobada_en, aprobada_por, cupo_total, duracion_cantidad, duracion_unidad, modalidades
    FROM prestamos.politicas_prestamo WHERE id = $1`, [data.policyId]), '23P01');
  await expectSqlError(client, () => client.query(`INSERT INTO prestamos.politicas_prestamo
    (rol, version, nombre, vigencia_inicio, cupo_total, duracion_cantidad, duracion_unidad, modalidades, garantia_exigida)
    VALUES (NULL, 999999, 'No soportada', CURRENT_TIMESTAMP, 1, 1, 'horas', ARRAY['retiro'], true)`), '23514');
}));

test('no entrega sin política aprobada o sin perfil habilitado', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await client.query('UPDATE prestamos.perfiles_academicos SET habilitado = false WHERE usuario_id = $1', [data.userId]);
  await expectSqlError(client, () => lend(client, data), '23514');
  await client.query('UPDATE prestamos.perfiles_academicos SET habilitado = true WHERE usuario_id = $1', [data.userId]);
  const past = new Date(data.inicio.getTime() - 2 * 86400000);
  await expectSqlError(client, () => lend(client, { ...data, inicio: past }), '23514');
}));

test('auditoría automática, actor identificado y sin hashes de contraseñas', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const loan = await lend(client, data);
  const events = await client.query("SELECT * FROM prestamos.eventos_historial WHERE entidad = 'prestamos' AND entidad_id = $1", [loan.id]);
  assert.equal(events.rowCount, 1);
  assert.equal(events.rows[0].actor_usuario_id, data.adminId);
  const userEvent = await client.query("SELECT detalle FROM prestamos.eventos_historial WHERE entidad = 'usuarios' AND entidad_id = $1", [data.userId]);
  assert.equal(JSON.stringify(userEvent.rows).includes('password_hash'), false);
  assert.equal(JSON.stringify(userEvent.rows).includes('$argon2id$'), false);
}));

test('cuenta API no puede editar historial, borrar negocio ni crear tablas', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await expectSqlError(client, () => client.query("UPDATE prestamos.eventos_historial SET accion = 'alterado' WHERE false"), '42501');
  await expectSqlError(client, () => client.query('TRUNCATE prestamos.eventos_historial'), '42501');
  await expectSqlError(client, () => client.query('DELETE FROM prestamos.personas WHERE id = $1', [data.personId]), '42501');
  await expectSqlError(client, () => client.query('CREATE TABLE prestamos.no_permitida (id integer)'), '42501');
}));

test('rechaza duraciones inválidas y baja sin motivo; baja es terminal', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await expectSqlError(client, () => lend(client, data, { vencimiento: data.inicio }), '23514');
  await expectSqlError(client, () => lend(client, data, { vencimiento: new Date(data.inicio.getTime() + 25 * 3600000) }), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.unidades_inventario SET estado = 'baja' WHERE id = $1", [data.unitId]), '23514');
  await client.query("UPDATE prestamos.unidades_inventario SET estado = 'baja', baja_en = clock_timestamp(), motivo_baja = 'Retiro aprobado de prueba' WHERE id = $1", [data.unitId]);
  await expectSqlError(client, () => client.query("UPDATE prestamos.unidades_inventario SET estado = 'disponible', baja_en = NULL, motivo_baja = NULL WHERE id = $1", [data.unitId]), '23514');
}));

test('rollback también elimina los eventos de la operación fallida', async () => {
  const client = await pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    const data = await fixture(client);
    userId = data.userId;
    await lend(client, data);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT id FROM prestamos.prestamos WHERE solicitante_id = $1', [userId])).rowCount, 0);
    assert.equal((await client.query("SELECT id FROM prestamos.eventos_historial WHERE entidad = 'usuarios' AND entidad_id = $1", [userId])).rowCount, 0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('no reasigna una cuenta y un cambio de contraseña revoca sus sesiones', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const adminPerson = (await client.query('SELECT persona_id FROM prestamos.usuarios WHERE id = $1', [data.adminId])).rows[0].persona_id;
  await expectSqlError(client, () => client.query('UPDATE prestamos.usuarios SET persona_id = $2 WHERE id = $1', [data.userId, adminPerson]), '23514');
  await client.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, expira_en)
    VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`, [data.userId, 'c'.repeat(64)]);
  await client.query("UPDATE prestamos.usuarios SET password_hash = password_hash || 'changed' WHERE id = $1", [data.userId]);
  assert.ok((await client.query('SELECT revocada_en FROM prestamos.sesiones WHERE usuario_id = $1', [data.userId])).rows[0].revocada_en);
}));

test('el motor exige inspección, accesorios completos si apta y destino consistente al confirmar', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  await client.query("UPDATE prestamos.unidades_inventario SET accesorios = '[\"Cable\",\"Cable\"]'::jsonb WHERE id = $1", [data.unitId]);
  const loan = (await client.query(`INSERT INTO prestamos.prestamos
    (solicitante_id, autorizado_por, unidad_id, inicio, vencimiento, modalidad, condicion_entrega, accesorios_entrega)
    VALUES ($1, $2, $3, $4, $5, 'retiro', 'Apto', '["Cable","Cable"]'::jsonb) RETURNING *`,
  [data.userId, data.adminId, data.unitId, data.inicio, new Date(data.inicio.getTime() + 3600000)])).rows[0];
  await client.query("UPDATE prestamos.unidades_inventario SET estado = 'prestada' WHERE id = $1", [data.unitId]);
  const base = `UPDATE prestamos.prestamos SET estado_cierre = 'devuelto', devolucion_en = clock_timestamp(),
    recibido_por = $2, condicion_devolucion = 'Inspección', accesorios_devolucion = '["Cable"]'::jsonb`;
  await expectSqlError(client, () => client.query(`${base} WHERE id = $1`, [loan.id, data.adminId]), '23514');
  await expectSqlError(client, () => client.query(`${base}, devolucion_apta = true, destino_devolucion = 'disponible' WHERE id = $1`, [loan.id, data.adminId]), '23514');
  await expectSqlError(client, async () => {
    await client.query(`${base}, devolucion_apta = false, destino_devolucion = 'mantenimiento' WHERE id = $1`, [loan.id, data.adminId]);
    await client.query("UPDATE prestamos.unidades_inventario SET estado = 'disponible' WHERE id = $1", [data.unitId]);
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  }, '23514');
}));
