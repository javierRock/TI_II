import { readEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { migrateDatabase } from './migrate.js';
import { seedDemo } from './seed-demo-data.js';
const pool = createPool(readEnv());
try {
  await migrateDatabase(pool);
  if (process.env.SEED_DEMO === 'true') {
    if (process.env.NODE_ENV === 'production')
      throw new Error('La demostración está prohibida en producción');
    await seedDemo(pool, process.env);
  }
} finally {
  await pool.end();
}
