import { HttpError } from '../../shared/errors.js';
const state =
  "CASE WHEN aprobada_en IS NULL THEN 'borrador' WHEN vigencia_inicio>UTC_TIMESTAMP(6) THEN 'programada' WHEN vigencia_fin<=UTC_TIMESTAMP(6) THEN 'expirada' ELSE 'vigente' END";
export async function lockScopes(c, roles, { shared = false } = {}) {
  for (const scope of [...new Set(roles.map((r) => r ?? 'general'))].sort())
    await c.query(
      `SELECT nombre FROM alcances_politica WHERE nombre=? ${shared ? 'FOR SHARE' : 'FOR UPDATE'}`,
      [scope],
    );
}
export async function listPolicies(c, q) {
  const values = [q.rol ?? null, q.rol ?? null, q.estado ?? null, q.estado ?? null];
  const where = `WHERE (? IS NULL OR alcance=?) AND (? IS NULL OR (${state})=?)`;
  return {
    datos: (
      await c.query(
        `SELECT *,${state} AS estado FROM politicas_prestamo ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...values, q.limite, (q.pagina - 1) * q.limite],
      )
    ).rows,
    total: (await c.query(`SELECT COUNT(*) AS total FROM politicas_prestamo ${where}`, values))
      .rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function findPolicy(c, id, { lock = false } = {}) {
  return (
    await c.query(
      `SELECT *,${state} AS estado FROM politicas_prestamo WHERE id=? ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    )
  ).rows[0];
}
const values = (v) => [
  v.nombre,
  new Date(v.vigencia_inicio),
  v.vigencia_fin ? new Date(v.vigencia_fin) : null,
  v.cupo_total,
  v.duracion_cantidad,
  v.duracion_unidad,
  JSON.stringify(v.modalidades),
  v.tolerancia_horas,
];
export async function insertPolicy(c, v) {
  const version = (
    await c.query(
      'SELECT COALESCE(MAX(version),0)+1 AS version FROM politicas_prestamo WHERE rol<=>?',
      [v.rol],
    )
  ).rows[0].version;
  const r = await c.query(
    `INSERT INTO politicas_prestamo(nombre,vigencia_inicio,vigencia_fin,cupo_total,duracion_cantidad,duracion_unidad,modalidades,tolerancia_horas,rol,version) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [...values(v), v.rol, version],
  );
  return findPolicy(c, r.insertId);
}
export async function updateDraft(c, id, v) {
  await c.query(
    'UPDATE politicas_prestamo SET nombre=?,vigencia_inicio=?,vigencia_fin=?,cupo_total=?,duracion_cantidad=?,duracion_unidad=?,modalidades=?,tolerancia_horas=? WHERE id=?',
    [...values(v), id],
  );
  return findPolicy(c, id);
}
export async function approvePolicy(c, id, actor) {
  const p = await findPolicy(c, id);
  const conflicts = await c.query(
    `SELECT id FROM politicas_prestamo WHERE rol<=>? AND id<>? AND aprobada_en IS NOT NULL
 AND (vigencia_fin IS NULL OR vigencia_fin>?) AND (? IS NULL OR vigencia_inicio<?)`,
    [p.rol, id, p.vigencia_inicio, p.vigencia_fin, p.vigencia_fin],
  );
  if (conflicts.rowCount) throw new HttpError(409, 'Se solapan vigencias de políticas');
  await c.query(
    'UPDATE politicas_prestamo SET aprobada_en=UTC_TIMESTAMP(6),aprobada_por=? WHERE id=?',
    [actor, id],
  );
  return findPolicy(c, id);
}
export async function endValidity(c, id, end) {
  await c.query('UPDATE politicas_prestamo SET vigencia_fin=? WHERE id=?', [new Date(end), id]);
  return findPolicy(c, id);
}
export async function dbNow(c) {
  return (await c.query('SELECT UTC_TIMESTAMP(6) AS ahora')).rows[0].ahora;
}
export async function applicablePolicy(c, role, now) {
  return (
    await c.query(
      `SELECT * FROM politicas_prestamo WHERE aprobada_en<=? AND (rol=? OR rol IS NULL)
 AND vigencia_inicio<=? AND (vigencia_fin IS NULL OR vigencia_fin>?) ORDER BY rol IS NULL LIMIT 1 FOR SHARE`,
      [now, role, now, now],
    )
  ).rows[0];
}
