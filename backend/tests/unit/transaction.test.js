import test from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from '../../src/db/transaction.js';
test('transacción confirma o revierte, limpia identidad y libera conexión', async () => {
  for (const fail of [false, true]) {
    const calls = [],
      client = {
        query: async (sql) => calls.push(sql),
        release: () => calls.push('release'),
      },
      pool = { connect: async () => client };
    const action = () =>
      withTransaction(pool, async () => {
        if (fail) throw new Error('fallo');
        return 42;
      });
    if (fail) await assert.rejects(action, /fallo/);
    else assert.equal(await action(), 42);
    assert.equal(calls[0], 'BEGIN');
    assert.ok(calls.includes(fail ? 'ROLLBACK' : 'COMMIT'));
    assert.equal(calls.at(-1), 'release');
    assert.match(calls.at(-2), /@actor_usuario_id = NULL/);
  }
});
