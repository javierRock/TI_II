import { readEnv } from './config/env.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';
import { expire } from './modules/reservas/reservas.repository.js';
import { withTransaction } from './db/transaction.js';

const env = readEnv();
const pool = createPool(env);
if (env.DB_USER !== 'prestamos_app')
  throw new Error('La API exige el usuario SQL restringido prestamos_app');
await pool.query('SELECT 1');
const grants = (await pool.query('SHOW GRANTS FOR CURRENT_USER')).rows.flatMap(Object.values);
if (
  grants.some((grant) =>
    /\b(ALL PRIVILEGES|CREATE|ALTER|DROP|GRANT OPTION|SUPER|FILE|TRIGGER|DELETE)\b/i.test(grant),
  )
) {
  await pool.end();
  throw new Error('La cuenta de ejecución tiene privilegios de mantenimiento no permitidos');
}
pool.on('error', (error) => console.error('Error MySQL', { code: error.code }));
const server = createApp(pool, {
  production: env.NODE_ENV === 'production',
  appOrigin: env.APP_ORIGIN,
  sessionHours: env.SESSION_HOURS,
  loginLimit: env.LOGIN_LIMIT,
}).listen(env.PORT, env.HOST, () => {
  console.log(`Aplicación disponible en ${env.APP_ORIGIN}`);
});

let closing = false;
const expiryTimer = setInterval(async () => {
  try {
    await withTransaction(pool, expire);
  } catch (error) {
    console.error('Expiración de reservas:', error.code);
  }
}, 60000).unref();
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(expiryTimer);
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timeout);
  });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
