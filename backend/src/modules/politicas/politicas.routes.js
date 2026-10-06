import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { idParams } from '../../shared/schemas.js';
import { requireRecord } from '../../shared/errors.js';
import { policySchema, policyPatch, policyQuery, approvalSchema, endValiditySchema } from './politicas.schemas.js';
import { listPolicies, findPolicy } from './politicas.repository.js';
import * as service from './politicas.service.js';

export function policyRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool), requireAdmin);
  router.get('/', validate({ query: policyQuery }), async (req, res) => res.json(await listPolicies(pool, req.data.query)));
  router.get('/:id', validate({ params: idParams }), async (req, res) => res.json(requireRecord(await findPolicy(pool, req.data.params.id))));
  router.post('/', requireCsrf, validate({ body: policySchema }), async (req, res) => res.status(201).json(await service.createPolicy(pool, req.auth, req.data.body)));
  router.patch('/:id', requireCsrf, validate({ params: idParams, body: policyPatch }), async (req, res) => res.json(await service.editPolicy(pool, req.auth, req.data.params.id, req.data.body)));
  router.post('/:id/aprobar', requireCsrf, validate({ params: idParams, body: approvalSchema }), async (req, res) => res.json(await service.approvePolicy(pool, req.auth, req.data.params.id, req.data.body)));
  router.patch('/:id/vigencia', requireCsrf, validate({ params: idParams, body: endValiditySchema }), async (req, res) => res.json(await service.endPolicyValidity(pool, req.auth, req.data.params.id, req.data.body)));
  return router;
}
