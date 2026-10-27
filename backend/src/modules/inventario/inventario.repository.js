import { likePattern } from '../../shared/schemas.js';
export async function listTypes(c) {
  return (await c.query('SELECT * FROM tipos_bien ORDER BY nombre')).rows;
}
export async function findType(c, id) {
  return (await c.query('SELECT * FROM tipos_bien WHERE id=?', [id])).rows[0];
}
export async function findGood(c, id, { lock = false } = {}) {
  return (
    await c.query(
      `SELECT b.*,t.codigo AS tipo_codigo FROM bienes b JOIN tipos_bien t ON t.id=b.tipo_id WHERE b.id=? ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    )
  ).rows[0];
}
export async function listGoods(c, q) {
  const f = likePattern(q.q),
    where = 'WHERE b.nombre LIKE ? AND (? IS NULL OR t.codigo=?)',
    values = [f, q.tipo ?? null, q.tipo ?? null];
  const from = 'FROM bienes b JOIN tipos_bien t ON t.id=b.tipo_id';
  return {
    datos: (
      await c.query(
        `SELECT b.*,t.codigo AS tipo_codigo,t.nombre AS tipo_nombre ${from} ${where} ORDER BY b.id LIMIT ? OFFSET ?`,
        [...values, q.limite, (q.pagina - 1) * q.limite],
      )
    ).rows,
    total: (await c.query(`SELECT COUNT(*) AS total ${from} ${where}`, values)).rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function listUnits(c, q) {
  const f = likePattern(q.q);
  const availabilityValues = [];
  let availability = `v.disponible AND NOT EXISTS (SELECT 1 FROM reservas r
    WHERE r.unidad_id=v.unidad_id AND r.estado='confirmada'
      AND r.inicio<=UTC_TIMESTAMP(6) AND r.fin>UTC_TIMESTAMP(6))`;
  if (q.inicio && q.fin) {
    availability = `v.estado NOT IN ('mantenimiento','baja') AND t.habilitado
      AND NOT EXISTS (SELECT 1 FROM reservas r WHERE r.unidad_id=v.unidad_id
        AND r.estado='confirmada' AND r.fin>UTC_TIMESTAMP(6) AND r.inicio<? AND r.fin>?)
      AND NOT EXISTS (SELECT 1 FROM prestamos p WHERE p.unidad_id=v.unidad_id
        AND p.estado_cierre='abierto' AND (p.vencimiento<=UTC_TIMESTAMP(6)
          OR (p.inicio<? AND p.vencimiento>?)))`;
    availabilityValues.push(
      new Date(q.fin),
      new Date(q.inicio),
      new Date(q.fin),
      new Date(q.inicio),
    );
  }
  // Calcular antes de filtrar: un intervalo ocupado sigue siendo consultable.
  // Solo se exponen columnas públicas; nunca el titular de la asignación.
  const from = `FROM (SELECT v.unidad_id,v.codigo_inventario,v.bien_id,v.nombre,
    v.tipo_codigo,v.tipo_nombre,v.ubicacion,v.estado,(${availability}) AS disponible
    FROM v_disponibilidad_actual v JOIN bienes b ON b.id=v.bien_id
    JOIN tipos_bien t ON t.id=b.tipo_id) catalogo`;
  const values = [
    ...availabilityValues,
    f,
    f,
    q.tipo ?? null,
    q.tipo ?? null,
    q.disponible ?? null,
    q.disponible ?? null,
  ];
  const where =
    'WHERE (nombre LIKE ? OR codigo_inventario LIKE ?) AND (? IS NULL OR tipo_codigo=?) AND (? IS NULL OR disponible=?)';
  return {
    datos: (
      await c.query(`SELECT * ${from} ${where} ORDER BY unidad_id LIMIT ? OFFSET ?`, [
        ...values,
        q.limite,
        (q.pagina - 1) * q.limite,
      ])
    ).rows,
    total: (await c.query(`SELECT COUNT(*) AS total ${from} ${where}`, values)).rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function findUnit(c, id, { lock = false } = {}) {
  return (
    await c.query(`SELECT * FROM unidades_inventario WHERE id=? ${lock ? 'FOR UPDATE' : ''}`, [id])
  ).rows[0];
}
export async function insertGood(c, v) {
  const r = await c.query(
    'INSERT INTO bienes(tipo_id,nombre,descripcion,autor,edicion,isbn,marca,modelo) VALUES (?,?,?,?,?,?,?,?)',
    [
      v.tipo_id,
      v.nombre,
      v.descripcion ?? null,
      v.autor ?? null,
      v.edicion ?? null,
      v.isbn ?? null,
      v.marca ?? null,
      v.modelo ?? null,
    ],
  );
  return findGood(c, r.insertId);
}
export async function updateGood(c, id, v, old) {
  const n = { ...old, ...v };
  await c.query(
    'UPDATE bienes SET nombre=?,descripcion=?,autor=?,edicion=?,isbn=?,marca=?,modelo=? WHERE id=?',
    [n.nombre, n.descripcion, n.autor, n.edicion, n.isbn, n.marca, n.modelo, id],
  );
  return findGood(c, id);
}
export async function insertUnit(c, v) {
  const r = await c.query(
    `INSERT INTO unidades_inventario(bien_id,codigo_inventario,custodia,adscrito_laboratorio,ubicacion,condicion_fisica,accesorios,estado,serie,marca,modelo,adquirido_en,observaciones)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      v.bien_id,
      v.codigo_inventario,
      v.custodia,
      v.adscrito_laboratorio,
      v.ubicacion,
      v.condicion_fisica,
      JSON.stringify(v.accesorios),
      v.estado,
      v.serie ?? null,
      v.marca ?? null,
      v.modelo ?? null,
      v.adquirido_en ?? null,
      v.observaciones ?? null,
    ],
  );
  return findUnit(c, r.insertId);
}
export async function updateUnit(c, id, v, old) {
  const n = { ...old, ...v };
  await c.query(
    'UPDATE unidades_inventario SET ubicacion=?,condicion_fisica=?,accesorios=?,adquirido_en=?,observaciones=? WHERE id=?',
    [
      n.ubicacion,
      n.condicion_fisica,
      JSON.stringify(n.accesorios),
      n.adquirido_en,
      n.observaciones,
      id,
    ],
  );
  return findUnit(c, id);
}
export async function setUnitState(c, id, v) {
  await c.query(
    "UPDATE unidades_inventario SET estado=?,baja_en=IF(?='baja',UTC_TIMESTAMP(6),NULL),motivo_baja=? WHERE id=?",
    [v.estado, v.estado, v.estado === 'baja' ? v.motivo : null, id],
  );
  return findUnit(c, id);
}
