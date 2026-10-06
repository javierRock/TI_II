import { z } from 'zod';
import { text } from '../../shared/schemas.js';

export const loginSchema = z.strictObject({ nombre_usuario: text(64), password: z.string().min(1).max(128) });
