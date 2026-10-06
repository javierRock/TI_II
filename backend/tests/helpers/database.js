import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from '../../src/db/pool.js';
import { databaseUrls } from '../../src/config/env.js';

export function testPool() {
  return createPool(databaseUrls({ test: true }).application);
}

export async function rollback(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await operation(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

export async function expectSqlError(client, operation, code) {
  await client.query('SAVEPOINT expected_error');
  let actual;
  try {
    await operation();
  } catch (error) {
    actual = error;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_error');
    await client.query('RELEASE SAVEPOINT expected_error');
  }
  assert.ok(actual, 'La operación debía rechazarse');
  assert.equal(actual.code, code, actual.message);
}

// Exclusivamente para pruebas de estructura: no representa una cuenta utilizable.
const testHash = '$argon2id$v=19$m=65536,t=3,p=1$c2FsdF9leGNsdXNpdm9fcHJ1ZWJh$YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo';

export async function fixture(client, { cupo = 2, historical = false, rol = 'docente' } = {}) {
  const suffix = randomUUID();
  async function person(name) {
    const result = await client.query(`INSERT INTO prestamos.personas (documento, nombre_completo, correo)
      VALUES ($1, $2, $3) RETURNING id`, [`${name}-${suffix}`.slice(0, 32), name, `${suffix}@example.test`]);
    return result.rows[0].id;
  }
  const adminPerson = await person('admin');
  const adminId = (await client.query("SELECT nextval(pg_get_serial_sequence('prestamos.usuarios', 'id')) AS id")).rows[0].id;
  await client.query(`INSERT INTO prestamos.usuarios
    (id, persona_id, nombre_usuario, password_hash, rol, atribucion_admin, atribucion_otorgada_en, atribucion_otorgada_por)
    OVERRIDING SYSTEM VALUE VALUES ($1, $2, $3, $4, 'personal_administrativo', true, CURRENT_TIMESTAMP, $1)`,
  [adminId, adminPerson, `admin-${suffix}`, testHash]);
  const personId = await person('titular');
  const userId = (await client.query(`INSERT INTO prestamos.usuarios (persona_id, nombre_usuario, password_hash, rol)
    VALUES ($1, $2, $3, $4) RETURNING id`, [personId, `titular-${suffix}`, testHash, rol])).rows[0].id;
  let planId;
  if (rol === 'estudiante') {
    planId = (await client.query(`INSERT INTO prestamos.planes_estudio (codigo, programa, nombre)
      VALUES ($1, 'Programa de prueba', 'Plan de prueba') RETURNING id`, [suffix])).rows[0].id;
    await client.query('INSERT INTO prestamos.semestres_plan (plan_id, numero) VALUES ($1, 15)', [planId]);
    await client.query(`INSERT INTO prestamos.perfiles_academicos (usuario_id, tipo, codigo, habilitado, plan_id, semestre)
      VALUES ($1, 'estudiante', $2, true, $3, 15)`, [userId, suffix, planId]);
  } else {
    await client.query(`INSERT INTO prestamos.perfiles_academicos
      (usuario_id, tipo, codigo, habilitado, especialidad, vinculacion)
      VALUES ($1, 'docente', $2, true, 'Especialidad de prueba', 'Escuela')`, [userId, suffix]);
  }
  const typeId = (await client.query("SELECT id FROM prestamos.tipos_bien WHERE codigo = 'visor_3d'")).rows[0].id;
  const bienId = (await client.query(`INSERT INTO prestamos.bienes (tipo_id, nombre, marca, modelo)
    VALUES ($1, 'Visor de prueba', 'Marca de prueba', 'Modelo de prueba') RETURNING id`, [typeId])).rows[0].id;
  async function unit(code = randomUUID(), serie = null) {
    return (await client.query(`INSERT INTO prestamos.unidades_inventario
      (bien_id, codigo_inventario, ubicacion, condicion_fisica, serie)
      VALUES ($1, $2, 'Escuela', 'Apto', $3) RETURNING id`, [bienId, code, serie])).rows[0].id;
  }
  const unitId = await unit();
  const secondUnitId = await unit();
  const window = (await client.query(historical
    ? "SELECT COALESCE(min(vigencia_inicio), CURRENT_TIMESTAMP - interval '365 days') - interval '2 days' AS inicio FROM prestamos.politicas_prestamo"
    : "SELECT clock_timestamp() AS inicio")).rows[0].inicio;
  const policyId = (await client.query(`INSERT INTO prestamos.politicas_prestamo
    (rol, version, nombre, vigencia_inicio, vigencia_fin, aprobada_en, aprobada_por, cupo_total, duracion_cantidad, duracion_unidad, modalidades)
    VALUES ($1::varchar, (SELECT COALESCE(max(version), 0) + 1 FROM prestamos.politicas_prestamo WHERE rol = $1::varchar),
      'Política exclusiva de prueba', $2::timestamptz, $2::timestamptz + interval '1 day',
      $2::timestamptz - interval '1 minute', $3, $4, 24, 'horas', ARRAY['retiro', 'en_sitio']) RETURNING id`,
  [rol, window, adminId, cupo])).rows[0].id;
  const inicio = historical ? new Date(window.getTime() + 3600000)
    : (await client.query('SELECT clock_timestamp() AS inicio')).rows[0].inicio;
  return { userId, personId, adminId, unitId, secondUnitId, bienId, typeId, policyId, planId, inicio, unit };
}

export async function lend(client, data, { unitId = data.unitId, vencimiento = new Date(data.inicio.getTime() + 3600000) } = {}) {
  await client.query("SELECT set_config('app.actor_usuario_id', $1, true)", [data.adminId]);
  const result = await client.query(`INSERT INTO prestamos.prestamos
    (solicitante_id, autorizado_por, unidad_id, inicio, vencimiento, modalidad, condicion_entrega)
    VALUES ($1, $2, $3, $4, $5, 'retiro', 'Apto') RETURNING *`,
  [data.userId, data.adminId, unitId, data.inicio, vencimiento]);
  await client.query("UPDATE prestamos.unidades_inventario SET estado = 'prestada' WHERE id = $1", [unitId]);
  return result.rows[0];
}

export async function returnLoan(client, data, loan, { estadoUnidad = 'disponible' } = {}) {
  await client.query(`UPDATE prestamos.prestamos SET estado_cierre = 'devuelto', devolucion_en = clock_timestamp(),
    recibido_por = $2, condicion_devolucion = 'Inspeccionado', accesorios_devolucion = '[]'::jsonb,
    devolucion_apta = $3, destino_devolucion = $4 WHERE id = $1`,
  [loan.id, data.adminId, estadoUnidad === 'disponible', estadoUnidad]);
  await client.query('UPDATE prestamos.unidades_inventario SET estado = $2 WHERE id = $1', [loan.unidad_id, estadoUnidad]);
}
