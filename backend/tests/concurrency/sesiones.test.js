import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { withTransaction } from '../../src/db/transaction.js';
import { testPool, fixture } from '../helpers/database.js';

const pool = testPool();
after(() => pool.end());

test('crear sesión y desactivar persona simultáneamente no deja una sesión vigente', async () => {
  const data = await withTransaction(pool, (client) => fixture(client, { historical: true }));
  const results = await Promise.allSettled([
    withTransaction(pool, (client) => client.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, expira_en)
      VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`, [data.userId, randomBytes(32).toString('hex')])),
    withTransaction(pool, (client) => client.query('UPDATE prestamos.personas SET activo = false WHERE id = $1', [data.personId])),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  if (results[0].status === 'rejected') assert.equal(results[0].reason.code, '23514');
  const sessions = await pool.query('SELECT id FROM prestamos.sesiones WHERE usuario_id = $1 AND revocada_en IS NULL', [data.userId]);
  assert.equal(sessions.rowCount, 0);
  assert.equal((await pool.query('SELECT activo FROM prestamos.usuarios WHERE id = $1', [data.userId])).rows[0].activo, false);
});
