import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../../.env.docker', import.meta.url));
const secret = () => randomBytes(24).toString('hex');
try {
  await writeFile(path, [
    '# Credenciales privadas para Docker. No compartir ni versionar.',
    '# No cambiar las contraseñas PostgreSQL sin actualizar los roles del volumen.',
    'APP_PORT=3000',
    'APP_ORIGIN=http://localhost:3000',
    `DOCKER_POSTGRES_PASSWORD=${secret()}`,
    `DOCKER_OWNER_PASSWORD=${secret()}`,
    `DOCKER_API_PASSWORD=${secret()}`,
    `DEMO_ADMIN_PASSWORD=${secret()}`,
    `DEMO_USER_PASSWORD=${secret()}`,
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log('Se creó .env.docker con contraseñas aleatorias. Consultar ese archivo para el login demo.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('.env.docker ya existe: no se modificaron sus credenciales.');
  } else {
    console.error('No se pudo crear .env.docker:', error.code ?? error.message);
    process.exitCode = 1;
  }
}
