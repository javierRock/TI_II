import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createApp } from '../../src/app.js';
import { testPool } from '../helpers/database.js';
import { migrateDatabase } from '../../scripts/migrate.js';
import { seedDemo } from '../../scripts/seed-demo-data.js';
import { localDate } from '../../../frontend/js/format.js';

test('navegador: login, catálogo, reserva propia, permisos y logout', async () => {
  const pool = testPool();
  let server, browser;
  try {
    await migrateDatabase(pool);
    await seedDemo(pool, process.env);
    let app;
    server = createServer((request, response) => app(request, response)).listen(0, '127.0.0.1');
    await once(server, 'listening');
    app = createApp(pool, { appOrigin: `http://127.0.0.1:${server.address().port}` });
    const executablePath =
      process.env.BROWSER_EXECUTABLE_PATH ??
      ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: process.env.BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('[name=nombre_usuario]').fill('demo.estudiante1');
    await page.locator('[name=password]').fill(process.env.DEMO_USER_PASSWORD);
    await page.locator('#login-form button').click();
    await page.locator('#workspace').waitFor({ state: 'visible' });
    assert.equal(await page.locator('a[href="#personas"]').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await page.locator('a[href="#reservas"]').click();
    await page.getByRole('button', { name: 'Solicitar reserva', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar unidad' }).fill('DEMO-LIB-1-1');
    await page.getByRole('button', { name: 'Buscar registros' }).click();
    await page
      .locator('select[name=unidad_id] option')
      .filter({ hasText: 'DEMO-LIB-1-1' })
      .waitFor({ state: 'attached' });
    const value = await page
      .locator('select[name=unidad_id] option')
      .filter({ hasText: 'DEMO-LIB-1-1' })
      .getAttribute('value');
    await page.locator('select[name=unidad_id]').selectOption(value);
    const start = new Date(Date.now() + 86400000),
      end = new Date(+start + 1800000);
    await page.locator('[name=inicio]').fill(localDate(start));
    await page.locator('[name=fin]').fill(localDate(end));
    await page.locator('[name=uso_previsto]').fill('Reserva desde navegador, prueba automatizada');
    await page.locator('#editor input[type=checkbox]').check();
    await page.locator('#editor button[type=submit]').click();
    await page.locator('#editor').waitFor({ state: 'hidden' });
    await page.getByRole('cell', { name: 'Pendiente', exact: true }).first().waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('#workspace').isVisible(), true);
    await page.locator('#logout').click();
    await page.locator('#login').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  }
});
