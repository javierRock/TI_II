import { likePattern } from '../../shared/schemas.js';

const publicAccountColumns = 'id, persona_id, nombre_usuario, rol, activo, atribucion_admin, creado_en';

export async function listPeople(client, query) {
  const filter = likePattern(query.q);
  const where = 'WHERE nombre_completo ILIKE $1 OR documento ILIKE $1';
  const rows = await client.query(`SELECT id, documento, nombre_completo, correo, contacto, activo, creado_en
    FROM prestamos.personas ${where} ORDER BY id LIMIT $2 OFFSET $3`, [filter, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query(`SELECT count(*)::integer AS total FROM prestamos.personas ${where}`, [filter]);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}

export async function findPerson(client, id, { lock = false } = {}) {
  return (await client.query(`SELECT * FROM prestamos.personas WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
}
export async function findAccount(client, personId, { lock = false } = {}) {
  return (await client.query(`SELECT ${publicAccountColumns} FROM prestamos.usuarios WHERE persona_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [personId])).rows[0];
}
export async function profiles(client, userId) {
  return (await client.query('SELECT * FROM prestamos.perfiles_academicos WHERE usuario_id = $1 ORDER BY tipo', [userId])).rows;
}
export async function insertPerson(client, input) {
  return (await client.query(`INSERT INTO prestamos.personas (documento, nombre_completo, correo, contacto)
    VALUES ($1, $2, $3, $4) RETURNING *`, [input.documento, input.nombre_completo, input.correo, input.contacto ?? null])).rows[0];
}

export async function updatePerson(client, id, input, current) {
  const next = { ...current, ...input };
  return (await client.query(`UPDATE prestamos.personas SET nombre_completo = $2, correo = $3, contacto = $4
    WHERE id = $1 RETURNING *`, [id, next.nombre_completo, next.correo, next.contacto])).rows[0];
}
export async function setPersonState(client, id, active) {
  return (await client.query('UPDATE prestamos.personas SET activo = $2 WHERE id = $1 RETURNING *', [id, active])).rows[0];
}
export async function insertAccount(client, personId, input, hash) {
  return (await client.query(`INSERT INTO prestamos.usuarios (persona_id, nombre_usuario, password_hash, rol)
    VALUES ($1, $2, $3, $4) RETURNING ${publicAccountColumns}`, [personId, input.nombre_usuario, hash, input.rol])).rows[0];
}
export async function setAccountState(client, user, input) {
  const next = { ...user, ...input };
  return (await client.query(`UPDATE prestamos.usuarios SET activo = $2, rol = $3,
    atribucion_admin = CASE WHEN $3::varchar = 'estudiante' THEN false ELSE atribucion_admin END
    WHERE id = $1 RETURNING ${publicAccountColumns}`, [user.id, next.activo, next.rol])).rows[0];
}

export async function upsertProfile(client, userId, input) {
  return (await client.query(`INSERT INTO prestamos.perfiles_academicos
    (usuario_id, tipo, codigo, habilitado, plan_id, semestre, especialidad, vinculacion)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (usuario_id, tipo) DO UPDATE SET codigo = EXCLUDED.codigo, habilitado = EXCLUDED.habilitado,
      plan_id = EXCLUDED.plan_id, semestre = EXCLUDED.semestre, especialidad = EXCLUDED.especialidad, vinculacion = EXCLUDED.vinculacion
    RETURNING *`, [userId, input.tipo, input.codigo, input.habilitado,
    input.plan_id ?? null, input.semestre ?? null, input.especialidad ?? null, input.vinculacion ?? null])).rows[0];
}
export async function validSemester(client, planId, semester) {
  return (await client.query(`SELECT 1 FROM prestamos.semestres_plan s JOIN prestamos.planes_estudio p ON p.id = s.plan_id
    WHERE s.plan_id = $1 AND s.numero = $2 AND p.activo`, [planId, semester])).rowCount > 0;
}

export async function listPlans(client, query) {
  const filter = likePattern(query.q);
  const rows = await client.query(`SELECT p.*, COALESCE((SELECT jsonb_agg(s.numero ORDER BY s.numero)
      FROM prestamos.semestres_plan s WHERE s.plan_id = p.id), '[]'::jsonb) AS semestres
    FROM prestamos.planes_estudio p WHERE programa ILIKE $1 OR nombre ILIKE $1 OR codigo ILIKE $1
    ORDER BY p.id LIMIT $2 OFFSET $3`, [filter, query.limite, (query.pagina - 1) * query.limite]);
  const count = await client.query('SELECT count(*)::integer AS total FROM prestamos.planes_estudio WHERE programa ILIKE $1 OR nombre ILIKE $1 OR codigo ILIKE $1', [filter]);
  return { datos: rows.rows, total: count.rows[0].total, pagina: query.pagina, limite: query.limite };
}
export async function insertPlan(client, input) {
  const plan = (await client.query(`INSERT INTO prestamos.planes_estudio (codigo, programa, nombre)
    VALUES ($1, $2, $3) RETURNING *`, [input.codigo, input.programa, input.nombre])).rows[0];
  await client.query('INSERT INTO prestamos.semestres_plan (plan_id, numero) SELECT $1::bigint, unnest($2::smallint[])', [plan.id, input.semestres]);
  return { ...plan, semestres: [...input.semestres].sort((a, b) => a - b) };
}
