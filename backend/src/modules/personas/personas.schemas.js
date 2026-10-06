import { z } from 'zod';
import { id, text, nullableText, password, rol, patch } from '../../shared/schemas.js';

export const personSchema = z.strictObject({
  documento: text(32).transform((value) => value.toUpperCase()).pipe(text(32)),
  nombre_completo: text(200),
  correo: z.email().max(254).transform((value) => value.toLowerCase()),
  contacto: nullableText(100),
});
export const personPatch = patch(personSchema.omit({ documento: true }));
export const profileSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('estudiante'), codigo: text(50), habilitado: z.boolean(),
    plan_id: id, semestre: z.number().int().min(1).max(32767) }),
  z.strictObject({ tipo: z.literal('docente'), codigo: text(50), habilitado: z.boolean(),
    especialidad: text(150), vinculacion: text(150) }),
]);
export const accountSchema = z.strictObject({
  nombre_usuario: text(64).regex(/^[\p{L}\p{N}_.-]+$/u, 'Utiliza letras, números, punto, guion o guion bajo'),
  password,
  rol,
  perfil: profileSchema.optional(),
}).superRefine((value, context) => {
  if (value.rol === 'personal_administrativo' ? value.perfil !== undefined : value.perfil?.tipo !== value.rol) {
    context.addIssue({ code: 'custom', path: ['perfil'], message: 'El perfil debe corresponder al rol de la cuenta' });
  }
});
export const accountPatch = patch(z.strictObject({ activo: z.boolean(), rol }));
export const planSchema = z.strictObject({
  codigo: text(50), programa: text(150), nombre: text(150),
  semestres: z.array(z.number().int().min(1).max(32767)).min(1).max(100)
    .refine((values) => new Set(values).size === values.length, 'No repitas semestres'),
});
