import { actorTransaction } from '../../db/actor-transaction.js';
import { HttpError, requireRecord } from '../../shared/errors.js';
import { recordEvent } from '../auditoria/auditoria.repository.js';
import * as repository from './politicas.repository.js';

function validateInterval(input) {
  if (input.vigencia_fin && new Date(input.vigencia_fin) <= new Date(input.vigencia_inicio)) {
    throw new HttpError(400, 'El fin de vigencia debe ser posterior al inicio');
  }
}
export function createPolicy(pool, auth, input) {
  validateInterval(input);
  return actorTransaction(pool, auth, async (client) => {
    await repository.lockScopes(client, [input.rol]);
    const policy = await repository.insertPolicy(client, input);
    return repository.findPolicy(client, policy.id);
  });
}
export function editPolicy(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const policy = requireRecord(await repository.findPolicy(client, id, { lock: true }));
    if (policy.aprobada_en) throw new HttpError(409, 'Las condiciones aprobadas son inmutables; crea una nueva versión');
    const next = { ...policy, ...input };
    validateInterval(next);
    await repository.updateDraft(client, id, next);
    return repository.findPolicy(client, id);
  });
}
export function approvePolicy(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const hint = requireRecord(await repository.findPolicy(client, id));
    await repository.lockScopes(client, [hint.rol]);
    const policy = requireRecord(await repository.findPolicy(client, id, { lock: true }));
    if (policy.aprobada_en) throw new HttpError(409, 'La versión ya está aprobada');
    const now = await repository.dbNow(client);
    if (policy.vigencia_fin && policy.vigencia_fin <= now) throw new HttpError(409, 'No se puede aprobar una vigencia ya finalizada');
    if (input.sustituye_id) {
      const previous = requireRecord(await repository.findPolicy(client, input.sustituye_id, { lock: true }));
      if (!previous.aprobada_en || previous.id === policy.id || previous.rol !== policy.rol
          || policy.vigencia_inicio <= now || previous.vigencia_inicio >= policy.vigencia_inicio
          || (previous.vigencia_fin && previous.vigencia_fin <= policy.vigencia_inicio)) {
        throw new HttpError(409, 'La sustitución requiere una versión del mismo alcance con vigencia superpuesta y un inicio futuro');
      }
      await repository.endValidity(client, previous.id, policy.vigencia_inicio);
    }
    const approved = await repository.approvePolicy(client, id, auth.usuario_id);
    await recordEvent(client, { actorId: auth.usuario_id, entidad: 'politicas_prestamo', entidadId: id,
      accion: 'politica.aprobada', detalle: { referencia_aprobacion: input.referencia_aprobacion, sustituye_id: input.sustituye_id ?? null } });
    return approved;
  });
}
export function endPolicyValidity(pool, auth, id, input) {
  return actorTransaction(pool, auth, async (client) => {
    const hint = requireRecord(await repository.findPolicy(client, id));
    await repository.lockScopes(client, [hint.rol]);
    const policy = requireRecord(await repository.findPolicy(client, id, { lock: true }));
    const now = await repository.dbNow(client);
    const end = new Date(input.vigencia_fin);
    if (!policy.aprobada_en || end <= now || end <= policy.vigencia_inicio || (policy.vigencia_fin && end >= policy.vigencia_fin)) {
      throw new HttpError(409, 'Solo se puede acortar una vigencia aprobada a una fecha futura');
    }
    const changed = await repository.endValidity(client, id, input.vigencia_fin);
    await recordEvent(client, { actorId: auth.usuario_id, entidad: 'politicas_prestamo', entidadId: id,
      accion: 'politica.fin_vigencia', detalle: { motivo: input.motivo } });
    return changed;
  });
}
