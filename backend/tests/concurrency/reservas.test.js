import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../../src/db/transaction.js';
import { testPool, fixture, lend } from '../helpers/database.js';
const pool = testPool();
after(() => pool.end());
test('dos confirmaciones simultáneas incompatibles conservan una sola reserva', async () => {
  // La política temporal de esta base _test se cierra al finalizar.
  const data = await withTransaction(pool, (client) => fixture(client));
  try {
    const rows = await withTransaction(pool, async (client) => {
      const ids = [];
      for (let i = 0; i < 2; i++) ids.push((await client.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad)
        VALUES ($1, $2, clock_timestamp() + interval '1 hour', clock_timestamp() + interval '2 hours', 'retiro') RETURNING id`, [data.userId, data.unitId])).rows[0].id);
      return ids;
    });
    const results = await Promise.allSettled(rows.map((id) => withTransaction(pool, (client) => client.query(
      "UPDATE prestamos.reservas SET estado = 'confirmada', decidido_por = $2, decidido_en = clock_timestamp() WHERE id = $1", [id, data.adminId]))));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.ok(['23P01', '40P01'].includes(results.find((r) => r.status === 'rejected').reason.code));
    assert.equal((await pool.query("SELECT count(*)::integer AS total FROM prestamos.reservas WHERE unidad_id = $1 AND estado = 'confirmada'", [data.unitId])).rows[0].total, 1);
  } finally {
    await pool.query("UPDATE prestamos.politicas_prestamo SET vigencia_fin = clock_timestamp() + interval '50 milliseconds' WHERE id = $1", [data.policyId]);
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
});

async function concurrentCase(operation, { cupo = 2 } = {}) {
  const data = await withTransaction(pool, (client) => fixture(client, { cupo }));
  try { await operation(data); }
  finally {
    await pool.query("UPDATE prestamos.politicas_prestamo SET vigencia_fin = clock_timestamp() + interval '50 milliseconds' WHERE id = $1", [data.policyId]);
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
}
test('confirmaciones simultáneas en unidades distintas respetan el cupo del titular', async () => concurrentCase(async (data) => {
  const rows = [];
  for (const unitId of [data.unitId, data.secondUnitId]) rows.push((await pool.query(`INSERT INTO prestamos.reservas
    (solicitante_id, unidad_id, inicio, fin, modalidad) VALUES ($1, $2, clock_timestamp() + interval '1 hour',
    clock_timestamp() + interval '2 hours', 'retiro') RETURNING id`, [data.userId, unitId])).rows[0]);
  const results = await Promise.allSettled(rows.map((row) => withTransaction(pool, (client) => client.query(
    "UPDATE prestamos.reservas SET estado = 'confirmada', decidido_por = $2, decidido_en = clock_timestamp() WHERE id = $1", [row.id, data.adminId]))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, '23514');
}, { cupo: 1 }));

test('confirmación y entrega simultáneas no crean compromisos incompatibles', async () => concurrentCase(async (data) => {
  const row = (await pool.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad)
    VALUES ($1, $2, clock_timestamp() + interval '1 hour', clock_timestamp() + interval '2 hours', 'retiro') RETURNING id`, [data.userId, data.unitId])).rows[0];
  const results = await Promise.allSettled([
    withTransaction(pool, (client) => client.query("UPDATE prestamos.reservas SET estado = 'confirmada', decidido_por = $2, decidido_en = clock_timestamp() WHERE id = $1", [row.id, data.adminId])),
    withTransaction(pool, (client) => lend(client, data, { vencimiento: new Date(Date.now() + 10800000) })),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(['23514', '40P01'].includes(results.find((r) => r.status === 'rejected').reason.code));
}));
