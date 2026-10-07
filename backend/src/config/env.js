import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
// .env reúne credenciales de herramientas locales. No cargarlas en producción:
// el servicio y el proceso de migraciones deben recibir secretos separados.
if (process.env.NODE_ENV !== 'production' && process.env.SKIP_DOTENV !== '1') {
  dotenv.config({ path: `${projectRoot}.env`, quiet: true });
}

const postgresUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname.length > 1;
}, 'Debe ser una URL de PostgreSQL con nombre de base de datos');

export function readEnv(source = process.env) {
  const result = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
    DATABASE_URL: postgresUrl,
    APP_ORIGIN: z.url().optional(),
    SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(8),
    LOGIN_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  }).safeParse(source);

  if (!result.success) {
    // No incluir valores de entrada: podrían contener contraseñas.
    throw new Error(`Configuración inválida: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  const env = result.data;
  env.APP_ORIGIN ??= `http://127.0.0.1:${env.PORT}`;
  const origin = new URL(env.APP_ORIGIN);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.APP_ORIGIN
      || (env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN debe ser un origen HTTP(S) sin ruta; en producción requiere HTTPS');
  }
  return env;
}

export function databaseUrls({ test = false } = {}) {
  const migration = process.env[test ? 'TEST_MIGRATION_DATABASE_URL' : 'MIGRATION_DATABASE_URL'];
  const application = process.env[test ? 'TEST_DATABASE_URL' : 'DATABASE_URL'];
  if (!postgresUrl.safeParse(migration).success || !postgresUrl.safeParse(application).success) {
    throw new Error('Configurar las URLs de migración y aplicación en .env');
  }
  const ownerUrl = new URL(migration);
  const apiUrl = new URL(application);
  if (ownerUrl.host !== apiUrl.host || decodeURIComponent(ownerUrl.pathname) !== decodeURIComponent(apiUrl.pathname)) {
    throw new Error('Migraciones y API deben apuntar a la misma base de datos');
  }
  if (decodeURIComponent(ownerUrl.username) === decodeURIComponent(apiUrl.username)) {
    throw new Error('Migraciones y API requieren usuarios distintos');
  }
  if (test) {
    if (!postgresUrl.safeParse(process.env.DATABASE_URL).success) throw new Error('Configurar DATABASE_URL antes de ejecutar pruebas');
    const name = decodeURIComponent(ownerUrl.pathname);
    if (!name.endsWith('_test') || name === decodeURIComponent(new URL(process.env.DATABASE_URL).pathname)) {
      throw new Error('Las pruebas requieren una base separada con sufijo _test');
    }
  }
  return { migration, application };
}
