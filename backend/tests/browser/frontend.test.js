import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createApp } from '../../src/app.js';
import { withTransaction } from '../../src/db/transaction.js';
import { hashPassword } from '../../src/core/seguridad.js';
import { fixture, testPool } from '../helpers/database.js';
import { localDate } from '../../../frontend/js/format.js';

const pool = testPool();
const suffix = randomUUID().slice(0, 8);
const password = `Clave de prueba navegador ${suffix}`;
const personName = `Persona navegador ${suffix}`;
const username = `navegador-${suffix}`;
const goodName = `Bien navegador ${suffix}`;
const unitCode = `NAV-${suffix}`.toUpperCase();
const policyName = `Política navegador ${suffix}`;
const xssName = `Visor <img src=x onerror="window.inyectado=1"> ${suffix}`;
const artifacts = new URL('../../../.local/browser-tests/', import.meta.url);
let server, base, browser, context, page, data, adminUsername, personId, borrowerId, policyId, loanId;
const pageErrors = [];

async function login(target, user) {
  await target.goto(base);
  await target.locator('#login-form input[name="nombre_usuario"]').fill(user);
  await target.locator('#login-form input[name="password"]').fill(password);
  await target.locator('#login-form button[type="submit"]').click();
  await target.locator('#workspace').waitFor({ state: 'visible' });
}
async function navigate(key) {
  const current = await page.locator('#navigation a[aria-current="page"]').getAttribute('href');
  if (current === `#${key}`) {
    await page.locator('#content[aria-busy]').waitFor({ state: 'detached' });
    return;
  }
  await page.locator(`#navigation a[href="#${key}"]`).click();
  await page.locator(`#navigation a[href="#${key}"][aria-current="page"]`).waitFor();
  await page.locator('#content[aria-busy]').waitFor({ state: 'detached' });
}
async function search(text) {
  await page.locator('#content .filters input[name="q"]').fill(text);
  await page.locator('#content .filters button[type="submit"]').click();
  await page.locator('#content tbody tr').filter({ hasText: text }).first().waitFor();
}
async function submit(title = 'Guardar') {
  const response = page.waitForResponse((r) => ['POST', 'PATCH', 'PUT'].includes(r.request().method()) && r.url().includes('/api/v1'));
  await page.locator('#editor').getByRole('button', { name: title, exact: true }).click();
  return response;
}
async function confirm() { await page.locator('#editor input[name="confirmar"]').check(); }
async function dialogClosed() { await page.locator('#editor').waitFor({ state: 'hidden' }); }

before(async () => {
  const hash = await hashPassword(password);
  data = await withTransaction(pool, async (client) => {
    const values = await fixture(client, { historical: true });
    await client.query('UPDATE prestamos.usuarios SET password_hash = $2 WHERE id = $1', [values.adminId, hash]);
    await client.query('UPDATE prestamos.bienes SET nombre = $2 WHERE id = $1', [values.bienId, xssName]);
    return values;
  });
  adminUsername = (await pool.query('SELECT nombre_usuario FROM prestamos.usuarios WHERE id = $1', [data.adminId])).rows[0].nombre_usuario;
  server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp(pool, { appOrigin: base, loginLimit: 1000 }));
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  browser = await chromium.launch({ executablePath, headless: true,
    args: process.env.BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : [] });
  context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  context.setDefaultTimeout(8000);
  page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await mkdir(artifacts, { recursive: true });
});
after(async () => {
  try {
    // Conservar fixtures e historial, cerrar solamente la versión de esta prueba.
    if (policyId) {
      await pool.query(`UPDATE prestamos.politicas_prestamo SET vigencia_fin = clock_timestamp() + interval '200 milliseconds'
        WHERE id = $1 AND aprobada_en IS NOT NULL AND (vigencia_fin IS NULL OR vigencia_fin > clock_timestamp() + interval '200 milliseconds')`, [policyId]);
      await delay(250);
    }
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

test('acceso real con cookie HttpOnly, errores legibles y sin almacenamiento de secretos', async () => {
  await page.goto(base);
  await page.locator('#login').waitFor({ state: 'visible' });
  await page.screenshot({ path: new URL('acceso.png', artifacts).pathname, fullPage: true });
  await page.locator('#login-form input[name="nombre_usuario"]').fill(adminUsername);
  await page.locator('#login-form input[name="password"]').fill('incorrecta');
  await page.locator('#login-form button').click();
  await page.locator('#login-error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#login-error').innerText(), /Credenciales inválidas/);
  assert.equal(await page.locator('#login-form input[name="password"]').inputValue(), '');
  await login(page, adminUsername);
  const cookie = (await context.cookies()).find((c) => c.name === 'prestamos_session');
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.path, '/api/v1');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
});

test('catálogo paginado escapa contenido HTML y funciona en pantalla móvil', async () => {
  await navigate('catalogo');
  await search(suffix);
  assert.ok((await page.locator('#content').innerText()).includes(xssName));
  assert.equal(await page.locator('#content img').count(), 0);
  assert.equal(await page.evaluate(() => window.inyectado), undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: new URL('catalogo-movil.png', artifacts).pathname, fullPage: true });
  await page.setViewportSize({ width: 1365, height: 900 });
});

test('administrador registra plan, persona y cuenta docente con perfil explícitamente validado', async () => {
  await navigate('planes');
  await page.getByRole('button', { name: 'Registrar plan', exact: true }).click();
  await page.locator('#editor input[name="codigo"]').fill(`PLAN-${suffix}`);
  await page.locator('#editor input[name="programa"]').fill('Programa de prueba de navegador');
  await page.locator('#editor input[name="nombre"]').fill(`Plan navegador ${suffix}`);
  await page.locator('#editor textarea[name="semestres"]').fill('1\n15');
  await confirm();
  assert.equal((await submit()).status(), 201);
  await dialogClosed();
  await navigate('personas');
  await page.getByRole('button', { name: 'Registrar persona', exact: true }).click();
  await page.locator('#editor input[name="documento"]').fill(`DOC-${suffix}`);
  await page.locator('#editor input[name="nombre_completo"]').fill(personName);
  await page.locator('#editor input[name="correo"]').fill(`${suffix}@example.test`);
  await confirm();
  const response = await submit();
  assert.equal(response.status(), 201);
  personId = (await response.json()).id;
  await dialogClosed();
  await search(personName);
  await page.getByRole('button', { name: 'Gestionar', exact: true }).click();
  await page.locator('#editor').getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.locator('#editor input[name="nombre_usuario"]').fill(username);
  await page.locator('#editor input[name="password"]').fill(password);
  await page.locator('#editor select[name="rol"]').selectOption('docente');
  assert.equal(await page.locator('#editor input[name="habilitado"]').isChecked(), false);
  await page.locator('#editor input[name="codigo"]').fill(`PROF-${suffix}`);
  await page.locator('#editor input[name="especialidad"]').fill('Especialidad de prueba');
  await page.locator('#editor input[name="vinculacion"]').fill('Escuela');
  await page.locator('#editor input[name="habilitado"]').check();
  await confirm();
  const account = await submit();
  assert.equal(account.status(), 201);
  borrowerId = (await account.json()).id;
  assert.equal(typeof borrowerId, 'string');
  await dialogClosed();
});

test('políticas sin valores institucionales por defecto; creación y aprobación desde navegador', async () => {
  await navigate('politicas');
  await page.getByRole('button', { name: 'Crear borrador', exact: true }).click();
  assert.equal(await page.locator('#editor input[name="cupo_total"]').inputValue(), '');
  assert.equal(await page.locator('#editor input[name="duracion_cantidad"]').inputValue(), '');
  await page.locator('#editor select[name="rol"]').selectOption('docente');
  await page.locator('#editor input[name="nombre"]').fill(policyName);
  await page.locator('#editor input[name="vigencia_inicio"]').fill(localDate(new Date(Date.now() - 1000)));
  await page.locator('#editor input[name="vigencia_fin"]').fill(localDate(new Date(Date.now() + 120000)));
  await page.locator('#editor input[name="cupo_total"]').fill('2');
  await page.locator('#editor input[name="duracion_cantidad"]').fill('1');
  await page.locator('#editor select[name="duracion_unidad"]').selectOption('horas');
  await page.locator('#editor input[name="tolerancia_horas"]').fill('0');
  await page.locator('#editor input[name="retiro"]').check();
  await confirm();
  const response = await submit();
  assert.equal(response.status(), 201);
  policyId = (await response.json()).id;
  await dialogClosed();
  const row = page.locator('tr').filter({ hasText: policyName });
  await row.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await page.locator('#editor textarea[name="referencia_aprobacion"]').fill('Acuerdo FICTICIO exclusivo de prueba de navegador');
  await confirm();
  assert.equal((await submit('Aprobar versión')).status(), 200);
  await dialogClosed();
  await row.getByText('Vigente', { exact: true }).waitFor();
  assert.equal(await row.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
});

test('ficha y unidad registradas con buscador, accesorios repetidos y confirmación', async () => {
  await navigate('fichas');
  await page.getByRole('button', { name: 'Crear ficha', exact: true }).click();
  const types = await page.locator('#editor select[name="tipo_id"] option').allTextContents();
  assert.ok(types.includes('Parlante'));
  await page.locator('#editor select[name="tipo_id"]').selectOption({ label: 'Parlante' });
  await page.locator('#editor input[name="nombre"]').fill(goodName);
  await page.locator('#editor input[name="marca"]').fill('Marca de prueba');
  await page.locator('#editor input[name="modelo"]').fill('Modelo de prueba');
  await confirm();
  assert.equal((await submit()).status(), 201);
  await dialogClosed();
  await navigate('inventario');
  await page.getByRole('button', { name: 'Registrar unidad', exact: true }).click();
  await page.locator('#editor input[type="search"]').fill(goodName);
  await page.locator('#editor').getByRole('button', { name: 'Buscar registros', exact: true }).click();
  await page.locator('#editor select[name="bien_id"] option').filter({ hasText: goodName }).waitFor({ state: 'attached' });
  const option = await page.locator('#editor select[name="bien_id"] option').filter({ hasText: goodName }).getAttribute('value');
  await page.locator('#editor select[name="bien_id"]').selectOption(option);
  await page.locator('#editor input[name="codigo_inventario"]').fill(unitCode);
  await page.locator('#editor select[name="estado"]').selectOption('disponible');
  await page.locator('#editor input[name="ubicacion"]').fill('Escuela · Prueba');
  await page.locator('#editor textarea[name="condicion_fisica"]').fill('Inspeccionado y apto');
  await page.locator('#editor textarea[name="accesorios"]').fill('Cable\nCable');
  await confirm();
  assert.equal((await submit()).status(), 201);
  await dialogClosed();
  await search(unitCode);
});

test('entrega valida plazo real y un doble clic no duplica la mutación', async () => {
  await page.locator('tr').filter({ hasText: unitCode }).getByRole('button', { name: 'Entregar', exact: true }).click();
  await page.locator('#editor input[type="search"]').fill(personName);
  await page.locator('#editor').getByRole('button', { name: 'Buscar registros', exact: true }).click();
  await page.locator('#editor select[name="persona_id"] option').filter({ hasText: personName }).waitFor({ state: 'attached' });
  await page.locator('#editor select[name="persona_id"]').selectOption(personId);
  assert.equal(await page.locator('#editor textarea[name="accesorios_entrega"]').inputValue(), 'Cable\nCable');
  await page.locator('#editor input[name="vencimiento"]').fill(localDate(new Date(Date.now() + 7200000)));
  await page.locator('#editor select[name="modalidad"]').selectOption('retiro');
  await confirm();
  // Consulta de persona precede a la mutación: esperar explícitamente el préstamo.
  const invalid = page.waitForResponse((r) => r.url().endsWith('/api/v1/prestamos') && r.request().method() === 'POST');
  await page.locator('#editor').getByRole('button', { name: 'Confirmar entrega', exact: true }).click();
  assert.equal((await invalid).status(), 400);
  await page.locator('#editor .error').waitFor({ state: 'visible' });
  assert.match(await page.locator('#editor .error').innerText(), /duración máxima/);
  await page.locator('#editor input[name="vencimiento"]').fill(localDate(new Date(Date.now() + 1800000)));
  let writes = 0;
  const count = (request) => { if (request.url().endsWith('/api/v1/prestamos') && request.method() === 'POST') writes++; };
  page.on('request', count);
  const accepted = page.waitForResponse((r) => r.url().endsWith('/api/v1/prestamos') && r.request().method() === 'POST');
  await page.locator('#editor button[type="submit"]').evaluate((node) => { node.click(); node.click(); });
  const result = await accepted;
  assert.equal(result.status(), 201);
  loanId = (await result.json()).id;
  await dialogClosed();
  page.off('request', count);
  assert.equal(writes, 1);
  await page.locator('tr').filter({ hasText: unitCode }).getByText('Prestada', { exact: true }).waitFor();
});

test('devolución no infiere aptitud y un faltante impide volver a disponible', async () => {
  await navigate('prestamos');
  const row = page.locator('tr').filter({ hasText: unitCode });
  await row.getByRole('button', { name: 'Recibir', exact: true }).click();
  assert.equal(await page.locator('#editor select[name="apta"]').inputValue(), '');
  assert.equal(await page.locator('#editor select[name="estado_unidad"] option[value="disponible"]').evaluate((node) => node.disabled), true);
  await page.locator('#editor textarea[name="condicion_devolucion"]').fill('Falta un cable');
  await page.locator('#editor textarea[name="accesorios_devolucion"]').fill('Cable');
  await page.locator('#editor select[name="apta"]').selectOption('true');
  await page.locator('#editor select[name="estado_unidad"]').selectOption('disponible');
  await confirm();
  assert.equal((await submit('Confirmar devolución')).status(), 400);
  await page.locator('#editor .error').waitFor({ state: 'visible' });
  await page.locator('#editor select[name="apta"]').selectOption('false');
  assert.equal(await page.locator('#editor select[name="estado_unidad"]').inputValue(), '');
  await page.locator('#editor select[name="estado_unidad"]').selectOption('mantenimiento');
  assert.equal((await submit('Confirmar devolución')).status(), 200);
  await dialogClosed();
  await row.getByText('Devuelto', { exact: true }).waitFor();
  await navigate('inventario');
  await search(unitCode);
  await page.locator('tr').filter({ hasText: unitCode }).getByText('Mantenimiento', { exact: true }).waitFor();
  await page.screenshot({ path: new URL('inventario.png', artifacts).pathname, fullPage: true });
});

test('editar inventario y salir de mantenimiento no reescribe la inspección histórica', async () => {
  const row = page.locator('tr').filter({ hasText: unitCode });
  await row.getByRole('button', { name: 'Gestionar', exact: true }).click();
  assert.equal(await page.locator('#editor textarea[name="accesorios"]').inputValue(), 'Cable');
  await page.locator('#editor textarea[name="condicion_fisica"]').fill('Revisado después de mantenimiento');
  await page.locator('#editor textarea[name="accesorios"]').fill('Cable\nCable');
  await confirm();
  assert.equal((await submit()).status(), 200);
  await dialogClosed();
  await row.getByRole('button', { name: 'Gestionar', exact: true }).click();
  await page.locator('#editor').getByRole('button', { name: 'Cambiar estado', exact: true }).click();
  await page.locator('#editor select[name="estado"]').selectOption('disponible');
  await confirm();
  assert.equal((await submit()).status(), 200);
  await dialogClosed();
  await row.getByText('Disponible', { exact: true }).waitFor();
  const loan = (await pool.query('SELECT devolucion_apta, destino_devolucion FROM prestamos.prestamos WHERE id = $1', [loanId])).rows[0];
  assert.deepEqual(loan, { devolucion_apta: false, destino_devolucion: 'mantenimiento' });
});

test('usuario normal solo consulta préstamos propios y al revocar sesión se limpia la interfaz', async () => {
  const borrowerContext = await browser.newContext();
  borrowerContext.setDefaultTimeout(8000);
  const target = await borrowerContext.newPage();
  try {
    await login(target, username);
    await target.reload();
    await target.locator('#workspace').waitFor({ state: 'visible' });
    assert.equal(await target.locator('#navigation a[href="#personas"]').count(), 0);
    await target.locator('#navigation a[href="#mios"]').click();
    await target.locator('tr').filter({ hasText: unitCode }).waitFor();
    assert.equal(await target.getByRole('button', { name: 'Recibir', exact: true }).count(), 0);
    await target.evaluate(() => { location.hash = '#personas'; });
    await target.waitForURL(`${base}/#catalogo`);
    await target.locator('#content[aria-busy]').waitFor({ state: 'detached' });
    await pool.query('UPDATE prestamos.sesiones SET revocada_en = clock_timestamp() WHERE usuario_id = $1 AND revocada_en IS NULL', [borrowerId]);
    await target.evaluate(() => { location.hash = '#mios'; });
    await target.locator('#login').waitFor({ state: 'visible' });
    assert.equal(await target.locator('#content').innerText(), '');
    assert.equal(await target.locator('#identity').innerText(), '');
    assert.equal(await target.evaluate(() => localStorage.length + sessionStorage.length), 0);
  } finally { await borrowerContext.close(); }
});

test('auditoría consultable, fallo de conexión recuperable y logout real', async () => {
  await navigate('auditoria');
  await page.locator('#content input[name="entidad"]').fill('prestamos');
  await page.locator('#content input[name="entidad_id"]').fill(loanId);
  await page.locator('#content input[name="accion"]').fill('prestamo.devuelto');
  await page.locator('#content .filters button').click();
  await page.getByRole('button', { name: 'Ver evento', exact: true }).click();
  await page.locator('#editor pre').waitFor();
  assert.match(await page.locator('#editor pre').innerText(), /accesorios_faltantes/);
  await page.locator('#editor').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.route('**/api/v1/catalogo/tipos', (route) => route.abort());
  await navigate('catalogo');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
  await page.unroute('**/api/v1/catalogo/tipos');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await page.locator('#content .filters').waitFor();
  assert.deepEqual(pageErrors, []);
  await page.locator('#logout').click();
  await page.locator('#login').waitFor({ state: 'visible' });
  assert.equal((await context.cookies()).some((c) => c.name === 'prestamos_session'), false);
});
