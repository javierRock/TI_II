import { el, button, field } from './ui.js';
import { query, errorText } from './format.js';

// Buscador paginado embebido: nunca convertir un identificador bigint a número.
export function lookup(ctx, { name, title, path, key = 'id', describe, filters = {}, onSelect }) {
  let page = 1, search = '', revision = 0;
  const input = el('input', { type: 'search', maxlength: 100, 'aria-label': `Buscar ${title.toLowerCase()}` });
  const select = field(name, title, { required: true, options: [['', 'Busca y selecciona un registro']], full: true });
  const control = select.querySelector('select');
  const status = el('p', { class: 'small muted', role: 'status' }, 'Busca por nombre o código.');
  const prev = button('Anterior', () => { page--; load(); });
  const next = button('Siguiente', () => { page++; load(); });
  prev.disabled = next.disabled = true;
  const box = el('div', { class: 'full panel' }, el('div', { class: 'actions' }, input,
    button('Buscar registros', () => { page = 1; search = input.value.trim(); load(); })), select, status, actions());
  function actions() { return el('div', { class: 'actions' }, prev, next); }
  async function load() {
    const version = ++revision;
    control.replaceChildren(el('option', { value: '' }, 'Cargando…'));
    prev.disabled = next.disabled = true;
    try {
      const result = await ctx.api.request(`${path}?${query({ ...filters, q: search, pagina: page, limite: 10 })}`, { signal: ctx.signal });
      if (ctx.signal.aborted || version !== revision || !box.isConnected) return;
      control.replaceChildren(el('option', { value: '' }, 'Selecciona un registro'),
        ...result.datos.map((row) => el('option', { value: row[key] }, describe(row))));
      prev.disabled = page <= 1;
      next.disabled = page * result.limite >= result.total;
      status.textContent = `${result.total} registros · Página ${page}. La selección se valida de nuevo al guardar.`;
    } catch (error) { if (version === revision && !ctx.signal.aborted) { status.textContent = errorText(error); control.replaceChildren(el('option', { value: '' }, 'Busca de nuevo para seleccionar')); } }
  }
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); page = 1; search = input.value.trim(); load(); } });
  if (onSelect) control.addEventListener('change', () => onSelect(control.value));
  return box;
}
