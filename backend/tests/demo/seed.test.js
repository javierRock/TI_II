import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';
import { databaseUrls } from '../../src/config/env.js';
import { identifier } from '../../scripts/provision-db.js';
import { migrateDatabase } from '../../scripts/migrate.js';
import { seedDemo } from '../../scripts/seed-demo-data.js';
import { readDemoConfiguration } from '../../scripts/demo-config.js';
import { createApp } from '../../src/app.js';
import { verifyPassword } from '../../src/core/seguridad.js';
import { withTransaction } from '../../src/db/transaction.js';

async function temporaryDemo(operation) {
  const name = `prestamos_seed_${randomBytes(6).toString('hex')}_demo`;
  const base = databaseUrls();
  const migration = new URL(base.migration);
  const application = new URL(base.application);
  migration.pathname = `/${name}`;
  application.pathname = `/${name}`;
  const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL });
  let ownerPool, apiPool, created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${identifier(name)} OWNER ${identifier(decodeURIComponent(migration.username))} TEMPLATE template0`);
    created = true;
    await migrateDatabase({ migration: migration.href, application: application.href });
    ownerPool = new pg.Pool({ connectionString: migration.href });
    apiPool = new pg.Pool({ connectionString: application.href });
    const configuration = readDemoConfiguration({ DEMO_MODE: 'true', NODE_ENV: 'test',
      MIGRATION_DATABASE_URL: migration.href, DATABASE_URL: application.href,
      DEMO_ADMIN_PASSWORD: randomBytes(24).toString('hex'), DEMO_USER_PASSWORD: randomBytes(24).toString('hex') });
    return await operation({ ownerPool, apiPool, configuration });
  } finally {
    await ownerPool?.end();
    await apiPool?.end();
    // Eliminar únicamente la base temporal que creó este test, nunca una existente.
    if (created) await admin.query(`DROP DATABASE ${identifier(name)}`);
    await admin.end();
  }
}

test('demo completa: carga concurrente, hashes, login, devolución e idempotencia', async (t) => {
  await temporaryDemo(async ({ ownerPool, apiPool, configuration }) => {
    let manifest;
    await t.test('dos cargas concurrentes producen una sola demostración', async () => {
      const results = await Promise.all([seedDemo(ownerPool, configuration), seedDemo(ownerPool, configuration)]);
      assert.equal(results.filter((result) => result.creada).length, 1);
      manifest = results.find((result) => result.creada);
      for (const [table, expected] of [['personas', 4], ['usuarios', 4], ['perfiles_academicos', 3],
        ['planes_estudio', 1], ['bienes', 5], ['unidades_inventario', 7], ['politicas_prestamo', 1], ['prestamos', 2]]) {
        assert.equal((await apiPool.query(`SELECT count(*)::int AS total FROM prestamos.${table}`)).rows[0].total, expected, table);
      }
      assert.deepEqual((await apiPool.query('SELECT estado, count(*)::int AS total FROM prestamos.v_prestamos_estado GROUP BY estado ORDER BY estado')).rows,
        [{ estado: 'activo', total: 1 }, { estado: 'devuelto', total: 1 }]);
      assert.equal((await apiPool.query("SELECT count(*)::int AS total FROM prestamos.usuarios WHERE atribucion_admin")).rows[0].total, 1);
    });
    await t.test('contraseñas verificables con sales distintas y auditoría sin secretos', async () => {
      const accounts = (await apiPool.query('SELECT nombre_usuario, password_hash FROM prestamos.usuarios ORDER BY id')).rows;
      assert.equal(new Set(accounts.map((row) => row.password_hash)).size, 4);
      for (const account of accounts) {
        assert.ok(await verifyPassword(account.password_hash, account.nombre_usuario === 'demo.admin'
          ? configuration.adminPassword : configuration.userPassword));
      }
      const events = JSON.stringify((await apiPool.query('SELECT detalle FROM prestamos.eventos_historial')).rows);
      assert.equal(events.includes(configuration.adminPassword), false);
      assert.equal(events.includes(configuration.userPassword), false);
      assert.equal(events.includes('$argon2id$'), false);
    });
    await t.test('las cuatro cuentas acceden y la API permite devolver el préstamo inicial', async () => {
      const server = createApp(apiPool).listen(0, '127.0.0.1');
      await once(server, 'listening');
      const origin = `http://127.0.0.1:${server.address().port}`;
      try {
        let admin;
        for (const account of Object.values(manifest.cuentas)) {
          const response = await fetch(`${origin}/api/v1/auth/login`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre_usuario: account.usuario,
              password: account.usuario === 'demo.admin' ? configuration.adminPassword : configuration.userPassword }) });
          const body = await response.json();
          assert.equal(response.status, 200, JSON.stringify(body));
          const cookie = response.headers.getSetCookie()[0].split(';')[0];
          if (account.usuario === 'demo.admin') admin = { cookie, csrf: body.csrf_token };
          else assert.equal((await fetch(`${origin}/api/v1/personas`, { headers: { Cookie: cookie } })).status, 403);
        }
        const response = await fetch(`${origin}/api/v1/prestamos/${manifest.prestamo_activo_id}/devolucion`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
          body: JSON.stringify({ condicion_devolucion: 'Inspección de prueba, apto', accesorios_devolucion: [],
            apta: true, estado_unidad: 'disponible', confirmar: true }),
        });
        assert.equal(response.status, 200, JSON.stringify(await response.json()));
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
    await t.test('repetir conserva devolución, desactivación, contraseñas e historial', async () => {
      await withTransaction(ownerPool, async (client) => {
        await client.query("SELECT set_config('app.actor_proceso', 'test:demo', true)");
        await client.query('UPDATE prestamos.usuarios SET activo = false WHERE id = $1', [manifest.cuentas.student2.id]);
      });
      const before = (await apiPool.query('SELECT id, password_hash, activo FROM prestamos.usuarios ORDER BY id')).rows;
      const events = (await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total;
      const result = await seedDemo(ownerPool, { ...configuration, adminPassword: randomBytes(24).toString('hex') });
      assert.equal(result.creada, false);
      assert.deepEqual((await apiPool.query('SELECT id, password_hash, activo FROM prestamos.usuarios ORDER BY id')).rows, before);
      assert.equal((await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total, events);
      assert.equal((await apiPool.query("SELECT count(*)::int AS total FROM prestamos.prestamos WHERE estado_cierre = 'abierto'")).rows[0].total, 0);
    });
  });
});

test('el seed rechaza datos preexistentes sin insertar cuentas o borrar registros', async () => {
  await temporaryDemo(async ({ ownerPool, apiPool, configuration }) => {
    await ownerPool.query("INSERT INTO prestamos.personas (documento, nombre_completo, correo) VALUES ('AJENO', 'Registro ajeno', 'ajeno@example.test')");
    const before = (await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total;
    await assert.rejects(seedDemo(ownerPool, configuration), /registros ajenos/);
    assert.equal((await apiPool.query('SELECT count(*)::int AS total FROM prestamos.personas')).rows[0].total, 1);
    assert.equal((await apiPool.query('SELECT count(*)::int AS total FROM prestamos.usuarios')).rows[0].total, 0);
    assert.equal((await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total, before);
  });
});

test('un fallo intermedio revierte cuentas, perfiles, inventario e historial', async () => {
  await temporaryDemo(async ({ ownerPool, apiPool, configuration }) => {
    await ownerPool.query("UPDATE prestamos.tipos_bien SET habilitado = false WHERE codigo = 'visor_3d'");
    const before = (await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total;
    await assert.rejects(seedDemo(ownerPool, configuration), /tipos de bien habilitados/);
    for (const table of ['personas', 'usuarios', 'perfiles_academicos', 'planes_estudio', 'bienes', 'unidades_inventario']) {
      assert.equal((await apiPool.query(`SELECT count(*)::int AS total FROM prestamos.${table}`)).rows[0].total, 0, table);
    }
    assert.equal((await apiPool.query('SELECT count(*)::int AS total FROM prestamos.eventos_historial')).rows[0].total, before);
  });
});
