import { z } from 'zod';
import { id, text, nullableText, pagination } from '../../shared/schemas.js';
import { instant } from '../politicas/politicas.schemas.js';

const period = (value) => new Date(value.fin) > new Date(value.inicio);
const interval = { unidad_id: id, inicio: instant, fin: instant };
export const availabilityQuery = z.strictObject(interval).refine(period, 'El fin debe ser posterior al inicio');
export const reservationSchema = z.strictObject({ ...interval,
  modalidad: z.enum(['retiro', 'en_sitio']), observaciones: nullableText(2000), confirmar: z.literal(true),
}).refine(period, 'El fin debe ser posterior al inicio');
export const reservationQuery = z.strictObject({ ...pagination,
  estado: z.enum(['solicitada', 'confirmada', 'rechazada', 'cancelada', 'atendida', 'vencida']).optional(),
  unidad_id: id.optional(),
});
export const approvalSchema = z.strictObject({ confirmar: z.literal(true) });
export const reasonSchema = z.strictObject({ confirmar: z.literal(true), motivo: text(2000) });
