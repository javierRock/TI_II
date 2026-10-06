import { z } from 'zod';
import { id, text, pagination, patch } from '../../shared/schemas.js';

export const instant = z.iso.datetime({ offset: true });
const scope = z.enum(['docente', 'estudiante']).nullable();
export const policySchema = z.strictObject({
  rol: scope.default(null), nombre: text(150),
  vigencia_inicio: instant, vigencia_fin: instant.nullable().optional(),
  cupo_total: z.number().int().min(1).max(32767),
  duracion_cantidad: z.number().int().min(1).max(36500), duracion_unidad: z.enum(['horas', 'dias']),
  modalidades: z.array(z.enum(['en_sitio', 'retiro'])).min(1).max(2)
    .refine((values) => new Set(values).size === values.length, 'No repitas modalidades'),
  garantia_exigida: z.literal(false).default(false), renovacion_permitida: z.literal(false).default(false),
  max_renovaciones: z.literal(0).default(0), tolerancia_horas: z.number().int().min(0).max(2147483647).default(0),
  tarifa_diaria: z.literal(0).default(0),
});
// PATCH no aplica defaults: omitir tolerancia no debe reiniciarla a cero.
export const policyPatch = patch(z.strictObject({
  ...policySchema.omit({ rol: true }).shape,
  garantia_exigida: z.literal(false), renovacion_permitida: z.literal(false),
  max_renovaciones: z.literal(0), tarifa_diaria: z.literal(0),
  tolerancia_horas: z.number().int().min(0).max(2147483647),
}));
export const policyQuery = z.strictObject({ ...pagination,
  rol: z.enum(['general', 'docente', 'estudiante']).optional(),
  estado: z.enum(['borrador', 'programada', 'vigente', 'expirada']).optional(),
});
export const approvalSchema = z.strictObject({
  confirmar: z.literal(true), referencia_aprobacion: text(2000), sustituye_id: id.optional(),
});
export const endValiditySchema = z.strictObject({ vigencia_fin: instant, confirmar: z.literal(true), motivo: text(2000) });
