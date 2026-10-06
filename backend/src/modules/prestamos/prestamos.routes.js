import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { idParams } from '../../shared/schemas.js';
import { requireRecord } from '../../shared/errors.js';
import { deliverySchema, returnSchema, ownQuery, adminQuery } from './prestamos.schemas.js';
import { listLoans, loanDetail } from './prestamos.repository.js';
import { deliver, receive } from './prestamos.service.js';

export function loanRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool));
  router.get('/mios', validate({ query: ownQuery }), async (req, res) => res.json(await listLoans(pool, req.data.query, { userId: req.auth.usuario_id })));
  router.get('/', requireAdmin, validate({ query: adminQuery }), async (req, res) => res.json(await listLoans(pool, req.data.query, { admin: true })));
  router.get('/:id', validate({ params: idParams }), async (req, res) => {
    const admin = req.auth.atribucion_admin && req.auth.rol !== 'estudiante';
    res.json(requireRecord(await loanDetail(pool, req.data.params.id, { userId: admin ? null : req.auth.usuario_id })));
  });
  router.post('/', requireAdmin, requireCsrf, validate({ body: deliverySchema }), async (req, res) => res.status(201).json(await deliver(pool, req.auth, req.data.body)));
  router.post('/:id/devolucion', requireAdmin, requireCsrf, validate({ params: idParams, body: returnSchema }), async (req, res) => res.json(await receive(pool, req.auth, req.data.params.id, req.data.body)));
  return router;
}
