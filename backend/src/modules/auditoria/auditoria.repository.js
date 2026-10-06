export async function recordEvent(client, { actorId = null, proceso = null, entidad, entidadId, accion, resultado = 'exito', detalle = {} }) {
  await client.query(`INSERT INTO prestamos.eventos_historial
    (actor_usuario_id, actor_proceso, entidad, entidad_id, accion, resultado, detalle)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
  [actorId, proceso, entidad, String(entidadId), accion, resultado, JSON.stringify(detalle)]);
}

export async function listEvents(client, query) {
  const values = [query.entidad ?? null, query.entidad_id ?? null, query.actor_usuario_id ?? null,
    query.accion ?? null, query.resultado ?? null, query.desde ?? null, query.hasta ?? null];
  const where = `WHERE ($1::text IS NULL OR entidad = $1) AND ($2::text IS NULL OR entidad_id = $2)
    AND ($3::bigint IS NULL OR actor_usuario_id = $3) AND ($4::text IS NULL OR accion = $4)
    AND ($5::text IS NULL OR resultado = $5) AND ($6::timestamptz IS NULL OR creado_en >= $6)
    AND ($7::timestamptz IS NULL OR creado_en < $7)`;
  const result = await client.query(`SELECT * FROM prestamos.eventos_historial ${where}
    ORDER BY creado_en DESC, id DESC LIMIT $8 OFFSET $9`, [...values, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total FROM prestamos.eventos_historial ${where}`, values);
  return { datos: result.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}

export async function findEvent(client, id) {
  return (await client.query('SELECT * FROM prestamos.eventos_historial WHERE id = $1', [id])).rows[0];
}
