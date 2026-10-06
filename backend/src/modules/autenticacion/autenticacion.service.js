import { withTransaction } from '../../db/transaction.js';
import { actorTransaction } from '../../db/actor-transaction.js';
import { HttpError } from '../../shared/errors.js';
import { sessionToken, tokenHash, csrfToken, verifyPassword, validToken } from '../../core/seguridad.js';
import { recordEvent } from '../auditoria/auditoria.repository.js';
import { findLogin, createSession, revokeSession, publicUser } from './autenticacion.repository.js';

export async function login(pool, input, oldToken, hours) {
  const candidate = await findLogin(pool, input.nombre_usuario);
  const verified = await verifyPassword(candidate?.password_hash, input.password);
  const result = await withTransaction(pool, async (client) => {
    const user = candidate ? await findLogin(client, input.nombre_usuario, { lock: true }) : null;
    if (!verified || !user?.activo || !user?.persona_activa || candidate.password_hash !== user.password_hash) {
      await recordEvent(client, { proceso: 'api:autenticacion', entidad: 'usuarios', entidadId: user?.id ?? 'desconocido',
        accion: 'login', resultado: 'rechazado', detalle: { motivo: 'credenciales_invalidas' } });
      return null;
    }
    await client.query("SELECT set_config('app.actor_usuario_id', $1, true)", [user.id]);
    if (validToken(oldToken)) await revokeSession(client, tokenHash(oldToken));
    const token = sessionToken();
    const session = await createSession(client, user.id, tokenHash(token), hours);
    await client.query('UPDATE prestamos.usuarios SET ultimo_acceso_en = clock_timestamp() WHERE id = $1', [user.id]);
    await recordEvent(client, { actorId: user.id, entidad: 'usuarios', entidadId: user.id, accion: 'login' });
    return { token, payload: { usuario: publicUser(user), csrf_token: csrfToken(token), expira_en: session.expira_en } };
  });
  if (!result) throw new HttpError(401, 'Credenciales inválidas', 'CREDENCIALES_INVALIDAS');
  return result;
}

export async function logout(pool, auth) {
  await actorTransaction(pool, auth, async (client) => {
    await revokeSession(client, tokenHash(auth.token));
    await recordEvent(client, { actorId: auth.usuario_id, entidad: 'usuarios', entidadId: auth.usuario_id, accion: 'logout' });
  }, { admin: false });
}
