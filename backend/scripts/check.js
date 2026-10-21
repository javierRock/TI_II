import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Comprobación de sintaxis sin dependencias ni escritura en la base de datos.
async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const groups = await Promise.all(entries.filter((entry) => entry.name !== 'node_modules').map((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? files(full) : /\.[cm]?js$/.test(entry.name) ? [full] : [];
  }));
  return groups.flat();
}
const roots = ['../src/', '../scripts/', '../tests/', '../db/migrations/', '../../frontend/js/'];
const paths = (await Promise.all(roots.map((path) => files(fileURLToPath(new URL(path, import.meta.url)))))).flat();
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  if (result.status !== 0 || result.error) process.exit(1);
}
console.log(`Sintaxis válida: ${paths.length} archivos JavaScript.`);
