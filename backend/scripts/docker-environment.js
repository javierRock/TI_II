// Mantener fuera del servicio web las credenciales de propietario y superusuario.
// encodeURIComponent permite contraseñas con caracteres especiales en las URLs.
export function dockerEnvironment(source) {
  const host = source.DOCKER_DB_HOST ?? 'postgres';
  const database = source.DOCKER_DB_NAME ?? 'prestamos';
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^[a-z][a-z0-9_]{0,62}$/.test(database)) {
    throw new Error('Host o nombre de base Docker inválido');
  }
  function url(user, password, name) {
    if (!password || password.startsWith('reemplazar_')) {
      throw new Error('Configurar contraseñas Docker propias; no usar los valores de ejemplo');
    }
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${name}`;
  }
  const env = {
    SKIP_DOTENV: '1',
    DATABASE_URL: url('prestamos_api', source.POSTGRES_API_PASSWORD, database),
    TEST_DATABASE_URL: url('prestamos_api', source.POSTGRES_API_PASSWORD, 'prestamos_test'),
  };
  if (source.POSTGRES_OWNER_PASSWORD) {
    env.MIGRATION_DATABASE_URL = url('prestamos_owner', source.POSTGRES_OWNER_PASSWORD, database);
    env.TEST_MIGRATION_DATABASE_URL = url('prestamos_owner', source.POSTGRES_OWNER_PASSWORD, 'prestamos_test');
    env.DEMO_MIGRATION_DATABASE_URL = url('prestamos_owner', source.POSTGRES_OWNER_PASSWORD, 'prestamos_demo');
    env.DEMO_DATABASE_URL = url('prestamos_api', source.POSTGRES_API_PASSWORD, 'prestamos_demo');
  }
  if (source.POSTGRES_ADMIN_PASSWORD) {
    env.ADMIN_DATABASE_URL = url('prestamos_local_admin', source.POSTGRES_ADMIN_PASSWORD, 'postgres');
  }
  return env;
}
