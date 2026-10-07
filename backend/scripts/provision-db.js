import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { databaseUrls } from '../src/config/env.js';

export const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const literal = (value) => `'${value.replaceAll("'", "''")}'`;

export async function provisionDatabases({ additionalDatabases = [] } = {}) {
  if (!process.env.ADMIN_DATABASE_URL) throw new Error('Configurar ADMIN_DATABASE_URL para aprovisionar');
  const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  await admin.connect();
  try {
    const databases = [databaseUrls(), databaseUrls({ test: true }), ...additionalDatabases];
    for (const urls of databases) {
      const owner = new URL(urls.migration);
      const api = new URL(urls.application);
      const adminUrl = new URL(process.env.ADMIN_DATABASE_URL);
      if (adminUrl.host !== owner.host) throw new Error('El administrador debe pertenecer al mismo servidor');
      const database = decodeURIComponent(owner.pathname.slice(1));
      for (const url of [owner, api]) {
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        if (!password || username === decodeURIComponent(adminUrl.username)) {
          throw new Error('Usar credenciales separadas y contraseñas no vacías');
        }
        const existing = await admin.query('SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = $1', [username]);
        if (!existing.rowCount) {
          await admin.query(`CREATE ROLE ${identifier(username)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${literal(password)}`);
        } else if (existing.rows[0].rolsuper || existing.rows[0].rolcreatedb || existing.rows[0].rolcreaterole || !existing.rows[0].rolcanlogin) {
          throw new Error('Un rol existente tiene privilegios incompatibles; no se modificará');
        }
      }
      const existing = await admin.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1', [database]);
      const ownerName = decodeURIComponent(owner.username);
      const apiName = decodeURIComponent(api.username);
      if (!existing.rowCount) {
        await admin.query(`CREATE DATABASE ${identifier(database)} OWNER ${identifier(ownerName)} TEMPLATE template0 ENCODING 'UTF8'`);
      } else if (existing.rows[0].owner !== ownerName) {
        throw new Error('La base existente pertenece a otro usuario; no se modificará');
      }
      await admin.query(`REVOKE CONNECT, TEMPORARY ON DATABASE ${identifier(database)} FROM PUBLIC`);
      await admin.query(`GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(apiName)}`);
      const client = new pg.Client({ connectionString: urls.migration });
      await client.connect();
      try {
        await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
      } finally {
        await client.end();
      }
      console.log(`Base preparada: ${database}`);
    }
  } finally {
    await admin.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await provisionDatabases();
  } catch (error) {
    console.error('No se pudo aprovisionar PostgreSQL:', error.code ?? error.message);
    process.exitCode = 1;
  }
}
