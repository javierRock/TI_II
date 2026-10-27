import { readEnv } from '../../src/config/env.js';
import { createPool } from '../../src/db/pool.js';
export function testPool() {
  if (process.env.DB_NAME !== 'DBsistema_prestamos_test')
    throw new Error('Las pruebas exigen DB_NAME=DBsistema_prestamos_test; nunca usar la principal');
  return createPool(
    readEnv({
      ...process.env,
      DB_USER: 'prestamos_migrator',
      DB_PASSWORD: process.env.DB_MIGRATION_PASSWORD ?? process.env.DB_PASSWORD,
    }),
  );
}
