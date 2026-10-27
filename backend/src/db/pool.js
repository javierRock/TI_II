import mysql from 'mysql2/promise';

function connection(raw) {
  return {
    async query(sql, values = []) {
      const [result] = await raw.query(sql, values);
      return {
        rows: Array.isArray(result) ? result : [],
        rowCount: result.affectedRows ?? result.length,
        insertId: result.insertId ? String(result.insertId) : null,
      };
    },
    release: (error) => (error ? raw.destroy() : raw.release()),
  };
}
export function createPool(env) {
  const raw = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionLimit: 10,
    connectTimeout: 5000,
    timezone: 'Z',
    charset: 'utf8mb4_unicode_ci',
    supportBigNumbers: true,
    bigNumberStrings: true,
    typeCast(field, next) {
      if (field.type === 'TINY' && field.length === 1) {
        const value = field.string();
        return value === null ? null : value === '1';
      }
      if (field.name === 'total') return Number(field.string());
      if (['perfil_habilitado', 'disponible'].includes(field.name)) return field.string() === '1';
      return next();
    },
  });
  return {
    async connect() {
      const c = await raw.getConnection();
      try {
        await c.query("SET time_zone = '+00:00'");
        await c.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await c.query('SET SESSION innodb_lock_wait_timeout=5');
        return connection(c);
      } catch (error) {
        c.destroy();
        throw error;
      }
    },
    async query(sql, values) {
      const c = await this.connect();
      try {
        return await c.query(sql, values);
      } finally {
        c.release();
      }
    },
    end: () => raw.end(),
    on: (...args) => raw.on(...args),
  };
}
