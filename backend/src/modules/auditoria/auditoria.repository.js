export async function recordEvent(
  c,
  { actorId = null, proceso = null, entidad, entidadId, accion, resultado = 'exito', detalle = {} },
) {
  await c.query(
    'INSERT INTO eventos_historial(actor_usuario_id,actor_proceso,entidad,entidad_id,accion,resultado,detalle) VALUES (?,?,?,?,?,?,?)',
    [actorId, proceso, entidad, String(entidadId), accion, resultado, JSON.stringify(detalle)],
  );
}
export async function listEvents(c, q) {
  const values = [],
    clauses = [];
  for (const key of ['entidad', 'entidad_id', 'actor_usuario_id', 'accion', 'resultado'])
    if (q[key]) {
      clauses.push(`${key}=?`);
      values.push(q[key]);
    }
  if (q.desde) {
    clauses.push('creado_en>=?');
    values.push(new Date(q.desde));
  }
  if (q.hasta) {
    clauses.push('creado_en<?');
    values.push(new Date(q.hasta));
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  return {
    datos: (
      await c.query(
        `SELECT * FROM eventos_historial ${where} ORDER BY creado_en DESC,id DESC LIMIT ? OFFSET ?`,
        [...values, q.limite, (q.pagina - 1) * q.limite],
      )
    ).rows,
    total: (await c.query(`SELECT COUNT(*) AS total FROM eventos_historial ${where}`, values))
      .rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function findEvent(c, id) {
  return (await c.query('SELECT * FROM eventos_historial WHERE id=?', [id])).rows[0];
}
