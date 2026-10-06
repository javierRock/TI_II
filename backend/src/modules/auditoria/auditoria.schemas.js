import { z } from 'zod';
import { id, text, pagination } from '../../shared/schemas.js';
import { instant } from '../politicas/politicas.schemas.js';

export const auditQuery = z.strictObject({ ...pagination,
  entidad: text(80).optional(), entidad_id: text(100).optional(), actor_usuario_id: id.optional(),
  accion: text(100).optional(), resultado: z.enum(['exito', 'rechazado', 'error']).optional(),
  desde: instant.optional(), hasta: instant.optional(),
}).refine((value) => !value.desde || !value.hasta || new Date(value.hasta) > new Date(value.desde), 'El fin del periodo debe ser posterior al inicio');
