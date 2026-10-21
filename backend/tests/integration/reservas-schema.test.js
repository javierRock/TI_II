import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { testPool, rollback, expectSqlError, fixture, lend } from '../helpers/database.js';
const pool = testPool();
after(() => pool.end());
async function reserve(client, data, extra = {}) {
  return (await client.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad)
    VALUES ($1, $2, date_trunc('milliseconds', clock_timestamp()) + interval '1 hour', date_trunc('milliseconds', clock_timestamp()) + interval '2 hours', 'retiro') RETURNING *`,
  [data.userId, extra.unitId ?? data.unitId])).rows[0];
}
const approve = (client, data, row) => client.query("UPDATE prestamos.reservas SET estado = 'confirmada', decidido_por = $2, decidido_en = clock_timestamp() WHERE id = $1", [row.id, data.adminId]);
test('motor protege identidad, transiciones, cupo y motivos aunque se omita la API', async () => rollback(pool, async (client) => {
  const data = await fixture(client, { cupo: 1 });
  const first = await reserve(client, data); const second = await reserve(client, data, { unitId: data.secondUnitId });
  await approve(client, data, first);
  await expectSqlError(client, () => approve(client, data, second), '23514');
  await expectSqlError(client, () => client.query('UPDATE prestamos.reservas SET inicio = inicio + interval \'1 minute\' WHERE id = $1', [first.id]), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.reservas SET estado = 'atendida' WHERE id = $1", [first.id]), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.reservas SET estado = 'cancelada', decidido_por = $2, motivo = NULL WHERE id = $1", [first.id, data.userId]), '23514');
  await expectSqlError(client, () => client.query("UPDATE prestamos.reservas SET estado = 'rechazada', decidido_por = $2, decidido_en = clock_timestamp(), motivo = 'Intento' WHERE id = $1", [second.id, data.userId]), '23514');
}));
test('préstamo abierto, incluso vencido, impide confirmar otra reserva de esa unidad', async () => rollback(pool, async (client) => {
  const data = await fixture(client); const row = await reserve(client, data);
  await lend(client, data);
  await expectSqlError(client, () => approve(client, data, row), '23514');
}));
test('vencimiento se deriva del reloj sin liberar una unidad ni cambiar historial', async () => rollback(pool, async (client) => {
  const data = await fixture(client);
  const row = (await client.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad)
    VALUES ($1, $2, clock_timestamp() + interval '40 milliseconds', clock_timestamp() + interval '100 milliseconds', 'retiro') RETURNING *`, [data.userId, data.unitId])).rows[0];
  await client.query('SELECT pg_sleep(0.15)');
  const state = (await client.query('SELECT estado, estado_actual FROM prestamos.v_reservas_estado WHERE id = $1', [row.id])).rows[0];
  assert.deepEqual(state, { estado: 'solicitada', estado_actual: 'vencida' });
  await expectSqlError(client, () => approve(client, data, row), '23514');
}));

test('mantenimiento cancela compromisos afectados y registra al administrador', async () => rollback(pool, async (client) => {
  const data = await fixture(client); const row = await reserve(client, data);
  await approve(client, data, row);
  await client.query("SELECT set_config('app.actor_usuario_id', $1, true)", [data.adminId]);
  await client.query("UPDATE prestamos.unidades_inventario SET estado = 'mantenimiento' WHERE id = $1", [data.unitId]);
  const result = (await client.query('SELECT estado, decidido_por, motivo FROM prestamos.reservas WHERE id = $1', [row.id])).rows[0];
  assert.equal(result.estado, 'cancelada'); assert.equal(result.decidido_por, data.adminId);
  assert.match(result.motivo, /mantenimiento/);
}));

test('cupo usa ocupación máxima por instante y admite reservas adyacentes', async () => rollback(pool, async (client) => {
  const data = await fixture(client, { cupo: 2 });
  const first = await reserve(client, data); await approve(client, data, first);
  async function between(unitId, start, end) {
    return (await client.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad)
      VALUES ($1, $2, $3, $4, 'retiro') RETURNING *`, [data.userId, unitId, start, end])).rows[0];
  }
  const adjacent = await between(data.secondUnitId, first.fin, new Date(first.fin.getTime() + 3600000));
  await approve(client, data, adjacent);
  const middleStart = new Date(first.inicio.getTime() + 1800000);
  const middleEnd = new Date(first.fin.getTime() + 1800000);
  const middle = await between(await data.unit(), middleStart, middleEnd);
  // Cruza dos reservas, pero esas dos no ocupan el mismo instante.
  await approve(client, data, middle);
  const fourth = await between(await data.unit(), middleStart, middleEnd);
  await expectSqlError(client, () => approve(client, data, fourth), '23514');
}));
