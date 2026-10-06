import { z } from 'zod';

z.config(z.locales.es());

export const id = z.string().regex(/^[1-9]\d{0,18}$/, 'Identificador inválido')
  .refine((value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n, 'Identificador fuera de rango');
export const idParams = z.strictObject({ id });
export const text = (max) => z.string().trim().min(1).max(max);
export const nullableText = (max) => text(max).nullable().optional();
export const password = z.string().min(12, 'Utiliza al menos 12 caracteres').max(128);
export const rol = z.enum(['personal_administrativo', 'docente', 'estudiante']);
export const pagination = {
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
};
export const searchQuery = z.strictObject({ ...pagination, q: text(100).optional() });
export const estadoPersona = z.strictObject({ activo: z.boolean() });
export const patch = (schema) => schema.partial().refine((value) => Object.keys(value).length > 0, 'Indica al menos un campo');
export const likePattern = (value = '') => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
