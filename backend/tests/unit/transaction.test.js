import test from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../../src/db/transaction.js';

function fakePool({ rollbackFails = false } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (rollbackFails && sql === 'ROLLBACK') throw new Error('Conexión perdida');
    },
    release(error) { calls.push(error ? 'discard' : 'release'); },
  };
  return { calls, client, async connect() { return client; } };
}

test('confirma una operación con la misma conexión y la libera', async () => {
  const pool = fakePool();
  const result = await withTransaction(pool, async (client) => {
    assert.equal(client, pool.client);
    await client.query('operación');
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(pool.calls, ['BEGIN', 'operación', 'COMMIT', 'release']);
});

test('revierte una operación fallida y conserva el error original', async () => {
  const pool = fakePool();
  const error = new Error('Fallo de negocio');
  await assert.rejects(withTransaction(pool, async () => { throw error; }), (actual) => actual === error);
  assert.deepEqual(pool.calls, ['BEGIN', 'ROLLBACK', 'release']);
});

test('descarta la conexión si también falla el rollback', async () => {
  const pool = fakePool({ rollbackFails: true });
  await assert.rejects(withTransaction(pool, async () => { throw new Error('Fallo original'); }), /Fallo original/);
  assert.deepEqual(pool.calls, ['BEGIN', 'ROLLBACK', 'discard']);
});
