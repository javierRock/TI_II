import { password } from '../src/shared/schemas.js';

export function readDemoConfiguration(source = process.env) {
  if (source.DEMO_MODE !== 'true' || source.NODE_ENV === 'production') {
    throw new Error('La carga ficticia exige DEMO_MODE=true y está prohibida en producción');
  }
  let migration, application;
  try {
    migration = new URL(source.MIGRATION_DATABASE_URL);
    application = new URL(source.DATABASE_URL);
  } catch {
    throw new Error('Configurar conexiones PostgreSQL separadas para la demostración');
  }
  if (![migration, application].every((url) => ['postgres:', 'postgresql:'].includes(url.protocol))
      || migration.host !== application.host || migration.pathname !== application.pathname
      || migration.username === application.username
      || !/^\/[a-z][a-z0-9_]*_demo$/.test(migration.pathname)) {
    throw new Error('La demostración exige una misma base aislada terminada en _demo y usuarios SQL distintos');
  }
  for (const key of ['DEMO_ADMIN_PASSWORD', 'DEMO_USER_PASSWORD']) {
    if (!password.safeParse(source[key]).success || source[key].startsWith('reemplazar_')) {
      throw new Error(`Configurar ${key} con una contraseña propia de 12–128 caracteres`);
    }
  }
  if (source.DEMO_ADMIN_PASSWORD === source.DEMO_USER_PASSWORD) {
    throw new Error('La contraseña del administrador demo debe ser distinta de la de solicitantes');
  }
  return { migration: migration.href, application: application.href,
    adminPassword: source.DEMO_ADMIN_PASSWORD, userPassword: source.DEMO_USER_PASSWORD };
}
