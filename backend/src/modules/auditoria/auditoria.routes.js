import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { validate } from '../../middleware/validacion.js';
import { idParams } from '../../shared/schemas.js';
import { requireRecord } from '../../shared/errors.js';
import { auditQuery } from './auditoria.schemas.js';
import { listEvents, findEvent } from './auditoria.repository.js';

export function auditRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool), requireAdmin);
  router.get('/', validate({ query: auditQuery }), async (req, res) => res.json(await listEvents(pool, req.data.query)));
  router.get('/:id', validate({ params: idParams }), async (req, res) => res.json(requireRecord(await findEvent(pool, req.data.params.id))));
  return router;
}
