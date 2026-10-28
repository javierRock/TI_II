import { z } from 'zod';
// La aplicación solo conoce variables estándar, no Docker ni archivos privados.
export function readEnv(source = process.env) {
  const result = z
    .object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      DB_HOST: z.string().default('127.0.0.1'),
      DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
      DB_NAME: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
        .default('DBsistema_prestamos'),
      DB_USER: z.string().min(1).default('prestamos_app'),
      DB_PASSWORD: z.string().min(12),
      APP_ORIGIN: z.url().default('http://localhost:3000'),
      SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(8),
      LOGIN_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
    })
    .safeParse(source);
  if (!result.success)
    throw new Error(
      `Configuración inválida: ${result.error.issues.map((x) => x.path.join('.')).join(', ')}`,
    );
  const env = result.data;
  const origin = new URL(env.APP_ORIGIN);
  if (
    origin.origin !== env.APP_ORIGIN ||
    !['http:', 'https:'].includes(origin.protocol) ||
    (env.NODE_ENV === 'production' && origin.protocol !== 'https:')
  )
    throw new Error('APP_ORIGIN inválido; producción exige HTTPS');
  return env;
}
