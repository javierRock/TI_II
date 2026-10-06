export async function findBorrower(client, id) {
  return (await client.query(`SELECT u.id, u.rol, u.activo, p.activo AS persona_activa,
    EXISTS (SELECT 1 FROM prestamos.perfiles_academicos pa LEFT JOIN prestamos.planes_estudio pe ON pe.id = pa.plan_id
      WHERE pa.usuario_id = u.id AND pa.tipo = u.rol AND pa.habilitado
        AND (pa.tipo = 'docente' OR pe.activo)) AS perfil_habilitado
    FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id WHERE u.id = $1`, [id])).rows[0];
}
export async function lockUnit(client, id) {
  return (await client.query(`SELECT u.*, t.habilitado AS tipo_habilitado
    FROM prestamos.unidades_inventario u JOIN prestamos.bienes b ON b.id = u.bien_id
    JOIN prestamos.tipos_bien t ON t.id = b.tipo_id WHERE u.id = $1 FOR UPDATE OF u`, [id])).rows[0];
}
export async function openCount(client, userId) {
  return (await client.query("SELECT count(*)::integer AS total FROM prestamos.prestamos WHERE solicitante_id = $1 AND estado_cierre = 'abierto'", [userId])).rows[0].total;
}
export async function insertLoan(client, actorId, input) {
  const result = await client.query(`INSERT INTO prestamos.prestamos
    (solicitante_id, autorizado_por, unidad_id, inicio, vencimiento, modalidad, condicion_entrega, accesorios_entrega, observaciones_entrega)
    VALUES ($1, $2, $3, clock_timestamp(), $4, $5, $6, $7::jsonb, $8) RETURNING *`,
  [input.solicitante_id, actorId, input.unidad_id, input.vencimiento, input.modalidad, input.condicion_entrega,
    JSON.stringify(input.accesorios_entrega), input.observaciones_entrega ?? null]);
  await client.query("UPDATE prestamos.unidades_inventario SET estado = 'prestada', condicion_fisica = $2 WHERE id = $1", [input.unidad_id, input.condicion_entrega]);
  return result.rows[0];
}

const joins = `FROM prestamos.v_prestamos_estado p JOIN prestamos.unidades_inventario u ON u.id = p.unidad_id
  JOIN prestamos.bienes b ON b.id = u.bien_id JOIN prestamos.tipos_bien t ON t.id = b.tipo_id`;
const columns = 'p.*, u.codigo_inventario, b.nombre AS bien_nombre, t.codigo AS tipo_codigo';
export async function listLoans(client, query, { userId = null, admin = false } = {}) {
  const values = [userId ?? query.solicitante_id ?? null, query.unidad_id ?? null, query.estado ?? null, query.desde ?? null, query.hasta ?? null];
  const where = `WHERE ($1::bigint IS NULL OR p.solicitante_id = $1) AND ($2::bigint IS NULL OR p.unidad_id = $2)
    AND ($3::text IS NULL OR p.estado = $3) AND ($4::timestamptz IS NULL OR p.inicio >= $4)
    AND ($5::timestamptz IS NULL OR p.inicio < $5)`;
  const people = admin ? 'JOIN prestamos.usuarios su ON su.id = p.solicitante_id JOIN prestamos.personas sp ON sp.id = su.persona_id' : '';
  const rows = await client.query(`SELECT ${columns} ${admin ? ', sp.nombre_completo AS solicitante_nombre' : ''}
    ${joins} ${people} ${where} ORDER BY p.inicio DESC, p.id DESC LIMIT $6 OFFSET $7`,
  [...values, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total ${joins} ${where}`, values);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function loanDetail(client, id, { userId = null } = {}) {
  return (await client.query(`SELECT ${columns} ${joins}
    WHERE p.id = $1 AND ($2::bigint IS NULL OR p.solicitante_id = $2)`, [id, userId])).rows[0];
}
export async function loanRecord(client, id, { lock = false } = {}) {
  return (await client.query(`SELECT * FROM prestamos.prestamos WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
}
export async function closeLoan(client, id, actorId, input) {
  await client.query(`UPDATE prestamos.prestamos SET estado_cierre = 'devuelto', devolucion_en = clock_timestamp(),
    recibido_por = $2, condicion_devolucion = $3, accesorios_devolucion = $4::jsonb,
    observaciones_devolucion = $5, devolucion_apta = $6, destino_devolucion = $7 WHERE id = $1`,
  [id, actorId, input.condicion_devolucion, JSON.stringify(input.accesorios_devolucion),
    input.observaciones_devolucion ?? null, input.apta, input.estado_unidad]);
}
export async function receiveUnit(client, unitId, input) {
  await client.query(`UPDATE prestamos.unidades_inventario SET estado = $2, condicion_fisica = $3,
    accesorios = $4::jsonb, baja_en = CASE WHEN $2::varchar = 'baja' THEN clock_timestamp() ELSE NULL END,
    motivo_baja = $5 WHERE id = $1`,
  [unitId, input.estado_unidad, input.condicion_devolucion, JSON.stringify(input.accesorios_devolucion), input.motivo_baja ?? null]);
}
