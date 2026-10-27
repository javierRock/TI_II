import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { id, idParams, text, pagination } from '../../shared/schemas.js';
import { instant } from '../politicas/politicas.schemas.js';
import { deliverySchema } from '../prestamos/prestamos.schemas.js';
import { listReservations } from './reservas.repository.js';
import { requestReservation, decideReservation, convertReservation } from './reservas.service.js';
const query = z.strictObject({
  ...pagination,
  estado: z
    .enum(['pendiente', 'confirmada', 'cancelada', 'rechazada', 'atendida', 'vencida'])
    .optional(),
});
const request = z.strictObject({
  unidad_id: id,
  inicio: instant,
  fin: instant,
  uso_previsto: text(2000),
});
const reason = z.strictObject({ motivo: text(2000) });
export function reservationRoutes(pool) {
  const r = Router();
  r.use(authenticate(pool));
  r.get('/mias', validate({ query }), async (req, res) =>
    res.json(await listReservations(pool, req.data.query, req.auth.usuario_id)),
  );
  r.get('/', requireAdmin, validate({ query }), async (req, res) =>
    res.json(await listReservations(pool, req.data.query)),
  );
  r.post('/', requireCsrf, validate({ body: request }), async (req, res) =>
    res.status(201).json(await requestReservation(pool, req.auth, req.data.body)),
  );
  for (const action of ['confirmar', 'rechazar', 'cancelar'])
    r.post(
      `/:id/${action}`,
      ...(action === 'cancelar' ? [] : [requireAdmin]),
      requireCsrf,
      validate({
        params: idParams,
        body: action === 'confirmar' ? z.strictObject({}) : reason,
      }),
      async (req, res) =>
        res.json(
          await decideReservation(pool, req.auth, req.data.params.id, action, req.data.body.motivo),
        ),
    );
  r.post(
    '/:id/prestamo',
    requireAdmin,
    requireCsrf,
    validate({
      params: idParams,
      body: deliverySchema.omit({ solicitante_id: true, unidad_id: true }),
    }),
    async (req, res) =>
      res
        .status(201)
        .json(await convertReservation(pool, req.auth, req.data.params.id, req.data.body)),
  );
  return r;
}
