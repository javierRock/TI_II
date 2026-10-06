import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';
import { testPool } from '../helpers/database.js';

test('health conecta con PostgreSQL usando el usuario restringido de la API', async () => {
  const pool = testPool();
  const server = createApp(pool).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).base_datos, 'disponible');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
