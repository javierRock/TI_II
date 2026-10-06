import { withTransaction } from './transaction.js';
import { tokenHash } from '../core/seguridad.js';
import { HttpError } from '../shared/errors.js';

export function actorTransaction(pool, auth, operation, { admin = true, lockUserIds = [] } = {}) {
  return withTransaction(pool, async (client) => {
    // Entregas/devoluciones bloquean todas sus cuentas en orden numérico.
    // Evitar adquirir primero al actor y después a un solicitante de id menor.
    if (lockUserIds.length) {
      await client.query('SELECT id FROM prestamos.usuarios WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
        [[auth.usuario_id, ...lockUserIds]]);
    }
    // Revalidar al escribir: el middleware pudo ejecutarse antes de una revocación.
    const result = await client.query(`SELECT u.id, u.rol, u.atribucion_admin
      FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
      JOIN prestamos.sesiones s ON s.usuario_id = u.id
      WHERE u.id = $1 AND u.activo AND p.activo AND s.token_hash = $2
        AND s.revocada_en IS NULL AND s.expira_en > clock_timestamp()
      FOR UPDATE OF u, s`, [auth.usuario_id, tokenHash(auth.token)]);
    const actor = result.rows[0];
    if (!actor) throw new HttpError(401, 'Sesión inválida o vencida', 'NO_AUTENTICADO');
    if (admin && (!actor.atribucion_admin || actor.rol === 'estudiante')) throw new HttpError(403, 'Se requiere atribución administrativa', 'SIN_PERMISO');
    await client.query("SELECT set_config('app.actor_usuario_id', $1, true)", [actor.id]);
    return operation(client);
  });
}
