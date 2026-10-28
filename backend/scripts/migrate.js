import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPool } from '../src/db/pool.js';
import { readEnv } from '../src/config/env.js';
import { pathToFileURL } from 'node:url';

export function statements(sql) {
  let delimiter = ';',
    buffer = '',
    result = [];
  for (const line of sql.split(/\r?\n/)) {
    if (/^DELIMITER /i.test(line)) {
      delimiter = line.split(/\s+/)[1];
      continue;
    }
    buffer += line + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      result.push(buffer.trimEnd().slice(0, -delimiter.length));
      buffer = '';
    }
  }
  if (buffer.trim() && !/^\s*--[^\n]*\s*$/.test(buffer))
    throw new Error('Migración sin delimitador final');
  return result;
}
export async function migrateDatabase(pool) {
  const c = await pool.connect();
  let locked = false;
  try {
    const result = await c.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':migraciones'),30) AS adquirido",
    );
    if (Number(result.rows[0].adquirido) !== 1) throw new Error('Otra migración está en ejecución');
    locked = true;
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (nombre VARCHAR(200) PRIMARY KEY, checksum CHAR(64) NOT NULL, completada BOOLEAN NOT NULL DEFAULT FALSE)',
    );
    const dir = new URL('../database/migrations/', import.meta.url);
    // Excepción acotada al reformateo revisado: no acepta cambios SQL arbitrarios.
    // Se conserva el checksum histórico, sin reejecutar DDL ni reescribir el registro.
    const formatos = JSON.parse(
      await readFile(new URL('../database/formatos-compatibles.json', import.meta.url), 'utf8'),
    );
    for (const name of (await readdir(dir)).filter((x) => x.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, dir), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = (await c.query('SELECT * FROM schema_migrations WHERE nombre=?', [name]))
        .rows[0];
      if (existing) {
        const formato = formatos[name];
        const soloFormato = formato?.anterior === existing.checksum && formato?.actual === hash;
        if (!existing.completada || (existing.checksum !== hash && !soloFormato))
          throw new Error(
            `Migración parcial o modificada: ${name}. Revisar antes de continuar; DDL no tiene rollback automático.`,
          );
        if (soloFormato) console.log('Migración verificada, solo cambió el formato:', name);
        continue;
      }
      await c.query('INSERT INTO schema_migrations(nombre,checksum) VALUES (?,?)', [name, hash]);
      for (const statement of statements(sql)) await c.query(statement);
      await c.query('UPDATE schema_migrations SET completada=TRUE WHERE nombre=?', [name]);
      console.log('Migración aplicada:', name);
    }
  } finally {
    let releaseError;
    try {
      if (locked) await c.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':migraciones'))");
    } catch (error) {
      releaseError = error;
    }
    c.release(releaseError);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool(readEnv());
  try {
    await migrateDatabase(pool);
  } finally {
    await pool.end();
  }
}
