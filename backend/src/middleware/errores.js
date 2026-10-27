export function errorHandler(error, _request, response, _next) {
  if (error.type === 'entity.parse.failed')
    return response.status(400).json({ error: 'JSON inválido' });
  if (error.type === 'entity.too.large')
    return response.status(413).json({ error: 'Solicitud demasiado grande' });
  if (error.status && error.status >= 400 && error.status < 500) {
    return response.status(error.status).json({
      error: error.message,
      codigo: error.code,
      ...(error.campos ? { campos: error.campos } : {}),
    });
  }
  const databaseErrors = {
    ER_DUP_ENTRY: [409, 'Documento, código o préstamo duplicado'],
    ER_NO_REFERENCED_ROW_2: [400, 'La referencia indicada no existe'],
    ER_ROW_IS_REFERENCED_2: [409, 'El registro tiene operaciones vinculadas'],
    ER_CHECK_CONSTRAINT_VIOLATED: [409, 'La operación incumple una regla de integridad'],
    ER_SIGNAL_EXCEPTION: [409, 'La operación viola una regla de negocio'],
    ER_LOCK_DEADLOCK: [409, 'Conflicto concurrente; vuelve a intentar'],
    ER_LOCK_WAIT_TIMEOUT: [409, 'Registro ocupado; vuelve a intentar'],
    23505: [409, 'Documento, código o identificador duplicado'],
    23503: [400, 'La referencia indicada no existe o tiene operaciones vinculadas'],
    23514: [409, 'La operación incumple una regla de integridad'],
    '23P01': [409, 'El intervalo entra en conflicto con otro registro'],
    '40P01': [409, 'Conflicto concurrente; vuelve a intentar la operación'],
    40001: [409, 'Conflicto concurrente; vuelve a intentar la operación'],
    '55P03': [409, 'Registro ocupado; vuelve a intentar la operación'],
  };
  if (databaseErrors[error.code]) {
    const [status, message] = databaseErrors[error.code];
    return response.status(status).json({ error: message, codigo: 'INTEGRIDAD_DATOS' });
  }
  // No registrar SQL, valores de entrada, hashes, cookies o contraseñas.
  console.error('Error de API', { code: error.code, name: error.name });
  const unavailable =
    error.code?.startsWith('08') || ['ECONNREFUSED', '57P01', 'ETIMEDOUT'].includes(error.code);
  response.status(unavailable ? 503 : 500).json({
    error: unavailable ? 'Servicio temporalmente no disponible' : 'Error interno del servicio',
  });
}
