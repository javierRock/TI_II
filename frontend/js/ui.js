import { label, errorText, query } from './format.js';

// Datos de API siempre se insertan como texto, nunca como HTML ejecutable.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key in node && !key.startsWith('aria-')) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined));
  return node;
}
export const button = (text, action, style = 'secondary') => el('button', { type: 'button', class: style, onclick: action }, text);
export const badge = (value) => el('span', { class: `badge ${Object.hasOwn({ disponible: 1, activo: 1, vigente: 1, vencido: 1, baja: 1, mantenimiento: 1, programada: 1, prestada: 1 }, value) ? value : ''}` }, label(value));
export const actions = (...items) => el('div', { class: 'actions' }, items);
export const header = (title, description, ...items) => el('div', { class: 'page-header' }, el('div', {}, el('h1', {}, title), el('p', {}, description)), actions(...items));
export function details(values) {
  return el('dl', {}, Object.entries(values).flatMap(([key, value]) => [el('dt', {}, key), el('dd', {}, value === null || value === undefined || value === '' ? '—' : String(value))]));
}
export function table(caption, columns, rows) {
  if (!rows.length) return el('div', { class: 'empty' }, el('h2', {}, 'No hay registros'), el('p', { class: 'muted' }, 'Prueba otros filtros o registra los datos autorizados.'));
  return el('div', { class: 'table-wrap', tabindex: 0, 'aria-label': caption }, el('table', {},
    el('caption', {}, caption), el('thead', {}, el('tr', {}, columns.map(([name]) => el('th', { scope: 'col' }, name)))),
    el('tbody', {}, rows.map((row) => el('tr', {}, columns.map(([, render]) => el('td', {}, render(row))))))));
}
export function field(name, title, { type = 'text', required = false, options, value = '', help, full = false, ...attrs } = {}) {
  let input;
  if (options) input = el('select', { name, required, ...attrs }, options.map(([key, text]) => el('option', { value: key }, text)));
  else input = el(type === 'textarea' ? 'textarea' : 'input', { name, ...(type === 'textarea' ? {} : { type }), required, ...attrs });
  if (type === 'checkbox') input.checked = Boolean(value);
  else input.value = value ?? '';
  return el('label', { class: `${full ? 'full' : ''} ${type === 'checkbox' ? 'check' : ''}` },
    ...(type === 'checkbox' ? [input, title] : [title, input]), help ? el('small', {}, help) : null);
}
export const confirmField = (text = 'Confirmo que los datos y la autorización son correctos.') => field('confirmar', text, { type: 'checkbox', required: true, full: true });
export const accessoriesField = (name, title, values = []) => field(name, title, { type: 'textarea', value: values.join('\n'), full: true, help: 'Un accesorio por línea. Repite el nombre si hay varios iguales. Vacío significa ninguno.' });

export function notify(message, error = false) {
  const notice = document.querySelector('#notice');
  notice.textContent = message;
  notice.className = error ? 'error' : '';
  notice.hidden = !message;
}
export function closeDialog() {
  const dialog = document.querySelector('#editor');
  if (dialog.open) dialog.close();
  dialog.replaceChildren();
}
export function showDetails(title, values, extra = null) {
  closeDialog();
  const dialog = document.querySelector('#editor');
  dialog.append(el('h2', { id: 'dialog-title' }, title), details(values),
    ...(extra ? [extra] : []), actions(button('Cerrar', closeDialog)));
  dialog.showModal();
}
export function editor({ title, fields, description, submit = 'Guardar', save, done }) {
  closeDialog();
  const dialog = document.querySelector('#editor');
  const error = el('p', { class: 'error', role: 'alert', hidden: true });
  const send = el('button', { type: 'submit' }, submit);
  const cancel = button('Cancelar', closeDialog);
  const form = el('form', {}, el('h2', { id: 'dialog-title' }, title),
    description ? el('p', { class: 'hint' }, description) : null,
    el('div', { class: 'form-grid' }, fields), error, el('div', { class: 'actions dialog-actions' }, cancel, send));
  let busy = false;
  const preventCancel = (event) => { if (busy) event.preventDefault(); };
  dialog.addEventListener('cancel', preventCancel);
  dialog.addEventListener('close', () => dialog.removeEventListener('cancel', preventCancel), { once: true });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    const buttons = [...form.querySelectorAll('button')];
    const previous = buttons.map((item) => item.disabled);
    for (const item of buttons) item.disabled = true;
    send.textContent = 'Guardando…';
    error.hidden = true;
    try {
      const result = await save(Object.fromEntries(new FormData(form)), form);
      // Logout/vencimiento puede haber retirado este formulario mientras se esperaba.
      if (!form.isConnected) return;
      closeDialog();
      await done?.(result);
    } catch (cause) {
      if (!form.isConnected) return;
      error.textContent = errorText(cause);
      error.hidden = false;
    } finally {
      busy = false;
      buttons.forEach((item, index) => { item.disabled = previous[index]; });
      send.textContent = submit;
    }
  });
  dialog.append(form);
  dialog.showModal();
}

// Paginación en el servidor, cancelación al cambiar de sección y protección frente
// a respuestas antiguas. No cargar catálogos completos en memoria.
export async function listing(ctx, { title, description, path, filters = [], columns, tools = [], caption = title }) {
  let page = 1, revision = 0, values = {}, pending;
  const rows = el('div');
  const filterForm = el('form', { class: 'filters' }, filters, el('button', { type: 'submit' }, 'Buscar'));
  ctx.root.replaceChildren(header(title, description, ...tools), filterForm, rows);
  ctx.signal.addEventListener('abort', () => pending?.abort(), { once: true });
  async function load() {
    pending?.abort();
    pending = new AbortController();
    const version = ++revision;
    rows.setAttribute('aria-busy', 'true');
    rows.replaceChildren(el('p', { class: 'muted' }, 'Cargando registros…'));
    try {
      const result = await ctx.api.request(`${path}?${query({ ...values, pagina: page, limite: 15 })}`, { signal: pending.signal });
      if (ctx.signal.aborted || version !== revision) return;
      const last = Math.max(1, Math.ceil(result.total / result.limite));
      if (page > last) { page = last; return load(); }
      const prev = button('Anterior', () => { page--; load(); });
      const next = button('Siguiente', () => { page++; load(); });
      prev.disabled = page <= 1;
      next.disabled = page >= last;
      rows.replaceChildren(table(caption, columns, result.datos), el('div', { class: 'pager' },
        el('span', { class: 'muted small' }, `${result.total} registros · Página ${page} de ${last}`), prev, next));
    } catch (error) {
      if (ctx.signal.aborted || version !== revision || error.name === 'AbortError') return;
      rows.replaceChildren(el('p', { class: 'error', role: 'alert' }, errorText(error)), button('Reintentar', load));
    } finally { if (version === revision) rows.removeAttribute('aria-busy'); }
  }
  filterForm.addEventListener('submit', (event) => { event.preventDefault(); values = Object.fromEntries(new FormData(filterForm)); page = 1; load(); });
  ctx.reload = load;
  await load();
}
export function perform(ctx, operation) {
  return async () => {
    try { await operation(); }
    catch (error) { if (!ctx.signal.aborted && error.name !== 'AbortError') notify(errorText(error), true); }
  };
}
export function saved(ctx, message) {
  return async () => { if (!ctx.signal.aborted) { notify(message); await ctx.reload?.(); } };
}
