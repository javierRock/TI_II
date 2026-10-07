import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Usar docker compose run --rm manage admin-create en una terminal interactiva');
}
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
output.isTTY = true;
output.columns = process.stdout.columns;
const rl = createInterface({ input: process.stdin, output, terminal: true });
try {
  const documento = (await rl.question('Documento de la persona autorizada: ')).trim();
  const nombre = (await rl.question('Nombre completo: ')).trim();
  const correo = (await rl.question('Correo: ')).trim();
  const usuario = (await rl.question('Usuario de acceso: ')).trim();
  const confirmation = (await rl.question('¿Cuenta con autorización institucional? Escribir SI: ')).trim();
  if (confirmation !== 'SI') throw new Error('No se confirmó la autorización; no se creó ninguna cuenta');
  process.stdout.write('Contraseña (12–128 caracteres; no se mostrará): ');
  muted = true;
  let password = await rl.question('');
  muted = false;
  process.stdout.write('\n');
  rl.close();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./crear-admin.js', import.meta.url)),
    '--documento', documento, '--nombre', nombre, '--correo', correo, '--usuario', usuario,
    '--password-stdin', '--confirmar-autorizacion'], {
    input: password, stdio: ['pipe', 'inherit', 'inherit'], env: process.env,
  });
  password = '';
  process.exitCode = result.status ?? 1;
} finally {
  muted = false;
  rl.close();
}
