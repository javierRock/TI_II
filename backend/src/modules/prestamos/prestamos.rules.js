import { HttpError } from '../../shared/errors.js';

function counts(values) {
  const result = new Map();
  for (const value of values) {
    if (typeof value !== 'string') throw new HttpError(409, 'Los accesorios requieren descripciones de texto; revisa el registro histórico o el inventario');
    const key = value.trim().toLowerCase();
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}
export function missingAccessories(expected, received) {
  const actual = counts(received);
  const missing = [];
  for (const value of expected) {
    const key = value.trim().toLowerCase();
    if ((actual.get(key) ?? 0) > 0) actual.set(key, actual.get(key) - 1);
    else missing.push(value);
  }
  return missing;
}
export function sameAccessories(a, b) {
  return a.length === b.length && missingAccessories(a, b).length === 0;
}
export function validateDelivery({ borrower, unit, policy, abiertos, now, input }) {
  if (!borrower.activo || !borrower.persona_activa || !['docente', 'estudiante'].includes(borrower.rol)) throw new HttpError(409, 'Solicitante no habilitado');
  if (!borrower.perfil_habilitado) throw new HttpError(409, 'El solicitante requiere un perfil académico habilitado');
  if (unit.estado !== 'disponible' || !unit.tipo_habilitado) throw new HttpError(409, 'La unidad no está disponible');
  if (!policy) throw new HttpError(409, 'No existe una política aprobada aplicable');
  if (!policy.modalidades.includes(input.modalidad)) throw new HttpError(409, 'Modalidad no permitida por la política');
  if (abiertos >= policy.cupo_total) throw new HttpError(409, 'El solicitante alcanzó su cupo total');
  const end = new Date(input.vencimiento);
  const maxHours = policy.duracion_cantidad * (policy.duracion_unidad === 'dias' ? 24 : 1);
  if (end <= now || end - now > maxHours * 3600000) throw new HttpError(400, 'El vencimiento debe ser futuro y respetar la duración máxima');
  if (!sameAccessories(unit.accesorios, input.accesorios_entrega)) throw new HttpError(400, 'Verifica todos los accesorios registrados; corrige el inventario antes de entregar si corresponde');
}
export function validateReturn(loan, input) {
  const missing = missingAccessories(loan.accesorios_entrega, input.accesorios_devolucion);
  if (missing.length && input.apta) throw new HttpError(400, 'Una devolución con accesorios faltantes no puede declararse apta');
  return missing;
}
export function matchesReturn(loan, unit, input) {
  return loan.devolucion_apta === input.apta && loan.destino_devolucion === input.estado_unidad
    && loan.condicion_devolucion === input.condicion_devolucion
    && sameAccessories(loan.accesorios_devolucion, input.accesorios_devolucion)
    && (loan.observaciones_devolucion ?? null) === (input.observaciones_devolucion ?? null)
    && (input.estado_unidad !== 'baja' || unit.motivo_baja === input.motivo_baja);
}
