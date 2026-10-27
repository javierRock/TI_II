import { actorTransaction } from '../../db/actor-transaction.js';
import { HttpError, requireRecord } from '../../shared/errors.js';
import { lockScopes, applicablePolicy, dbNow } from '../politicas/politicas.repository.js';
import { findBorrower, lockUnit } from '../prestamos/prestamos.repository.js';
import { deliver } from '../prestamos/prestamos.service.js';
import { findReservation } from './reservas.repository.js';
import { validateAllocation, validateBorrower } from './reservas.rules.js';

export function requestReservation(pool, auth, v) {
  return actorTransaction(
    pool,
    auth,
    async (c) => {
      const b = await findBorrower(c, auth.usuario_id),
        u = requireRecord(await lockUnit(c, v.unidad_id));
      await lockScopes(c, [null, b.rol], { shared: true });
      const now = await dbNow(c),
        p = await applicablePolicy(c, b.rol, now);
      validateBorrower(b, p);
      const start = new Date(v.inicio),
        end = new Date(v.fin);
      if (
        start <= now ||
        end <= start ||
        end - start > p.duracion_cantidad * (p.duracion_unidad === 'dias' ? 24 : 1) * 3600000
      )
        throw new HttpError(400, 'Intervalo futuro inválido o mayor que el plazo permitido');
      if (!u.tipo_habilitado || ['mantenimiento', 'baja'].includes(u.estado))
        throw new HttpError(409, 'Unidad fuera de servicio');
      await validateAllocation(c, {
        userId: b.id,
        unitId: u.id,
        start,
        end,
        policy: p,
        now,
      });
      const r = await c.query(
        'INSERT INTO reservas(solicitante_id,unidad_id,inicio,fin,uso_previsto) VALUES (?,?,?,?,?)',
        [b.id, u.id, start, end, v.uso_previsto],
      );
      return findReservation(c, r.insertId);
    },
    { admin: false },
  );
}
export async function decideReservation(pool, auth, id, action, reason) {
  const hint = requireRecord(await findReservation(pool, id));
  return actorTransaction(
    pool,
    auth,
    async (c) => {
      const b = await findBorrower(c, hint.solicitante_id),
        u = requireRecord(await lockUnit(c, hint.unidad_id));
      const r = requireRecord(await findReservation(c, id, { lock: true })),
        now = await dbNow(c);
      if (!['pendiente', 'confirmada'].includes(r.estado) || r.fin <= now)
        throw new HttpError(409, 'Reserva terminal o vencida');
      if (action === 'cancelar') {
        if (auth.usuario_id !== r.solicitante_id && !auth.atribucion_admin)
          throw new HttpError(403, 'Reserva ajena');
        await c.query(
          "UPDATE reservas SET estado='cancelada',cancelada_por=?,cancelada_en=UTC_TIMESTAMP(6),motivo_cancelacion=? WHERE id=?",
          [auth.usuario_id, reason, id],
        );
      } else {
        if (r.estado !== 'pendiente') throw new HttpError(409, 'La reserva ya fue decidida');
        if (action === 'confirmar') {
          await lockScopes(c, [null, b.rol], { shared: true });
          const p = await applicablePolicy(c, b.rol, now);
          validateBorrower(b, p);
          if (r.inicio <= now || !u.tipo_habilitado || ['mantenimiento', 'baja'].includes(u.estado))
            throw new HttpError(409, 'La reserva ya comenzó o la unidad está fuera de servicio');
          if (
            r.fin - r.inicio >
            p.duracion_cantidad * (p.duracion_unidad === 'dias' ? 24 : 1) * 3600000
          )
            throw new HttpError(409, 'La política no admite ese plazo');
          await validateAllocation(c, {
            userId: b.id,
            unitId: u.id,
            start: r.inicio,
            end: r.fin,
            policy: p,
            now,
          });
        }
        await c.query(
          'UPDATE reservas SET estado=?,decidida_por=?,decidida_en=UTC_TIMESTAMP(6),motivo_decision=? WHERE id=?',
          [
            action === 'confirmar' ? 'confirmada' : 'rechazada',
            auth.usuario_id,
            reason ?? null,
            id,
          ],
        );
      }
      return findReservation(c, id);
    },
    { admin: action !== 'cancelar', lockUserIds: [hint.solicitante_id] },
  );
}
export async function convertReservation(pool, auth, id, v) {
  const r = requireRecord(await findReservation(pool, id));
  return deliver(pool, auth, {
    ...v,
    solicitante_id: r.solicitante_id,
    unidad_id: r.unidad_id,
    reserva_id: id,
  });
}
