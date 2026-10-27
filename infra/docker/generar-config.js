import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const secret = () => randomBytes(24).toString('hex');
try {
  writeFileSync(
    new URL('.env', import.meta.url),
    [
      `MYSQL_ROOT_PASSWORD=${secret()}`,
      `DB_MIGRATION_PASSWORD=${secret()}`,
      `DB_PASSWORD=${secret()}`,
      'MYSQL_PORT=3306',
      'APP_PORT=3000',
      'APP_ORIGIN=http://localhost:3000',
      'SEED_DEMO=true',
      `DEMO_ADMIN_PASSWORD=${secret()}`,
      `DEMO_USER_PASSWORD=${secret()}`,
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Configuración privada creada. No subir .env a Git.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('La configuración existente se conserva.');
}
