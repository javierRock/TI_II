export async function findLogin(c, username, { lock = false } = {}) {
  return (
    await c.query(
      `SELECT u.*,p.activo AS persona_activa,p.nombre_completo FROM usuarios u JOIN personas p ON p.id=u.persona_id
 WHERE u.nombre_usuario=? ${lock ? 'FOR UPDATE' : ''}`,
      [username],
    )
  ).rows[0];
}
export async function findSession(c, hash) {
  return (
    await c.query(
      `SELECT s.id AS sesion_id,s.expira_en,u.id AS usuario_id,u.persona_id,u.nombre_usuario,u.rol,u.atribucion_admin,p.nombre_completo
 FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id JOIN personas p ON p.id=u.persona_id
 WHERE s.token_hash=? AND s.revocada_en IS NULL AND s.expira_en>UTC_TIMESTAMP(6) AND u.activo AND p.activo`,
      [hash],
    )
  ).rows[0];
}
export async function createSession(c, id, hash, hours) {
  const r = await c.query(
    'INSERT INTO sesiones(usuario_id,token_hash,expira_en) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? HOUR))',
    [id, hash, hours],
  );
  return (await c.query('SELECT expira_en FROM sesiones WHERE id=?', [r.insertId])).rows[0];
}
export async function revokeSession(c, hash) {
  await c.query(
    'UPDATE sesiones SET revocada_en=UTC_TIMESTAMP(6) WHERE token_hash=? AND revocada_en IS NULL',
    [hash],
  );
}
export function publicUser(u) {
  return {
    id: u.usuario_id ?? u.id,
    persona_id: u.persona_id,
    nombre_usuario: u.nombre_usuario,
    nombre_completo: u.nombre_completo,
    rol: u.rol,
    atribucion_admin: u.atribucion_admin,
  };
}
