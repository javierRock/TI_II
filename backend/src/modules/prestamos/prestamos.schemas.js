import { z } from 'zod';
import { id, text, nullableText, pagination } from '../../shared/schemas.js';
import { instant } from '../politicas/politicas.schemas.js';

const accessories = z.array(text(100)).max(50);
const state = z.enum(['activo', 'vencido', 'devuelto']);
const filters = { ...pagination, estado: state.optional(), unidad_id: id.optional(),
  desde: instant.optional(), hasta: instant.optional() };
const validPeriod = (value) => !value.desde || !value.hasta || new Date(value.hasta) > new Date(value.desde);
export const ownQuery = z.strictObject(filters).refine(validPeriod, 'El fin del periodo debe ser posterior al inicio');
export const adminQuery = z.strictObject({ ...filters, solicitante_id: id.optional() }).refine(validPeriod, 'El fin del periodo debe ser posterior al inicio');
export const deliverySchema = z.strictObject({
  solicitante_id: id, unidad_id: id, vencimiento: instant,
  modalidad: z.enum(['en_sitio', 'retiro']), condicion_entrega: text(2000),
  accesorios_entrega: accessories, observaciones_entrega: nullableText(5000), confirmar: z.literal(true),
});
export const returnSchema = z.strictObject({
  condicion_devolucion: text(2000), accesorios_devolucion: accessories,
  apta: z.boolean(), estado_unidad: z.enum(['disponible', 'mantenimiento', 'baja']),
  motivo_baja: text(2000).optional(), observaciones_devolucion: nullableText(5000), confirmar: z.literal(true),
}).superRefine((value, context) => {
  if (!value.apta && value.estado_unidad === 'disponible') {
    context.addIssue({ code: 'custom', path: ['estado_unidad'], message: 'Una unidad no apta debe ir a mantenimiento o baja' });
  }
  if (value.estado_unidad === 'baja' && !value.motivo_baja) context.addIssue({ code: 'custom', path: ['motivo_baja'], message: 'La baja requiere un motivo' });
  if (value.estado_unidad !== 'baja' && value.motivo_baja) context.addIssue({ code: 'custom', path: ['motivo_baja'], message: 'El motivo solo corresponde a una baja' });
});
