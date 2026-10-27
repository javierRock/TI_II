import { likePattern } from '../../shared/schemas.js';
const columns = 'id,persona_id,nombre_usuario,rol,activo,atribucion_admin,creado_en';
export async function listPeople(c, q) {
  const filter = likePattern(q.q),
    where = 'WHERE nombre_completo LIKE ? OR documento LIKE ?';
  const rows = await c.query(`SELECT * FROM personas ${where} ORDER BY id LIMIT ? OFFSET ?`, [
    filter,
    filter,
    q.limite,
    (q.pagina - 1) * q.limite,
  ]);
  const count = await c.query(`SELECT COUNT(*) AS total FROM personas ${where}`, [filter, filter]);
  return {
    datos: rows.rows,
    total: count.rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function findPerson(c, id, { lock = false } = {}) {
  return (await c.query(`SELECT * FROM personas WHERE id=? ${lock ? 'FOR UPDATE' : ''}`, [id]))
    .rows[0];
}
export async function findAccount(c, id, { lock = false } = {}) {
  return (
    await c.query(
      `SELECT ${columns} FROM usuarios WHERE persona_id=? ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    )
  ).rows[0];
}
export async function profiles(c, id) {
  return (await c.query('SELECT * FROM perfiles_academicos WHERE usuario_id=? ORDER BY tipo', [id]))
    .rows;
}
export async function insertPerson(c, v) {
  const r = await c.query(
    'INSERT INTO personas(documento,nombre_completo,correo,contacto) VALUES (?,?,?,?)',
    [v.documento, v.nombre_completo, v.correo, v.contacto ?? null],
  );
  return findPerson(c, r.insertId);
}
export async function updatePerson(c, id, v, old) {
  const n = { ...old, ...v };
  await c.query('UPDATE personas SET nombre_completo=?,correo=?,contacto=? WHERE id=?', [
    n.nombre_completo,
    n.correo,
    n.contacto,
    id,
  ]);
  return findPerson(c, id);
}
export async function setPersonState(c, id, active) {
  await c.query('UPDATE personas SET activo=? WHERE id=?', [active, id]);
  return findPerson(c, id);
}
export async function insertAccount(c, person, v, hash) {
  await c.query(
    'INSERT INTO usuarios(persona_id,nombre_usuario,password_hash,rol) VALUES (?,?,?,?)',
    [person, v.nombre_usuario, hash, v.rol],
  );
  return findAccount(c, person);
}
export async function setAccountState(c, user, v) {
  const n = { ...user, ...v };
  await c.query(
    "UPDATE usuarios SET activo=?,rol=?,atribucion_admin=IF(?='estudiante',FALSE,atribucion_admin) WHERE id=?",
    [n.activo, n.rol, n.rol, user.id],
  );
  return findAccount(c, user.persona_id);
}
export async function upsertProfile(c, id, v) {
  const existing = (await profiles(c, id)).find((x) => x.tipo === v.tipo);
  const values = [
    v.codigo,
    v.habilitado,
    v.plan_id ?? null,
    v.semestre ?? null,
    v.especialidad ?? null,
    v.vinculacion ?? null,
  ];
  if (existing)
    await c.query(
      'UPDATE perfiles_academicos SET codigo=?,habilitado=?,plan_id=?,semestre=?,especialidad=?,vinculacion=? WHERE id=?',
      [...values, existing.id],
    );
  else
    await c.query(
      'INSERT INTO perfiles_academicos(usuario_id,tipo,codigo,habilitado,plan_id,semestre,especialidad,vinculacion) VALUES (?,?,?,?,?,?,?,?)',
      [id, v.tipo, ...values],
    );
  return (await profiles(c, id)).find((x) => x.tipo === v.tipo);
}
export async function validSemester(c, plan, semester) {
  return (
    (
      await c.query(
        'SELECT s.id FROM semestres_plan s JOIN planes_estudio p ON p.id=s.plan_id WHERE s.plan_id=? AND s.numero=? AND p.activo',
        [plan, semester],
      )
    ).rowCount > 0
  );
}
export async function listPlans(c, q) {
  const f = likePattern(q.q),
    where = 'WHERE programa LIKE ? OR nombre LIKE ? OR codigo LIKE ?';
  const r = await c.query(`SELECT * FROM planes_estudio ${where} ORDER BY id LIMIT ? OFFSET ?`, [
    f,
    f,
    f,
    q.limite,
    (q.pagina - 1) * q.limite,
  ]);
  for (const p of r.rows)
    p.semestres = (
      await c.query('SELECT numero FROM semestres_plan WHERE plan_id=? ORDER BY numero', [p.id])
    ).rows.map((x) => x.numero);
  return {
    datos: r.rows,
    total: (await c.query(`SELECT COUNT(*) AS total FROM planes_estudio ${where}`, [f, f, f]))
      .rows[0].total,
    pagina: q.pagina,
    limite: q.limite,
  };
}
export async function insertPlan(c, v) {
  const r = await c.query('INSERT INTO planes_estudio(codigo,programa,nombre) VALUES (?,?,?)', [
    v.codigo,
    v.programa,
    v.nombre,
  ]);
  for (const semester of v.semestres)
    await c.query('INSERT INTO semestres_plan(plan_id,numero) VALUES (?,?)', [
      r.insertId,
      semester,
    ]);
  return { id: r.insertId, ...v };
}
