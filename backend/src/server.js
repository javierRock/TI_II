import { readEnv } from './config/env.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

const env = readEnv();
const pool = createPool(env.DATABASE_URL);
const runtimeRole = (await pool.query(`SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole,
  has_schema_privilege(current_user, 'prestamos', 'CREATE') AS puede_crear
  FROM pg_roles r WHERE r.rolname = current_user`)).rows[0];
if (runtimeRole.rolsuper || runtimeRole.rolcreatedb || runtimeRole.rolcreaterole || runtimeRole.puede_crear) {
  await pool.end();
  throw new Error('DATABASE_URL debe usar una cuenta de ejecución restringida, no la cuenta de migraciones');
}
pool.on('error', (error) => console.error('Error de conexión PostgreSQL', { code: error.code }));
const server = createApp(pool, {
  production: env.NODE_ENV === 'production', appOrigin: env.APP_ORIGIN,
  sessionHours: env.SESSION_HOURS, loginLimit: env.LOGIN_LIMIT,
}).listen(env.PORT, '127.0.0.1', () => {
  console.log(`API disponible en http://127.0.0.1:${env.PORT}`);
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
