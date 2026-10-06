import { likePattern } from '../../shared/schemas.js';

export async function listTypes(client) {
  return (await client.query('SELECT id, codigo, nombre, descripcion, habilitado FROM prestamos.tipos_bien ORDER BY nombre')).rows;
}
export async function findType(client, id) {
  return (await client.query('SELECT * FROM prestamos.tipos_bien WHERE id = $1', [id])).rows[0];
}
export async function findGood(client, id, { lock = false } = {}) {
  return (await client.query(`SELECT b.*, t.codigo AS tipo_codigo FROM prestamos.bienes b
    JOIN prestamos.tipos_bien t ON t.id = b.tipo_id WHERE b.id = $1 ${lock ? 'FOR UPDATE OF b' : ''}`, [id])).rows[0];
}
export async function listGoods(client, query) {
  const values = [likePattern(query.q), query.tipo ?? null];
  const from = 'FROM prestamos.bienes b JOIN prestamos.tipos_bien t ON t.id = b.tipo_id';
  const where = 'WHERE b.nombre ILIKE $1 AND ($2::text IS NULL OR t.codigo = $2)';
  const rows = await client.query(`SELECT b.*, t.codigo AS tipo_codigo, t.nombre AS tipo_nombre ${from} ${where}
    ORDER BY b.id LIMIT $3 OFFSET $4`, [...values, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total ${from} ${where}`, values);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function listUnits(client, query) {
  const values = [likePattern(query.q), query.tipo ?? null, query.disponible ?? null];
  const where = `WHERE (nombre ILIKE $1 OR codigo_inventario ILIKE $1)
    AND ($2::text IS NULL OR tipo_codigo = $2) AND ($3::boolean IS NULL OR disponible = $3)`;
  const rows = await client.query(`SELECT * FROM prestamos.v_disponibilidad_actual ${where}
    ORDER BY unidad_id LIMIT $4 OFFSET $5`, [...values, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total FROM prestamos.v_disponibilidad_actual ${where}`, values);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function findUnit(client, id, { lock = false } = {}) {
  return (await client.query(`SELECT * FROM prestamos.unidades_inventario WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
}
export async function insertGood(client, input) {
  return (await client.query(`INSERT INTO prestamos.bienes (tipo_id, nombre, descripcion, autor, edicion, isbn, marca, modelo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
  [input.tipo_id, input.nombre, input.descripcion ?? null, input.autor ?? null, input.edicion ?? null,
    input.isbn ?? null, input.marca ?? null, input.modelo ?? null])).rows[0];
}
export async function updateGood(client, id, input, current) {
  const next = { ...current, ...input };
  return (await client.query(`UPDATE prestamos.bienes SET nombre = $2, descripcion = $3, autor = $4,
    edicion = $5, isbn = $6, marca = $7, modelo = $8 WHERE id = $1 RETURNING *`,
  [id, next.nombre, next.descripcion, next.autor, next.edicion, next.isbn, next.marca, next.modelo])).rows[0];
}
export async function insertUnit(client, input) {
  return (await client.query(`INSERT INTO prestamos.unidades_inventario
    (bien_id, codigo_inventario, custodia, adscrito_laboratorio, ubicacion, condicion_fisica, accesorios,
      estado, serie, marca, modelo, adquirido_en, observaciones)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13) RETURNING *`,
  [input.bien_id, input.codigo_inventario, input.custodia, input.adscrito_laboratorio, input.ubicacion,
    input.condicion_fisica, JSON.stringify(input.accesorios), input.estado, input.serie ?? null,
    input.marca ?? null, input.modelo ?? null, input.adquirido_en ?? null, input.observaciones ?? null])).rows[0];
}
export async function updateUnit(client, id, input, current) {
  const next = { ...current, ...input };
  return (await client.query(`UPDATE prestamos.unidades_inventario SET ubicacion = $2, condicion_fisica = $3,
    accesorios = $4::jsonb, adquirido_en = $5, observaciones = $6 WHERE id = $1 RETURNING *`,
  [id, next.ubicacion, next.condicion_fisica, JSON.stringify(next.accesorios), next.adquirido_en, next.observaciones])).rows[0];
}
export async function setUnitState(client, id, input) {
  return (await client.query(`UPDATE prestamos.unidades_inventario SET estado = $2,
    baja_en = CASE WHEN $2::varchar = 'baja' THEN clock_timestamp() ELSE NULL END,
    motivo_baja = $3 WHERE id = $1 RETURNING *`, [id, input.estado, input.motivo ?? null])).rows[0];
}
