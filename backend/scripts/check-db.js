import pg from 'pg';
import { databaseUrls } from '../src/config/env.js';

const { application } = databaseUrls();
const client = new pg.Client({ connectionString: application });
try {
  await client.connect();
  const connection = await client.query('SELECT current_database() AS base, current_user AS usuario');
  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'prestamos' ORDER BY tablename");
  const types = await client.query('SELECT codigo, nombre FROM prestamos.tipos_bien ORDER BY codigo');
  console.log(connection.rows[0]);
  console.table(tables.rows);
  console.table(types.rows);
} catch (error) {
  console.error('No se pudo comprobar la base:', error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
