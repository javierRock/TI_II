import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseUrls } from '../src/config/env.js';
import { identifier } from './provision-db.js';

export async function migrateDatabase({ migration, application }) {
  await runner({
    databaseUrl: migration,
    dir: fileURLToPath(new URL('../db/migrations/', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: true,
    checkOrder: true,
    log: (message) => console.log(message),
  });
  const client = new pg.Client({ connectionString: migration });
  await client.connect();
  try {
    const role = identifier(decodeURIComponent(new URL(application).username));
    await client.query('BEGIN');
    await client.query(`GRANT USAGE ON SCHEMA prestamos TO ${role}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA prestamos TO ${role}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA prestamos TO ${role}`);
    await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON prestamos.eventos_historial FROM ${role}`);
    // La cuenta del servicio no puede alterar esquemas, ejecutar migraciones ni borrar negocio.
    await client.query(`REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA prestamos FROM ${role}`);
    await client.query('COMMIT');
  } finally {
    await client.end();
  }
  console.log('Migraciones y permisos aplicados.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrateDatabase(databaseUrls({ test: process.argv.includes('--test') }));
  } catch (error) {
    console.error('Error al migrar:', error.code ?? error.message);
    process.exitCode = 1;
  }
}
