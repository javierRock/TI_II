const state = `CASE WHEN aprobada_en IS NULL THEN 'borrador'
  WHEN vigencia_inicio > clock_timestamp() THEN 'programada'
  WHEN vigencia_fin IS NOT NULL AND vigencia_fin <= clock_timestamp() THEN 'expirada' ELSE 'vigente' END`;

export async function lockScopes(client, roles, { shared = false } = {}) {
  const lock = shared ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock';
  for (const scope of [...new Set(roles.map((rol) => rol ?? 'general'))].sort()) {
    await client.query(`SELECT ${lock}(hashtext('prestamos.politicas'), hashtext($1))`, [scope]);
  }
}
export async function listPolicies(client, query) {
  const where = `WHERE ($1::text IS NULL OR COALESCE(rol, 'general') = $1) AND ($2::text IS NULL OR (${state}) = $2)`;
  const rows = await client.query(`SELECT *, ${state} AS estado FROM prestamos.politicas_prestamo ${where}
    ORDER BY id DESC LIMIT $3 OFFSET $4`, [query.rol ?? null, query.estado ?? null, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total FROM prestamos.politicas_prestamo ${where}`, [query.rol ?? null, query.estado ?? null]);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function findPolicy(client, id, { lock = false } = {}) {
  return (await client.query(`SELECT *, ${state} AS estado FROM prestamos.politicas_prestamo WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
}
const values = (input) => [input.nombre, input.vigencia_inicio, input.vigencia_fin ?? null, input.cupo_total,
  input.duracion_cantidad, input.duracion_unidad, input.modalidades, input.tolerancia_horas];
export async function insertPolicy(client, input) {
  return (await client.query(`INSERT INTO prestamos.politicas_prestamo
    (nombre, vigencia_inicio, vigencia_fin, cupo_total, duracion_cantidad, duracion_unidad, modalidades, tolerancia_horas, rol, version)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar,
      (SELECT COALESCE(max(version), 0) + 1 FROM prestamos.politicas_prestamo WHERE rol IS NOT DISTINCT FROM $9::varchar)) RETURNING *`,
  [...values(input), input.rol])).rows[0];
}
export async function updateDraft(client, id, input) {
  return (await client.query(`UPDATE prestamos.politicas_prestamo SET nombre = $1, vigencia_inicio = $2,
    vigencia_fin = $3, cupo_total = $4, duracion_cantidad = $5, duracion_unidad = $6,
    modalidades = $7, tolerancia_horas = $8 WHERE id = $9 RETURNING *`, [...values(input), id])).rows[0];
}
export async function approvePolicy(client, id, actorId) {
  await client.query('UPDATE prestamos.politicas_prestamo SET aprobada_en = clock_timestamp(), aprobada_por = $2 WHERE id = $1', [id, actorId]);
  return findPolicy(client, id);
}
export async function endValidity(client, id, end) {
  await client.query('UPDATE prestamos.politicas_prestamo SET vigencia_fin = $2 WHERE id = $1', [id, end]);
  return findPolicy(client, id);
}
export async function dbNow(client) {
  return (await client.query('SELECT clock_timestamp() AS ahora')).rows[0].ahora;
}
export async function applicablePolicy(client, role, now) {
  return (await client.query(`SELECT * FROM prestamos.politicas_prestamo WHERE aprobada_en IS NOT NULL
    AND aprobada_en <= $2::timestamptz AND (rol = $1 OR rol IS NULL)
    AND tstzrange(vigencia_inicio, vigencia_fin, '[)') @> $2::timestamptz
    ORDER BY rol NULLS LAST LIMIT 1 FOR SHARE`, [role, now])).rows[0];
}
