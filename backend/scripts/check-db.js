import { readEnv } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
const pool = createPool(readEnv());
try {
  console.table((await pool.query('SELECT DATABASE() AS base, CURRENT_USER() AS usuario')).rows);
  console.table((await pool.query('SHOW TABLES')).rows);
} finally {
  await pool.end();
}
