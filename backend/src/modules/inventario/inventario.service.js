import { actorTransaction } from '../../db/actor-transaction.js';
import { requireRecord } from '../../shared/errors.js';
import * as repository from './inventario.repository.js';
import { validateGood, requireEditableUnit, validateSerial } from './inventario.rules.js';
import { cancelAffected } from '../reservas/reservas.repository.js';
import { recordEvent } from '../auditoria/auditoria.repository.js';

export const goodDetail = async (pool, id) => requireRecord(await repository.findGood(pool, id));
export const unitDetail = async (pool, id) => requireRecord(await repository.findUnit(pool, id));

export function createGood(pool, auth, input) {
  return actorTransaction(pool, auth, async (client) => {
    const type = requireRecord(
      await repository.findType(client, input.tipo_id),
      'Tipo de bien no encontrado',
    );
    validateGood(input, type);
    return repository.insertGood(client, input);
  });
}
export function editGood(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const good = requireRecord(await repository.findGood(client, id, { lock: true }));
    const type = requireRecord(await repository.findType(client, good.tipo_id));
    validateGood({ ...good, ...input }, type);
    return repository.updateGood(client, id, input, good);
  });
}
export function createUnit(pool, auth, input) {
  return actorTransaction(pool, auth, async (client) => {
    const good = requireRecord(
      await repository.findGood(client, input.bien_id, { lock: true }),
      'Bien no encontrado',
    );
    const type = requireRecord(await repository.findType(client, good.tipo_id));
    validateGood(good, type);
    const unit = {
      ...input,
      marca: input.marca ?? good.marca,
      modelo: input.modelo ?? good.modelo,
    };
    validateSerial(unit, good);
    return repository.insertUnit(client, unit);
  });
}
export function editUnit(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const unit = requireRecord(await repository.findUnit(client, id, { lock: true }));
    requireEditableUnit(unit);
    return repository.updateUnit(client, id, input, unit);
  });
}
export function changeUnitState(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const unit = requireRecord(await repository.findUnit(client, id, { lock: true }));
    requireEditableUnit(unit);
    if (input.estado && input.estado !== 'disponible')
      await cancelAffected(client, id, auth.usuario_id, input.motivo ?? 'Unidad en mantenimiento');
    const result = await repository.setUnitState(client, id, input);
    await recordEvent(client, {
      actorId: auth.usuario_id,
      entidad: 'unidades_inventario',
      entidadId: id,
      accion: 'unidad.estado',
      detalle: { anterior: unit.estado, estado: input.estado, motivo: input.motivo ?? null },
    });
    return result;
  });
}
