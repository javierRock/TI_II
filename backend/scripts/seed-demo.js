import pg from 'pg';
import '../src/config/env.js';
import { readDemoConfiguration } from './demo-config.js';
import { seedDemo } from './seed-demo-data.js';

const configuration = readDemoConfiguration();
const pool = new pg.Pool({ connectionString: configuration.migration });
try {
  const result = await seedDemo(pool, configuration);
  console.log(result.creada ? 'Demostración creada: 4 cuentas, 5 fichas, 7 unidades y 2 préstamos ficticios.'
    : 'Demostración ya inicializada: no se cambiaron datos ni contraseñas.');
  console.log('Usuarios: demo.admin, demo.estudiante1, demo.estudiante2, demo.docente.');
  console.log('Contraseñas: consultar DEMO_ADMIN_PASSWORD y DEMO_USER_PASSWORD en .env.docker.');
} finally {
  await pool.end();
}
