import { HttpError } from '../../shared/errors.js';

export function validateGood(input, type) {
  if (!type.habilitado) throw new HttpError(409, 'El tipo de bien no está habilitado');
  const incompatible = type.codigo === 'libro' ? ['marca', 'modelo'] : ['autor', 'edicion', 'isbn'];
  if (incompatible.some((key) => input[key] != null)) throw new HttpError(400, 'Las características no corresponden al tipo de bien');
}
export function requireEditableUnit(unit) {
  if (unit.estado === 'prestada') throw new HttpError(409, 'Registra la devolución antes de modificar esta unidad');
  if (unit.estado === 'baja') throw new HttpError(409, 'La baja de una unidad es terminal');
}
export function validateSerial(input, good) {
  if (input.serie && (!(input.marca ?? good.marca) || !(input.modelo ?? good.modelo))) {
    throw new HttpError(400, 'Una serie requiere marca y modelo');
  }
}
