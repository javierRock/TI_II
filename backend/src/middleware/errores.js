export function errorHandler(error, _request, response, _next) {
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'JSON inválido' });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Solicitud demasiado grande' });
  if (error.status && error.status >= 400 && error.status < 500) {
    return response.status(error.status).json({ error: error.message, codigo: error.code, ...(error.campos ? { campos: error.campos } : {}) });
  }
  const databaseErrors = {
    '23505': [409, 'Documento, código o identificador duplicado'],
    '23503': [400, 'La referencia indicada no existe o tiene operaciones vinculadas'],
    '23514': [409, 'La operación incumple una regla de integridad'],
    '23P01': [409, 'El intervalo entra en conflicto con otro registro'],
    '40P01': [409, 'Conflicto concurrente; vuelve a intentar la operación'],
    '40001': [409, 'Conflicto concurrente; vuelve a intentar la operación'],
    '55P03': [409, 'Registro ocupado; vuelve a intentar la operación'],
  };
  if (databaseErrors[error.code]) {
    const [status, message] = databaseErrors[error.code];
    return response.status(status).json({ error: message, codigo: 'INTEGRIDAD_DATOS' });
  }
  // No registrar SQL, valores de entrada, hashes, cookies o contraseñas.
  console.error('Error de API', { code: error.code, name: error.name });
  const unavailable = error.code?.startsWith('08') || ['ECONNREFUSED', '57P01', 'ETIMEDOUT'].includes(error.code);
  response.status(unavailable ? 503 : 500).json({ error: unavailable ? 'Servicio temporalmente no disponible' : 'Error interno del servicio' });
}
