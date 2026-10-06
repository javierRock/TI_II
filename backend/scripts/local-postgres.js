import { mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { projectRoot } from '../src/config/env.js';
import dotenv from 'dotenv';
import { provisionDatabases } from './provision-db.js';

const local = join(projectRoot, '.local');
const data = join(local, 'postgres');
const envPath = join(projectRoot, '.env');
const command = process.argv[2] ?? 'start';

function run(program, args) {
  const result = spawnSync(program, args, { stdio: 'inherit' });
  if (result.error) throw new Error(`No se pudo ejecutar ${program}; instalar PostgreSQL y añadir sus binarios al PATH`);
  if (result.status !== 0) throw new Error(`${program} terminó con código ${result.status}`);
}

try {
  if (!['start', 'stop', 'status'].includes(command)) throw new Error('Uso: npm run db:local -- start|stop|status');
  if (command !== 'start') {
    run('pg_ctl', ['-D', data, command === 'stop' ? 'stop' : 'status', ...(command === 'stop' ? ['-m', 'fast', '-w'] : [])]);
  } else {
    await mkdir(local, { recursive: true, mode: 0o700 });
    try {
      await access(envPath);
    } catch {
      const admin = randomBytes(32).toString('hex');
      const owner = randomBytes(32).toString('hex');
      const api = randomBytes(32).toString('hex');
      await writeFile(envPath, [
        'NODE_ENV=development', 'PORT=3000', 'PG_LOCAL_PORT=55432',
        `LOCAL_POSTGRES_ADMIN_PASSWORD=${admin}`,
        `ADMIN_DATABASE_URL=postgresql://prestamos_local_admin:${admin}@127.0.0.1:55432/postgres`,
        `MIGRATION_DATABASE_URL=postgresql://prestamos_owner:${owner}@127.0.0.1:55432/prestamos`,
        `DATABASE_URL=postgresql://prestamos_api:${api}@127.0.0.1:55432/prestamos`,
        `TEST_MIGRATION_DATABASE_URL=postgresql://prestamos_owner:${owner}@127.0.0.1:55432/prestamos_test`,
        `TEST_DATABASE_URL=postgresql://prestamos_api:${api}@127.0.0.1:55432/prestamos_test`, '',
      ].join('\n'), { flag: 'wx', mode: 0o600 });
      console.log('Configuración local creada en .env (no versionada).');
    }
    dotenv.config({ path: envPath, quiet: true });
    const port = Number(process.env.PG_LOCAL_PORT ?? 55432);
    const adminUrl = new URL(process.env.ADMIN_DATABASE_URL);
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || adminUrl.hostname !== '127.0.0.1' || Number(adminUrl.port) !== port) {
      throw new Error('La instancia local requiere ADMIN_DATABASE_URL en 127.0.0.1 y el mismo PG_LOCAL_PORT');
    }
    const password = process.env.LOCAL_POSTGRES_ADMIN_PASSWORD;
    if (!password || decodeURIComponent(adminUrl.password) !== password) throw new Error('Contraseña del administrador local incompatible con ADMIN_DATABASE_URL');
    try {
      await access(join(data, 'PG_VERSION'));
    } catch {
      const passwordFile = join(local, 'init-password');
      await writeFile(passwordFile, `${password}\n`, { mode: 0o600, flag: 'wx' });
      try {
        run('initdb', ['-D', data, '-U', decodeURIComponent(adminUrl.username), '--encoding=UTF8', '--locale=C.UTF-8', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256', `--pwfile=${passwordFile}`]);
      } finally {
        await unlink(passwordFile);
      }
    }
    const status = spawnSync('pg_ctl', ['-D', data, 'status'], { stdio: 'ignore' });
    if (status.error) throw new Error('pg_ctl no está disponible');
    if (status.status !== 0) {
      // No pasar contraseñas por argumentos ni abrir el servidor a la red.
      run('pg_ctl', ['-D', data, '-l', join(local, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1 -k ${local}`, '-w', 'start']);
    }
    await provisionDatabases();
    console.log(`PostgreSQL local disponible en 127.0.0.1:${port}`);
  }
} catch (error) {
  console.error('No se pudo gestionar PostgreSQL local:', error.code ?? error.message);
  process.exitCode = 1;
}
