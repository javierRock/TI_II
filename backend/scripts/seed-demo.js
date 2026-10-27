import { readEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { seedDemo } from './seed-demo-data.js';
if (process.env.SEED_DEMO !== 'true' || process.env.NODE_ENV === 'production')
  throw new Error('La carga ficticia exige SEED_DEMO=true fuera de producción');
const pool = createPool(readEnv());
try {
  await seedDemo(pool, process.env);
} finally {
  await pool.end();
}
