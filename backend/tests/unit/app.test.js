import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../src/app.js';

test('API básica: health, 404 y rechazo de JSON inválido', async () => {
  const server = createApp({ async query(sql) { assert.equal(sql, 'SELECT 1'); } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { estado: 'ok', base_datos: 'disponible' });
    assert.equal(health.headers.get('x-powered-by'), null);
    const missing = await fetch(`${base}/no-existe`);
    assert.equal(missing.status, 404);
    const malformed = await fetch(`${base}/no-existe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(malformed.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
