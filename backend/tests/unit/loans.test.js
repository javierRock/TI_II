import test from 'node:test';
import assert from 'node:assert/strict';
import { missingAccessories, sameAccessories, validateDelivery, validateReturn } from '../../src/modules/prestamos/prestamos.rules.js';
import { policySchema, policyPatch } from '../../src/modules/politicas/politicas.schemas.js';
import { deliverySchema, returnSchema, ownQuery } from '../../src/modules/prestamos/prestamos.schemas.js';

test('accesorios se comparan por nombre y cantidad, no solo por conjunto', () => {
  assert.deepEqual(missingAccessories(['Cable', 'Cable', 'Control'], [' cable ', 'CONTROL']), ['Cable']);
  assert.equal(sameAccessories(['Cable', 'Control'], ['control', 'CABLE']), true);
  assert.equal(sameAccessories(['Cable', 'Cable'], ['Cable']), false);
});

test('accesorios faltantes impiden declarar una devolución apta', () => {
  assert.throws(() => validateReturn({ accesorios_entrega: ['Cable'] }, { accesorios_devolucion: [], apta: true }), /faltantes/);
  assert.deepEqual(validateReturn({ accesorios_entrega: ['Cable'] }, { accesorios_devolucion: [], apta: false }), ['Cable']);
});

test('PATCH de política no reinicia tolerancia ni aplica defaults a campos omitidos', () => {
  assert.deepEqual(policyPatch.parse({ nombre: 'Nombre corregido' }), { nombre: 'Nombre corregido' });
  assert.equal(policySchema.safeParse({ rol: 'docente', nombre: 'Política', vigencia_inicio: '2026-10-06T00:00:00Z',
    cupo_total: 1, duracion_cantidad: 1, duracion_unidad: 'horas', modalidades: ['retiro'], tarifa_diaria: 1 }).success, false);
});

test('las solicitudes no controlan inicio, autorizante, condiciones históricas ni identidad ajena en mios', () => {
  const input = { solicitante_id: '1', unidad_id: '2', vencimiento: '2026-10-07T00:00:00Z',
    modalidad: 'retiro', condicion_entrega: 'Apto', accesorios_entrega: [], confirmar: true };
  assert.equal(deliverySchema.safeParse(input).success, true);
  assert.equal(deliverySchema.safeParse({ ...input, autorizado_por: '3' }).success, false);
  assert.equal(deliverySchema.safeParse({ ...input, inicio: '2026-10-06T00:00:00Z' }).success, false);
  assert.equal(ownQuery.safeParse({ solicitante_id: 'otro' }).success, false);
});

test('inspección no apta no puede elegir disponible y la baja exige motivo', () => {
  const input = { condicion_devolucion: 'Daño', accesorios_devolucion: [], apta: false, confirmar: true };
  assert.equal(returnSchema.safeParse({ ...input, estado_unidad: 'disponible' }).success, false);
  assert.equal(returnSchema.safeParse({ ...input, estado_unidad: 'mantenimiento' }).success, true);
  assert.equal(returnSchema.safeParse({ ...input, estado_unidad: 'baja' }).success, false);
});

test('la entrega cuenta cupo total y valida plazo, modalidad y accesorios', () => {
  const state = { borrower: { activo: true, persona_activa: true, rol: 'docente', perfil_habilitado: true },
    unit: { estado: 'disponible', tipo_habilitado: true, accesorios: ['Cable'] },
    policy: { cupo_total: 1, modalidades: ['retiro'], duracion_cantidad: 1, duracion_unidad: 'horas' },
    abiertos: 0, now: new Date('2026-10-06T10:00:00Z'),
    input: { vencimiento: '2026-10-06T11:00:00Z', modalidad: 'retiro', accesorios_entrega: ['Cable'] } };
  assert.doesNotThrow(() => validateDelivery(state));
  assert.throws(() => validateDelivery({ ...state, abiertos: 1 }), /cupo total/);
  assert.throws(() => validateDelivery({ ...state, input: { ...state.input, vencimiento: '2026-10-06T12:00:00Z' } }), /duración máxima/);
  assert.throws(() => validateDelivery({ ...state, input: { ...state.input, accesorios_entrega: [] } }), /accesorios/);
});
