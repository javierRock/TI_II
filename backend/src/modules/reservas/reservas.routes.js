import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { idParams } from '../../shared/schemas.js';
import { requireRecord } from '../../shared/errors.js';
import { availabilityQuery, reservationSchema, reservationQuery, approvalSchema, reasonSchema } from './reservas.schemas.js';
import { listReservations, reservationDetail, availability } from './reservas.repository.js';
import { requestReservation, decide } from './reservas.service.js';

export function reservationRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool));
  router.get('/mias', validate({ query: reservationQuery }), async (req, res) => res.json(await listReservations(pool, req.data.query, req.auth.usuario_id)));
  router.get('/disponibilidad', validate({ query: availabilityQuery }), async (req, res) => res.json(requireRecord(await availability(pool, req.data.query), 'Unidad no encontrada')));
  router.get('/', requireAdmin, validate({ query: reservationQuery }), async (req, res) => res.json(await listReservations(pool, req.data.query)));
  router.get('/:id', validate({ params: idParams }), async (req, res) => {
    const admin = req.auth.atribucion_admin && req.auth.rol !== 'estudiante';
    res.json(requireRecord(await reservationDetail(pool, req.data.params.id, admin ? null : req.auth.usuario_id)));
  });
  router.post('/', requireCsrf, validate({ body: reservationSchema }), async (req, res) => res.status(201).json(await requestReservation(pool, req.auth, req.data.body)));
  for (const [path, state, schema, admin] of [
    ['confirmar', 'confirmada', approvalSchema, true], ['rechazar', 'rechazada', reasonSchema, true], ['cancelar', 'cancelada', reasonSchema, false],
  ]) {
    router.post(`/:id/${path}`, ...(admin ? [requireAdmin] : []), requireCsrf,
      validate({ params: idParams, body: schema }), async (req, res) => res.json(await decide(pool, req.auth, req.data.params.id, state, req.data.body)));
  }
  return router;
}
