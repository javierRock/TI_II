import { actorTransaction } from '../../db/actor-transaction.js';
import { HttpError, requireRecord } from '../../shared/errors.js';
import { dbNow, lockScopes, applicablePolicy } from '../politicas/politicas.repository.js';
import { recordEvent } from '../auditoria/auditoria.repository.js';
import { validateDelivery, validateReturn, matchesReturn } from './prestamos.rules.js';
import * as repository from './prestamos.repository.js';

export function deliver(pool, auth, input) {
  return actorTransaction(pool, auth, async (client) => {
    const borrower = requireRecord(await repository.findBorrower(client, input.solicitante_id), 'Solicitante no encontrado');
    const unit = requireRecord(await repository.lockUnit(client, input.unidad_id), 'Unidad no encontrada');
    await lockScopes(client, [null, borrower.rol], { shared: true });
    const now = await dbNow(client);
    const policy = await applicablePolicy(client, borrower.rol, now);
    const abiertos = await repository.openCount(client, borrower.id);
    validateDelivery({ borrower, unit, policy, abiertos, now, input });
    const loan = await repository.insertLoan(client, auth.usuario_id, input);
    return { ...await repository.loanDetail(client, loan.id), unidad_estado: 'prestada' };
  }, { lockUserIds: [input.solicitante_id] });
}
export async function receive(pool, auth, id, input) {
  // Lectura preliminar no devuelve información al solicitante. La ruta exige admin.
  const hint = requireRecord(await repository.loanRecord(pool, id));
  return actorTransaction(pool, auth, async (client) => {
    // Mismo orden que entrega: cuentas, unidad, préstamo.
    const unit = requireRecord(await repository.lockUnit(client, hint.unidad_id));
    const loan = requireRecord(await repository.loanRecord(client, id, { lock: true }));
    if (loan.estado_cierre === 'devuelto') {
      if (!matchesReturn(loan, unit, input)) throw new HttpError(409, 'El préstamo ya tiene una devolución distinta registrada');
      return { ...await repository.loanDetail(client, id), unidad_estado: unit.estado, devolucion_repetida: true };
    }
    if (unit.estado !== 'prestada') throw new HttpError(409, 'La unidad no tiene un estado coherente con el préstamo abierto');
    const missing = validateReturn(loan, input);
    await repository.closeLoan(client, id, auth.usuario_id, input);
    await repository.receiveUnit(client, loan.unidad_id, input);
    const detail = await repository.loanDetail(client, id);
    await recordEvent(client, { actorId: auth.usuario_id, entidad: 'prestamos', entidadId: id,
      accion: 'prestamo.devuelto', detalle: { apta: input.apta, destino: input.estado_unidad,
        accesorios_faltantes: missing, retraso_segundos: detail.retraso_segundos,
        exceso_tolerancia_segundos: detail.exceso_tolerancia_segundos, tarifa_diaria: loan.tarifa_diaria } });
    return { ...detail, unidad_estado: input.estado_unidad, devolucion_repetida: false };
  }, { lockUserIds: [hint.solicitante_id] });
}
