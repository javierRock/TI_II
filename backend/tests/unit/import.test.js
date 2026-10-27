import test from 'node:test';
import assert from 'node:assert/strict';
import { importData } from '../../scripts/importar-json.js';

function source() {
  return {
    origen: 'postgresql',
    version: 1,
    tablas: {
      tipos_bien: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1) })),
      personas: [{ id: '9007199254740993' }],
      usuarios: [
        {
          id: '1',
          persona_id: '9007199254740993',
          password_hash: '$argon2id$hash-preservado',
          atribucion_admin: false,
        },
      ],
      eventos_historial: [
        {
          id: '85',
          corrige_evento_id: '84',
          detalle: { origen: 'prueba' },
          creado_en: '2026-01-01T00:00:00Z',
        },
      ],
      sesiones: [{ id: '1', token_hash: 'no-importar' }],
    },
  };
}
function pool({ occupied = false, fail = false } = {}) {
  const calls = [];
  const c = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id')) return { rows: [], rowCount: occupied ? 1 : 0 };
      if (sql.startsWith('SHOW COLUMNS')) {
        const table = sql.split(' ').at(-1);
        const fields = {
          tipos_bien: ['id'],
          personas: ['id'],
          usuarios: [
            'id',
            'persona_id',
            'password_hash',
            'atribucion_admin',
            'atribucion_otorgada_por',
          ],
          eventos_historial: ['id', 'detalle', 'creado_en'],
        }[table];
        return {
          rows: fields.map((Field) => ({
            Field,
            Extra: '',
            Type: Field === 'detalle' ? 'json' : Field === 'creado_en' ? 'datetime(6)' : 'bigint',
          })),
        };
      }
      if (fail && sql.startsWith('INSERT INTO usuarios')) throw new Error('referencia inválida');
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ sql: 'release' });
    },
  };
  return { calls, connect: async () => c };
}

test('importador valida formato y precisión antes de conectarse', async () => {
  const p = pool();
  await assert.rejects(importData(p, { origen: 'otro' }), /Formato/);
  const bad = source();
  bad.tablas.personas[0].id = 9007199254740992;
  await assert.rejects(importData(p, bad), /bigint/);
  const missing = source();
  missing.tablas.tipos_bien = [];
  await assert.rejects(importData(p, missing), /cinco tipos/);
  assert.equal(p.calls.length, 0);
});
test('importador preserva IDs y hashes, referencia auditoría anterior y omite sesiones', async () => {
  const p = pool();
  await importData(p, source());
  assert.ok(p.calls.some((x) => x.sql === 'COMMIT'));
  assert.ok(p.calls.some((x) => x.values.includes('9007199254740993')));
  assert.ok(p.calls.some((x) => x.values.includes('$argon2id$hash-preservado')));
  assert.ok(!p.calls.some((x) => x.sql.includes('INTO sesiones')));
  const audit = p.calls.find((x) => x.sql.startsWith('INSERT INTO eventos_historial ('));
  assert.ok(!audit.sql.includes('`id`'));
  assert.deepEqual(JSON.parse(audit.values[0]).importacion, {
    id_original: '85',
    corrige_evento_original: '84',
  });
  assert.ok(audit.values[1] instanceof Date);
});
test('importador rechaza destino ocupado y revierte un error intermedio', async () => {
  for (const options of [{ occupied: true }, { fail: true }]) {
    const p = pool(options);
    await assert.rejects(importData(p, source()));
    assert.ok(p.calls.some((x) => x.sql === 'ROLLBACK'));
    assert.ok(!p.calls.some((x) => x.sql === 'COMMIT'));
    if (options.occupied) assert.ok(!p.calls.some((x) => x.sql.startsWith('DELETE')));
    assert.equal(p.calls.at(-1).sql, 'release');
  }
});
