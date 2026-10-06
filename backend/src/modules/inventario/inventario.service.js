import { actorTransaction } from '../../db/actor-transaction.js';
import { requireRecord } from '../../shared/errors.js';
import * as repository from './inventario.repository.js';
import { validateGood, requireEditableUnit, validateSerial } from './inventario.rules.js';

export const goodDetail = async (pool, id) => requireRecord(await repository.findGood(pool, id));
export const unitDetail = async (pool, id) => requireRecord(await repository.findUnit(pool, id));

export function createGood(pool, auth, input) {
  return actorTransaction(pool, auth, async (client) => {
    const type = requireRecord(await repository.findType(client, input.tipo_id), 'Tipo de bien no encontrado');
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
    const good = requireRecord(await repository.findGood(client, input.bien_id, { lock: true }), 'Bien no encontrado');
    const type = requireRecord(await repository.findType(client, good.tipo_id));
    validateGood(good, type);
    validateSerial(input, good);
    return repository.insertUnit(client, input);
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
    return repository.setUnitState(client, id, input);
  });
}
