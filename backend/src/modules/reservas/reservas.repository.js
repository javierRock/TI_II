export async function findReservation(c, id, { lock = false } = {}) {
  return (await c.query(`SELECT * FROM reservas WHERE id=? ${lock ? 'FOR UPDATE' : ''}`, [id]))
    .rows[0];
}
export async function expire(c) {
  await c.query("SET @actor_usuario_id=NULL,@actor_proceso='proceso:expirar_reservas'");
  await c.query(
    "UPDATE reservas SET estado='vencida' WHERE estado IN ('pendiente','confirmada') AND fin<=UTC_TIMESTAMP(6)",
  );
}
export async function listReservations(c, q, userId = null) {
  const values = [],
    parts = [];
  if (userId) {
    parts.push('r.solicitante_id=?');
    values.push(userId);
  }
  if (q.estado) {
    parts.push('r.estado=?');
    values.push(q.estado);
  }
  const from = `FROM (SELECT reservas.*,CASE WHEN estado IN ('pendiente','confirmada') AND fin<=UTC_TIMESTAMP(6) THEN 'vencida' ELSE estado END AS estado_actual FROM reservas) r
 JOIN unidades_inventario u ON u.id=r.unidad_id JOIN bienes b ON b.id=u.bien_id JOIN usuarios us ON us.id=r.solicitante_id JOIN personas pe ON pe.id=us.persona_id`;
  const where = parts.length
    ? 'WHERE ' + parts.join(' AND ').replace('r.estado=?', 'r.estado_actual=?')
    : '';
  const rows = (
    await c.query(
      `SELECT r.*,r.estado_actual AS estado,u.codigo_inventario,b.nombre AS bien_nombre,pe.nombre_completo AS solicitante_nombre ${from} ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...values, q.limite, (q.pagina - 1) * q.limite],
    )
  ).rows;
  return {
    datos: rows,
    total: (await c.query(`SELECT COUNT(*) AS total ${from} ${where}`, values)).rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function cancelAffected(c, unitId, actor, reason) {
  await c.query(
    "UPDATE reservas SET estado='cancelada',cancelada_por=?,cancelada_en=UTC_TIMESTAMP(6),motivo_cancelacion=? WHERE unidad_id=? AND estado IN ('pendiente','confirmada') AND fin>UTC_TIMESTAMP(6)",
    [actor, reason, unitId],
  );
}
