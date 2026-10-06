export async function findLogin(client, username, { lock = false } = {}) {
  const result = await client.query(`SELECT u.id, u.persona_id, u.nombre_usuario, u.password_hash,
      u.rol, u.atribucion_admin, u.activo, p.activo AS persona_activa, p.nombre_completo
    FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
    WHERE lower(u.nombre_usuario) = lower($1) ${lock ? 'FOR UPDATE OF u' : ''}`, [username]);
  return result.rows[0];
}

export async function findSession(client, hash) {
  const result = await client.query(`SELECT s.id AS sesion_id, s.expira_en, u.id AS usuario_id,
      u.persona_id, u.nombre_usuario, u.rol, u.atribucion_admin, p.nombre_completo
    FROM prestamos.sesiones s JOIN prestamos.usuarios u ON u.id = s.usuario_id
    JOIN prestamos.personas p ON p.id = u.persona_id
    WHERE s.token_hash = $1 AND s.revocada_en IS NULL AND s.expira_en > clock_timestamp()
      AND u.activo AND p.activo`, [hash]);
  return result.rows[0];
}

export async function createSession(client, userId, hash, hours) {
  return (await client.query(`INSERT INTO prestamos.sesiones (usuario_id, token_hash, expira_en)
    VALUES ($1, $2, clock_timestamp() + make_interval(hours => $3::integer)) RETURNING expira_en`, [userId, hash, hours])).rows[0];
}

export async function revokeSession(client, hash) {
  await client.query('UPDATE prestamos.sesiones SET revocada_en = clock_timestamp() WHERE token_hash = $1 AND revocada_en IS NULL', [hash]);
}

export function publicUser(user) {
  return { id: user.usuario_id ?? user.id, persona_id: user.persona_id,
    nombre_usuario: user.nombre_usuario, nombre_completo: user.nombre_completo,
    rol: user.rol, atribucion_admin: user.atribucion_admin };
}
