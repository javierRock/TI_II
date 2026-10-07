import { fileURLToPath } from 'node:url';
import { dockerEnvironment } from './docker-environment.js';

const commands = {
  serve: '../src/server.js',
  init: './docker-init.js',
  'seed-demo': './seed-demo.js',
  'admin-create': './crear-admin-interactivo.js',
  check: './check-db.js',
};
try {
  const command = process.argv[2] ?? 'serve';
  if (!Object.hasOwn(commands, command)) throw new Error('Comando Docker desconocido');
  Object.assign(process.env, dockerEnvironment(process.env));
  const target = new URL(commands[command], import.meta.url);
  process.argv = [process.execPath, fileURLToPath(target), ...process.argv.slice(3)];
  await import(target.href);
} catch (error) {
  // No imprimir URLs ni objetos que puedan contener credenciales.
  console.error('No se pudo iniciar el comando Docker:', error.code ?? error.message);
  process.exitCode = 1;
}
