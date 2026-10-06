import { z } from 'zod';
import { id, text, nullableText, pagination, patch } from '../../shared/schemas.js';

export const tipoCodigo = z.enum(['libro', 'mesa_ping_pong', 'visor_3d', 'parlante', 'carrito_robotica']);
export const catalogQuery = z.strictObject({ ...pagination, q: text(100).optional(), tipo: tipoCodigo.optional() });
export const unitsQuery = catalogQuery.extend({
  disponible: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
});
export const goodSchema = z.strictObject({
  tipo_id: id, nombre: text(200), descripcion: nullableText(5000),
  autor: nullableText(200), edicion: nullableText(100), isbn: nullableText(32),
  marca: nullableText(100), modelo: nullableText(100),
});
export const goodPatch = patch(goodSchema.omit({ tipo_id: true }));
const accessories = z.array(text(100)).max(50);
const acquisitionDate = z.iso.date().nullable().optional();
export const unitSchema = z.strictObject({
  bien_id: id, codigo_inventario: text(64).transform((value) => value.toUpperCase()).pipe(text(64)),
  custodia: z.literal('escuela').default('escuela'),
  adscrito_laboratorio: z.literal(false).default(false),
  ubicacion: text(200), condicion_fisica: text(2000), accesorios: accessories.default([]),
  estado: z.enum(['disponible', 'mantenimiento']).default('disponible'),
  serie: nullableText(100), marca: nullableText(100), modelo: nullableText(100),
  adquirido_en: acquisitionDate, observaciones: nullableText(5000),
});
export const unitPatch = patch(z.strictObject({
  ubicacion: text(200), condicion_fisica: text(2000), accesorios: accessories,
  adquirido_en: acquisitionDate, observaciones: nullableText(5000),
}));
export const unitState = z.strictObject({
  estado: z.enum(['disponible', 'mantenimiento', 'baja']), motivo: text(2000).optional(),
  confirmar: z.literal(true).optional(),
}).superRefine((value, context) => {
  if (value.estado === 'baja' && !value.motivo) context.addIssue({ code: 'custom', path: ['motivo'], message: 'La baja requiere un motivo' });
  if (value.estado === 'baja' && !value.confirmar) context.addIssue({ code: 'custom', path: ['confirmar'], message: 'Confirma explícitamente la baja' });
  if (value.estado !== 'baja' && value.motivo) context.addIssue({ code: 'custom', path: ['motivo'], message: 'El motivo corresponde únicamente a una baja' });
});
