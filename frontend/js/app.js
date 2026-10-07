import { createApi } from './api.js';
import { isAdmin, label, errorText } from './format.js';
import { el, notify, closeDialog, button } from './ui.js';
import { catalog, goods } from './views/catalog.js';
import { loans } from './views/loans.js';
import { people, plans } from './views/people.js';
import { policies } from './views/policies.js';
import { audit } from './views/audit.js';

const root = document.querySelector('#content');
const login = document.querySelector('#login');
const form = document.querySelector('#login-form');
const workspace = document.querySelector('#workspace');
const sessionBox = document.querySelector('#session');
let user = null, controller, authRevision = 0;
const api = createApi({ onUnauthorized: () => showLogin('Tu sesión terminó. Inicia sesión nuevamente.') });
const routes = {
  catalogo: { title: 'Catálogo', render: catalog },
  mios: { title: 'Mis préstamos', render: loans },
  prestamos: { title: 'Entregas y devoluciones', admin: true, render: (ctx) => loans(ctx, true) },
  inventario: { title: 'Inventario', admin: true, render: (ctx) => catalog(ctx, true) },
  fichas: { title: 'Fichas de bienes', admin: true, render: goods },
  personas: { title: 'Personas y cuentas', admin: true, render: people },
  planes: { title: 'Planes académicos', admin: true, render: plans },
  politicas: { title: 'Políticas', admin: true, render: policies },
  auditoria: { title: 'Auditoría', admin: true, render: audit },
};
function showLogin(message = '') {
  authRevision++;
  controller?.abort();
  api.setSession(null);
  user = null;
  closeDialog();
  root.replaceChildren();
  document.querySelector('#navigation').replaceChildren();
  document.querySelector('#identity').textContent = '';
  workspace.hidden = sessionBox.hidden = true;
  login.hidden = false;
  document.title = 'Acceso · Préstamos';
  form.elements.password.value = '';
  notify(message);
}
async function enter(session) {
  api.setSession(session);
  user = session.usuario;
  login.hidden = true;
  workspace.hidden = sessionBox.hidden = false;
  document.querySelector('#identity').textContent = `${user.nombre_completo} · ${label(user.rol)}${isAdmin(user) ? ' · Gestión' : ''}`;
  const allowed = Object.entries(routes).filter(([, r]) => !r.admin || isAdmin(user));
  document.querySelector('#navigation').replaceChildren(...allowed.map(([key, r]) => el('a', { href: `#${key}` }, r.title)));
  await navigate();
}
async function navigate() {
  if (!user) return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  closeDialog();
  let key = location.hash.slice(1) || 'catalogo';
  if (!Object.hasOwn(routes, key) || (routes[key].admin && !isAdmin(user))) {
    key = 'catalogo';
    history.replaceState(null, '', '#catalogo');
  }
  for (const link of document.querySelectorAll('#navigation a')) {
    if (link.hash === `#${key}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  root.replaceChildren(el('p', { class: 'muted' }, 'Cargando…'));
  root.setAttribute('aria-busy', 'true');
  document.title = `${routes[key].title} · Préstamos`;
  try {
    await routes[key].render({ api, root, signal, user });
    if (!signal.aborted) root.focus({ preventScroll: true });
  } catch (error) {
    if (!signal.aborted && error.name !== 'AbortError') root.replaceChildren(el('p', { class: 'error', role: 'alert' }, errorText(error)), button('Reintentar', navigate));
  } finally { if (!signal.aborted) root.removeAttribute('aria-busy'); }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const send = form.querySelector('button');
  if (send.disabled || !form.reportValidity()) return;
  const revision = ++authRevision;
  send.disabled = true;
  const errorBox = document.querySelector('#login-error');
  errorBox.hidden = true;
  try {
    const session = await api.request('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
    if (revision !== authRevision) return;
    notify('');
    await enter(session);
  } catch (error) { errorBox.textContent = errorText(error); errorBox.hidden = false; }
  finally { form.elements.password.value = ''; send.disabled = false; }
});
document.querySelector('#logout').addEventListener('click', async (event) => {
  const send = event.currentTarget;
  if (send.disabled) return;
  send.disabled = true;
  try { await api.request('/auth/logout', { method: 'POST', body: {} }); showLogin('Sesión cerrada.'); }
  catch (error) { notify(errorText(error), true); }
  finally { send.disabled = false; }
});
window.addEventListener('hashchange', navigate);
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  if (user) root.focus();
  else form.elements.nombre_usuario.focus();
});
// Recuperar identidad/CSRF al recargar sin leer ni persistir la cookie.
try { await enter(await api.request('/auth/me')); }
catch (error) { showLogin(error.status === 401 ? '' : errorText(error)); }
