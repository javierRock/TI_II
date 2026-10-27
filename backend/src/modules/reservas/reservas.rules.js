import { HttpError } from '../../shared/errors.js';
export function overlaps(a, b) {
  return a.inicio < b.fin && b.inicio < a.fin;
}
// Barrido temporal: primero terminan los intervalos, después empiezan los nuevos.
export function peakOccupancy(intervals, start, end) {
  const events = [];
  for (const r of intervals) {
    const a = Math.max(+r.inicio, +start),
      b = Math.min(+r.fin, +end);
    if (a < b) events.push([a, 1], [b, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let count = 0,
    peak = 0;
  for (const [, delta] of events) {
    count += delta;
    peak = Math.max(peak, count);
  }
  return peak;
}
export function validateBorrower(b, p) {
  if (
    !b ||
    !b.activo ||
    !b.persona_activa ||
    !b.perfil_habilitado ||
    !['docente', 'estudiante'].includes(b.rol)
  )
    throw new HttpError(409, 'Solicitante o perfil no habilitado');
  if (!p) throw new HttpError(409, 'No existe política aprobada aplicable');
}
export async function validateAllocation(
  c,
  { userId, unitId, start, end, policy, now, exclude = null },
) {
  const r = (
    await c.query(
      "SELECT * FROM reservas WHERE estado='confirmada' AND fin>? AND id<>? AND (solicitante_id=? OR unidad_id=?)",
      [now, exclude ?? '0', userId, unitId],
    )
  ).rows;
  const loans = (
    await c.query(
      "SELECT * FROM prestamos WHERE estado_cierre='abierto' AND (solicitante_id=? OR unidad_id=?)",
      [userId, unitId],
    )
  ).rows;
  const intervals = [
    ...r.map((x) => ({ ...x, inicio: x.inicio, fin: x.fin })),
    ...loans.map((x) => ({
      ...x,
      inicio: x.inicio,
      fin: x.vencimiento <= now ? Infinity : x.vencimiento,
    })),
  ];
  const candidate = { inicio: +start, fin: +end };
  if (
    intervals.some(
      (x) =>
        String(x.unidad_id) === String(unitId) &&
        overlaps({ inicio: +x.inicio, fin: +x.fin }, candidate),
    )
  )
    throw new HttpError(409, 'La unidad tiene una reserva o préstamo incompatible');
  if (
    peakOccupancy(
      intervals.filter((x) => String(x.solicitante_id) === String(userId)),
      start,
      end,
    ) >= policy.cupo_total
  )
    throw new HttpError(409, 'El cupo del solicitante se excede durante el intervalo');
}
