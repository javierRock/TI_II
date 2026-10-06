import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { idParams, searchQuery, estadoPersona } from '../../shared/schemas.js';
import { personSchema, personPatch, accountSchema, accountPatch, profileSchema, planSchema } from './personas.schemas.js';
import { listPeople, listPlans } from './personas.repository.js';
import * as service from './personas.service.js';

export function peopleRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool), requireAdmin);
  router.get('/', validate({ query: searchQuery }), async (req, res) => res.json(await listPeople(pool, req.data.query)));
  router.get('/:id', validate({ params: idParams }), async (req, res) => res.json(await service.personDetail(pool, req.data.params.id)));
  router.post('/', requireCsrf, validate({ body: personSchema }), async (req, res) => {
    res.status(201).json(await service.createPerson(pool, req.auth, req.data.body));
  });
  router.patch('/:id', requireCsrf, validate({ params: idParams, body: personPatch }), async (req, res) => {
    res.json(await service.editPerson(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.patch('/:id/estado', requireCsrf, validate({ params: idParams, body: estadoPersona }), async (req, res) => {
    res.json(await service.setPersonState(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.post('/:id/cuenta', requireCsrf, validate({ params: idParams, body: accountSchema }), async (req, res) => {
    res.status(201).json(await service.createAccount(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.patch('/:id/cuenta', requireCsrf, validate({ params: idParams, body: accountPatch }), async (req, res) => {
    res.json(await service.editAccount(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.put('/:id/perfil', requireCsrf, validate({ params: idParams, body: profileSchema }), async (req, res) => {
    res.json(await service.saveProfile(pool, req.auth, req.data.params.id, req.data.body));
  });
  return router;
}

export function planRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool));
  router.get('/', validate({ query: searchQuery }), async (req, res) => res.json(await listPlans(pool, req.data.query)));
  router.post('/', requireAdmin, requireCsrf, validate({ body: planSchema }), async (req, res) => {
    res.status(201).json(await service.createPlan(pool, req.auth, req.data.body));
  });
  return router;
}
