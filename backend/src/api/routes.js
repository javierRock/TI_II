import { Router } from 'express';
import { authRoutes } from '../modules/autenticacion/autenticacion.routes.js';
import { peopleRoutes, planRoutes } from '../modules/personas/personas.routes.js';
import { catalogRoutes, inventoryRoutes } from '../modules/inventario/inventario.routes.js';
import { policyRoutes } from '../modules/politicas/politicas.routes.js';
import { loanRoutes } from '../modules/prestamos/prestamos.routes.js';
import { auditRoutes } from '../modules/auditoria/auditoria.routes.js';

export function apiRoutes(pool, config) {
  const router = Router();
  router.use('/auth', authRoutes(pool, config));
  router.use('/personas', peopleRoutes(pool));
  router.use('/planes-estudio', planRoutes(pool));
  router.use('/catalogo', catalogRoutes(pool));
  router.use('/inventario', inventoryRoutes(pool));
  router.use('/politicas', policyRoutes(pool));
  router.use('/prestamos', loanRoutes(pool));
  router.use('/auditoria', auditRoutes(pool));
  return router;
}
