import pg from 'pg';

export function createPool(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    application_name: 'prestamos-api',
    options: '-c timezone=UTC -c statement_timeout=10000 -c lock_timeout=5000',
  });
}
