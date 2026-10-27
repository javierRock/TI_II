export async function findBorrower(c, id) {
  return (
    await c.query(
      `SELECT u.id,u.rol,u.activo,p.activo AS persona_activa,
 EXISTS(SELECT 1 FROM perfiles_academicos pa LEFT JOIN planes_estudio pe ON pe.id=pa.plan_id WHERE pa.usuario_id=u.id AND pa.tipo=u.rol AND pa.habilitado AND (pa.tipo='docente' OR pe.activo)) AS perfil_habilitado
 FROM usuarios u JOIN personas p ON p.id=u.persona_id WHERE u.id=?`,
      [id],
    )
  ).rows[0];
}
export async function lockUnit(c, id) {
  return (
    await c.query(
      `SELECT u.*,t.habilitado AS tipo_habilitado FROM unidades_inventario u JOIN bienes b ON b.id=u.bien_id JOIN tipos_bien t ON t.id=b.tipo_id WHERE u.id=? FOR UPDATE`,
      [id],
    )
  ).rows[0];
}
export async function openCount(c, id) {
  return (
    await c.query(
      "SELECT COUNT(*) AS total FROM prestamos WHERE solicitante_id=? AND estado_cierre='abierto'",
      [id],
    )
  ).rows[0].total;
}
export async function insertLoan(c, actor, v) {
  const p = v.politica;
  if (!p) throw new Error('La entrega exige condiciones de política resueltas en la transacción');
  const r = await c.query(
    `INSERT INTO prestamos(solicitante_id,autorizado_por,unidad_id,reserva_id,inicio,vencimiento,modalidad,condicion_entrega,accesorios_entrega,observaciones_entrega,
 politica_condiciones_id,politica_cupo_id,rol_origen,cupo_aplicado,duracion_max_horas,tolerancia_horas)
 VALUES (?,?,?,?,UTC_TIMESTAMP(6),?,?,?,?,?,?,?,?,?,?,?)`,
    [
      v.solicitante_id,
      actor,
      v.unidad_id,
      v.reserva_id ?? null,
      new Date(v.vencimiento),
      v.modalidad,
      v.condicion_entrega,
      JSON.stringify(v.accesorios_entrega),
      v.observaciones_entrega ?? null,
      p.id,
      p.id,
      v.rol_origen,
      p.cupo_total,
      p.duracion_cantidad * (p.duracion_unidad === 'dias' ? 24 : 1),
      p.tolerancia_horas,
    ],
  );
  await c.query("UPDATE unidades_inventario SET estado='prestada',condicion_fisica=? WHERE id=?", [
    v.condicion_entrega,
    v.unidad_id,
  ]);
  return loanRecord(c, r.insertId);
}
const joins =
  'FROM v_prestamos_estado p JOIN unidades_inventario u ON u.id=p.unidad_id JOIN bienes b ON b.id=u.bien_id JOIN tipos_bien t ON t.id=b.tipo_id';
const columns = 'p.*,u.codigo_inventario,b.nombre AS bien_nombre,t.codigo AS tipo_codigo';
export async function listLoans(c, q, { userId = null, admin = false } = {}) {
  const clauses = [],
    values = [];
  for (const [col, value] of [
    ['solicitante_id', userId ?? q.solicitante_id],
    ['unidad_id', q.unidad_id],
    ['estado', q.estado],
  ])
    if (value) {
      clauses.push(`p.${col}=?`);
      values.push(value);
    }
  if (q.desde) {
    clauses.push('p.inicio>=?');
    values.push(new Date(q.desde));
  }
  if (q.hasta) {
    clauses.push('p.inicio<?');
    values.push(new Date(q.hasta));
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const people = admin
    ? 'JOIN usuarios su ON su.id=p.solicitante_id JOIN personas sp ON sp.id=su.persona_id'
    : '';
  return {
    datos: (
      await c.query(
        `SELECT ${columns}${admin ? ',sp.nombre_completo AS solicitante_nombre' : ''} ${joins} ${people} ${where} ORDER BY p.inicio DESC,p.id DESC LIMIT ? OFFSET ?`,
        [...values, q.limite, (q.pagina - 1) * q.limite],
      )
    ).rows,
    total: (await c.query(`SELECT COUNT(*) AS total ${joins} ${where}`, values)).rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function loanDetail(c, id, { userId = null } = {}) {
  return (
    await c.query(`SELECT ${columns} ${joins} WHERE p.id=? AND (? IS NULL OR p.solicitante_id=?)`, [
      id,
      userId,
      userId,
    ])
  ).rows[0];
}
export async function loanRecord(c, id, { lock = false } = {}) {
  return (await c.query(`SELECT * FROM prestamos WHERE id=? ${lock ? 'FOR UPDATE' : ''}`, [id]))
    .rows[0];
}
export async function closeLoan(c, id, actor, v) {
  await c.query(
    `UPDATE prestamos SET estado_cierre='devuelto',devolucion_en=UTC_TIMESTAMP(6),recibido_por=?,condicion_devolucion=?,accesorios_devolucion=?,observaciones_devolucion=?,devolucion_apta=?,destino_devolucion=? WHERE id=?`,
    [
      actor,
      v.condicion_devolucion,
      JSON.stringify(v.accesorios_devolucion),
      v.observaciones_devolucion ?? null,
      v.apta,
      v.estado_unidad,
      id,
    ],
  );
}
export async function receiveUnit(c, id, v) {
  await c.query(
    "UPDATE unidades_inventario SET estado=?,condicion_fisica=?,accesorios=?,baja_en=IF(?='baja',UTC_TIMESTAMP(6),NULL),motivo_baja=? WHERE id=?",
    [
      v.estado_unidad,
      v.condicion_devolucion,
      JSON.stringify(v.accesorios_devolucion),
      v.estado_unidad,
      v.motivo_baja ?? null,
      id,
    ],
  );
}
