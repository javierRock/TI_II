export class HttpError extends Error {
  constructor(status, message, code = 'OPERACION_RECHAZADA') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireRecord(record, message = 'Registro no encontrado') {
  if (!record) throw new HttpError(404, message, 'NO_ENCONTRADO');
  return record;
}
