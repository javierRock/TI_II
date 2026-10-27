import { withTransaction } from './transaction.js';
import { tokenHash } from '../core/seguridad.js';
import { HttpError } from '../shared/errors.js';

export function actorTransaction(pool, auth, operation, { admin = true, lockUserIds = [] } = {}) {
  return withTransaction(pool, async (client) => {
    const ids = [...new Set([auth.usuario_id, ...lockUserIds])].sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : 1,
    );
    for (const id of ids)
      await client.query('SELECT id FROM usuarios WHERE id = ? FOR UPDATE', [id]);
    const { rows } = await client.query(
      `SELECT u.id, u.rol, u.atribucion_admin FROM usuarios u
      JOIN personas p ON p.id=u.persona_id JOIN sesiones s ON s.usuario_id=u.id
      WHERE u.id=? AND u.activo AND p.activo AND s.token_hash=?
      AND s.revocada_en IS NULL AND s.expira_en>UTC_TIMESTAMP(6) FOR UPDATE`,
      [auth.usuario_id, tokenHash(auth.token)],
    );
    if (!rows[0]) throw new HttpError(401, 'Sesión inválida o vencida');
    if (admin && (!rows[0].atribucion_admin || rows[0].rol === 'estudiante'))
      throw new HttpError(403, 'Se requiere atribución administrativa');
    await client.query('SET @actor_usuario_id = ?', [rows[0].id]);
    return operation(client);
  });
}
