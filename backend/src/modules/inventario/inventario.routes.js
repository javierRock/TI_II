import { Router } from 'express';
import { authenticate, requireAdmin } from '../../middleware/autenticacion.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validacion.js';
import { idParams } from '../../shared/schemas.js';
import { catalogQuery, unitsQuery, goodSchema, goodPatch, unitSchema, unitPatch, unitState } from './inventario.schemas.js';
import * as repository from './inventario.repository.js';
import * as service from './inventario.service.js';

export function catalogRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool));
  router.get('/tipos', async (_req, res) => res.json({ datos: await repository.listTypes(pool) }));
  router.get('/bienes', validate({ query: catalogQuery }), async (req, res) => res.json(await repository.listGoods(pool, req.data.query)));
  router.get('/bienes/:id', validate({ params: idParams }), async (req, res) => res.json(await service.goodDetail(pool, req.data.params.id)));
  router.get('/unidades', validate({ query: unitsQuery }), async (req, res) => res.json(await repository.listUnits(pool, req.data.query)));
  return router;
}

export function inventoryRoutes(pool) {
  const router = Router();
  router.use(authenticate(pool), requireAdmin);
  router.get('/unidades/:id', validate({ params: idParams }), async (req, res) => res.json(await service.unitDetail(pool, req.data.params.id)));
  router.post('/bienes', requireCsrf, validate({ body: goodSchema }), async (req, res) => {
    res.status(201).json(await service.createGood(pool, req.auth, req.data.body));
  });
  router.patch('/bienes/:id', requireCsrf, validate({ params: idParams, body: goodPatch }), async (req, res) => {
    res.json(await service.editGood(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.post('/unidades', requireCsrf, validate({ body: unitSchema }), async (req, res) => {
    res.status(201).json(await service.createUnit(pool, req.auth, req.data.body));
  });
  router.patch('/unidades/:id', requireCsrf, validate({ params: idParams, body: unitPatch }), async (req, res) => {
    res.json(await service.editUnit(pool, req.auth, req.data.params.id, req.data.body));
  });
  router.patch('/unidades/:id/estado', requireCsrf, validate({ params: idParams, body: unitState }), async (req, res) => {
    res.json(await service.changeUnitState(pool, req.auth, req.data.params.id, req.data.body));
  });
  return router;
}
