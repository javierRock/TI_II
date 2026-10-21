import { actorTransaction } from '../../db/actor-transaction.js';
import { HttpError, requireRecord } from '../../shared/errors.js';
import { lockUnit } from '../prestamos/prestamos.repository.js';
import { findBorrower } from '../prestamos/prestamos.repository.js';
import { dbNow, lockScopes } from '../politicas/politicas.repository.js';
import * as repository from './reservas.repository.js';

const isAdmin = (auth) => auth.atribucion_admin && auth.rol !== 'estudiante';
export function requestReservation(pool, auth, input) {
  return actorTransaction(pool, auth, async (client) => {
    requireRecord(await lockUnit(client, input.unidad_id), 'Unidad no encontrada');
    const borrower = requireRecord(await findBorrower(client, auth.usuario_id));
    await lockScopes(client, [null, borrower.rol], { shared: true });
    if (new Date(input.inicio) <= await dbNow(client)) throw new HttpError(400, 'El inicio de la reserva debe ser futuro');
    const row = await repository.insertReservation(client, auth.usuario_id, input);
    return repository.reservationDetail(client, row.id, auth.usuario_id);
  }, { admin: false, lockUserIds: [auth.usuario_id] });
}
export async function decide(pool, auth, id, state, input) {
  const hint = requireRecord(await repository.reservationDetail(pool, id, isAdmin(auth) ? null : auth.usuario_id));
  return actorTransaction(pool, auth, async (client) => {
    requireRecord(await lockUnit(client, hint.unidad_id));
    const row = requireRecord(await repository.lockReservation(client, id));
    if (row.estado === state && (row.motivo ?? null) === (input.motivo ?? null)) return repository.reservationDetail(client, id);
    if (!['solicitada', 'confirmada'].includes(row.estado) || row.fin <= await dbNow(client)) throw new HttpError(409, 'La reserva ya terminó o venció');
    if (state !== 'cancelada' && row.estado !== 'solicitada') throw new HttpError(409, 'Solo se puede decidir una solicitud pendiente');
    if (state === 'confirmada') {
      const borrower = requireRecord(await findBorrower(client, row.solicitante_id));
      await lockScopes(client, [null, borrower.rol], { shared: true });
      if (!(await repository.availability(client, row)).disponible) throw new HttpError(409, 'La unidad está ocupada en ese intervalo o aún no se devolvió');
    }
    await repository.decideReservation(client, id, auth.usuario_id, state, input.motivo);
    return repository.reservationDetail(client, id);
  }, { admin: state !== 'cancelada', lockUserIds: [hint.solicitante_id] });
}
