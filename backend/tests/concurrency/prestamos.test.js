import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../../src/db/transaction.js';
import { testPool, fixture, lend } from '../helpers/database.js';

const pool = testPool();
after(() => pool.end());

test('dos entregas simultáneas de una unidad producen exactamente un préstamo', async () => {
  const data = await withTransaction(pool, (client) => fixture(client, { historical: true }));
  const other = await withTransaction(pool, (client) => fixture(client, { historical: true }));
  const results = await Promise.allSettled([
    withTransaction(pool, (client) => lend(client, data)),
    withTransaction(pool, (client) => lend(client, other, { unitId: data.unitId })),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, '23514');
  const loans = await pool.query("SELECT id FROM prestamos.prestamos WHERE unidad_id = $1 AND estado_cierre = 'abierto'", [data.unitId]);
  assert.equal(loans.rowCount, 1);
  const events = await pool.query("SELECT id FROM prestamos.eventos_historial WHERE entidad = 'prestamos' AND entidad_id = $1", [loans.rows[0].id]);
  assert.equal(events.rowCount, 1);
});

test('entregas simultáneas de unidades distintas no exceden el cupo del solicitante', async () => {
  const data = await withTransaction(pool, (client) => fixture(client, { historical: true, cupo: 1 }));
  const results = await Promise.allSettled([
    withTransaction(pool, (client) => lend(client, data)),
    withTransaction(pool, (client) => lend(client, data, { unitId: data.secondUnitId })),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, '23514');
  const count = await pool.query("SELECT count(*)::integer AS total FROM prestamos.prestamos WHERE solicitante_id = $1 AND estado_cierre = 'abierto'", [data.userId]);
  assert.equal(count.rows[0].total, 1);
});
