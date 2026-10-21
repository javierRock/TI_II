const from = `FROM prestamos.v_reservas_estado r
  JOIN prestamos.unidades_inventario u ON u.id = r.unidad_id
  JOIN prestamos.bienes b ON b.id = u.bien_id
  LEFT JOIN prestamos.prestamos p ON p.reserva_id = r.id`;
const columns = 'r.*, u.codigo_inventario, b.nombre AS bien_nombre, p.id AS prestamo_id';

export async function listReservations(client, query, userId = null) {
  const values = [userId, query.estado ?? null, query.unidad_id ?? null];
  const where = `WHERE ($1::bigint IS NULL OR r.solicitante_id = $1)
    AND ($2::text IS NULL OR r.estado_actual = $2) AND ($3::bigint IS NULL OR r.unidad_id = $3)`;
  const rows = await client.query(`SELECT ${columns} ${from} ${where}
    ORDER BY r.inicio DESC, r.id DESC LIMIT $4 OFFSET $5`, [...values, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total ${from} ${where}`, values);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function reservationDetail(client, id, userId = null) {
  return (await client.query(`SELECT ${columns} ${from} WHERE r.id = $1
    AND ($2::bigint IS NULL OR r.solicitante_id = $2)`, [id, userId])).rows[0];
}
export async function lockReservation(client, id) {
  return (await client.query('SELECT * FROM prestamos.reservas WHERE id = $1 FOR UPDATE', [id])).rows[0];
}
export async function insertReservation(client, userId, input) {
  return (await client.query(`INSERT INTO prestamos.reservas (solicitante_id, unidad_id, inicio, fin, modalidad, observaciones)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [userId, input.unidad_id, input.inicio, input.fin, input.modalidad, input.observaciones ?? null])).rows[0];
}
export async function decideReservation(client, id, actorId, state, reason = null) {
  await client.query(`UPDATE prestamos.reservas SET estado = $2, decidido_por = $3,
    decidido_en = clock_timestamp(), motivo = $4 WHERE id = $1`, [id, state, actorId, reason]);
}
// Solo informa disponibilidad física. La confirmación valida además elegibilidad,
// política y cupo en la transacción; nunca expone al titular de otros compromisos.
export async function availability(client, input) {
  return (await client.query(`SELECT u.id AS unidad_id,
    (u.estado = 'disponible' AND t.habilitado
      AND NOT EXISTS (SELECT 1 FROM prestamos.prestamos p WHERE p.unidad_id = u.id AND p.estado_cierre = 'abierto')
      AND NOT EXISTS (SELECT 1 FROM prestamos.reservas r WHERE r.unidad_id = u.id AND r.estado = 'confirmada'
        AND tstzrange(r.inicio, r.fin, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)'))) AS disponible
    FROM prestamos.unidades_inventario u JOIN prestamos.bienes b ON b.id = u.bien_id
    JOIN prestamos.tipos_bien t ON t.id = b.tipo_id WHERE u.id = $1`, [input.unidad_id, input.inicio, input.fin])).rows[0];
}
