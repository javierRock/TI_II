import test from 'node:test';
import assert from 'node:assert/strict';
import { peakOccupancy, overlaps } from '../../src/modules/reservas/reservas.rules.js';
test('intervalos adyacentes no se solapan', () => {
  assert.equal(overlaps({ inicio: 1, fin: 2 }, { inicio: 2, fin: 3 }), false);
  assert.equal(overlaps({ inicio: 1, fin: 3 }, { inicio: 2, fin: 4 }), true);
});
test('cupo máximo no es la suma de todas las reservas intersectadas', () => {
  assert.equal(
    peakOccupancy(
      [
        { inicio: 1, fin: 2 },
        { inicio: 2, fin: 3 },
      ],
      1,
      3,
    ),
    1,
  );
  assert.equal(
    peakOccupancy(
      [
        { inicio: 1, fin: 4 },
        { inicio: 2, fin: 3 },
      ],
      1,
      4,
    ),
    2,
  );
  assert.equal(peakOccupancy([{ inicio: 0, fin: Infinity }], 10, 20), 1);
});
