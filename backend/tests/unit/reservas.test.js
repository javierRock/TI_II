import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationSchema, reservationQuery, availabilityQuery, reasonSchema } from '../../src/modules/reservas/reservas.schemas.js';

const input = { unidad_id: '9223372036854775807', inicio: '2027-01-10T08:00:00-05:00',
  fin: '2027-01-10T09:00:00-05:00', modalidad: 'retiro', confirmar: true };
test('reserva valida intervalo, zona e identificadores sin admitir identidad o estado del cliente', () => {
  assert.equal(reservationSchema.parse(input).unidad_id, input.unidad_id);
  for (const extra of [{ solicitante_id: '1' }, { estado: 'confirmada' }, { decidido_por: '1' }]) {
    assert.equal(reservationSchema.safeParse({ ...input, ...extra }).success, false);
  }
  assert.equal(reservationSchema.safeParse({ ...input, fin: input.inicio }).success, false);
  assert.equal(reservationSchema.safeParse({ ...input, inicio: '2027-01-10T08:00:00' }).success, false);
});
test('listados personales no admiten otro titular y las decisiones exigen motivo', () => {
  assert.equal(reservationQuery.safeParse({ solicitante_id: '1' }).success, false);
  assert.equal(reasonSchema.safeParse({ confirmar: true, motivo: ' ' }).success, false);
  assert.equal(availabilityQuery.safeParse({ unidad_id: '1', inicio: input.fin, fin: input.inicio }).success, false);
});
