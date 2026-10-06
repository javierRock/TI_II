import { mkdir, chmod, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { projectRoot, databaseUrls } from '../src/config/env.js';
import { identifier } from './provision-db.js';

function run(program, args, connectionString) {
  const url = new URL(connectionString);
  const result = spawnSync(program, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGHOST: url.hostname, PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGSSLMODE: url.searchParams.get('sslmode') || 'prefer',
    },
  });
  if (result.error) throw new Error(`Instalar ${program} de la misma versión mayor del servidor`);
  if (result.status !== 0) throw new Error(`${program} terminó con código ${result.status}`);
}

async function counts(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'prestamos' ORDER BY tablename");
    const totals = {};
    for (const { tablename } of result.rows) {
      totals[tablename] = (await client.query(`SELECT count(*)::integer AS total FROM prestamos.${identifier(tablename)}`)).rows[0].total;
    }
    return totals;
  } finally {
    await client.end();
  }
}

try {
  const { migration } = databaseUrls();
  const directory = join(projectRoot, '.local', 'backups');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `prestamos-${new Date().toISOString().replaceAll(':', '-')}.dump`);
  const expected = process.argv.includes('--verify') ? await counts(migration) : null;
  run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', file], migration);
  await chmod(file, 0o600);
  const checksum = createHash('sha256').update(await readFile(file)).digest('hex');
  console.log(`Respaldo creado: ${file}`);
  console.log(`SHA-256: ${checksum}`);

  if (expected) {
    if (!process.env.ADMIN_DATABASE_URL) throw new Error('La verificación requiere ADMIN_DATABASE_URL');
    const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
    const ownerUrl = new URL(migration);
    const adminUrl = new URL(process.env.ADMIN_DATABASE_URL);
    if (ownerUrl.host !== adminUrl.host) throw new Error('Verificar el respaldo en el mismo servidor de desarrollo');
    const temporary = `prestamos_restore_${randomUUID().replaceAll('-', '')}_test`;
    let created = false;
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${identifier(temporary)} OWNER ${identifier(decodeURIComponent(ownerUrl.username))} TEMPLATE template0`);
      created = true;
      ownerUrl.pathname = `/${temporary}`;
      run('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', temporary, file], ownerUrl.href);
      const restored = await counts(ownerUrl.href);
      if (JSON.stringify(restored) !== JSON.stringify(expected)) {
        throw new Error('Los conteos difieren: ejecutar --verify sin escrituras concurrentes');
      }
      console.log('Restauración verificada: tablas, restricciones y conteos conservados.');
    } finally {
      // Solo eliminar la base aleatoria que este proceso acaba de crear.
      if (created) await admin.query(`DROP DATABASE ${identifier(temporary)}`);
      await admin.end();
    }
  }
} catch (error) {
  console.error('No se pudo completar el respaldo:', error.code ?? error.message);
  process.exitCode = 1;
}
