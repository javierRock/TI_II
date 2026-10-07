import { field, listing, button, actions, badge, showDetails, perform, editor, saved, confirmField, accessoriesField } from '../ui.js';
import { label, lines } from '../format.js';
import { lookup } from '../lookup.js';
import { deliveryEditor } from './loans.js';

export async function catalog(ctx, inventory = false) {
  const { datos: types } = await ctx.api.request('/catalogo/tipos', { signal: ctx.signal });
  if (ctx.signal.aborted) return;
  await listing(ctx, {
    title: inventory ? 'Inventario' : 'Catálogo', path: '/catalogo/unidades',
    description: 'Disponibilidad física actual. No incluye reservas ni disponibilidad futura.',
    filters: [field('q', 'Nombre o código', { type: 'search', maxlength: 100 }),
      field('tipo', 'Categoría', { options: [['', 'Todas'], ...types.map((t) => [t.codigo, t.nombre])] }),
      field('disponible', 'Disponibilidad', { options: [['', 'Todas'], ['true', 'Disponible'], ['false', 'No disponible']] })],
    tools: inventory ? [button('Registrar unidad', () => unitEditor(ctx))] : [],
    columns: [['Bien', (r) => r.nombre], ['Código', (r) => r.codigo_inventario], ['Categoría', (r) => r.tipo_nombre],
      ['Ubicación', (r) => r.ubicacion], ['Estado', (r) => actions(badge(r.estado), !r.disponible && r.estado === 'disponible' ? 'No prestable' : null)],
      ['Acciones', (r) => actions(button('Ficha', perform(ctx, async () => {
        const good = await ctx.api.request(`/catalogo/bienes/${r.bien_id}`, { signal: ctx.signal });
        if (!ctx.signal.aborted) showDetails(good.nombre, { Categoría: r.tipo_nombre, Descripción: good.descripcion,
          Autor: good.autor, Edición: good.edicion, ISBN: good.isbn, Marca: good.marca, Modelo: good.modelo });
      }), 'link'), ...(inventory ? [button('Gestionar', perform(ctx, async () => {
        const unit = await ctx.api.request(`/inventario/unidades/${r.unidad_id}`, { signal: ctx.signal });
        if (!ctx.signal.aborted) unitEditor(ctx, unit);
      }), 'link'), ...(r.disponible ? [button('Entregar', perform(ctx, async () => {
        const unit = await ctx.api.request(`/inventario/unidades/${r.unidad_id}`, { signal: ctx.signal });
        if (!ctx.signal.aborted) deliveryEditor(ctx, unit);
      }))] : [])] : []))],
    ],
  });
}

function unitEditor(ctx, unit = null) {
  if (unit && ['prestada', 'baja'].includes(unit.estado)) {
    showDetails(`Unidad ${unit.codigo_inventario}`, { Estado: label(unit.estado), Ubicación: unit.ubicacion,
      Condición: unit.condicion_fisica, Accesorios: unit.accesorios.join('\n'), Observaciones: unit.observaciones,
      'Motivo de baja': unit.motivo_baja });
    return;
  }
  editor({ title: unit ? `Gestionar ${unit.codigo_inventario}` : 'Registrar unidad',
    description: 'Solo bienes bajo custodia de la Escuela, no adscritos a laboratorios. El cambio de estado se registra por separado.',
    fields: [
      ...(!unit ? [lookup(ctx, { name: 'bien_id', title: 'Ficha del bien', path: '/catalogo/bienes', describe: (r) => `${r.nombre} · ${r.tipo_nombre}` }),
        field('codigo_inventario', 'Código de inventario', { required: true, maxlength: 64 }),
        field('estado', 'Estado inicial inspeccionado', { required: true, options: [['', 'Selecciona'], ['disponible', 'Disponible'], ['mantenimiento', 'Mantenimiento']] }),
        field('marca', 'Marca física (opcional)', { maxlength: 100, help: 'Si se omite, se utiliza la marca de la ficha.' }),
        field('modelo', 'Modelo físico (opcional)', { maxlength: 100 }),
        field('serie', 'Serie (opcional)', { maxlength: 100, help: 'Requiere marca y modelo en la ficha.' })] : []),
      field('ubicacion', 'Ubicación', { required: true, maxlength: 200, value: unit?.ubicacion }),
      field('condicion_fisica', 'Condición física inspeccionada', { type: 'textarea', required: true, maxlength: 2000, full: true, value: unit?.condicion_fisica }),
      accessoriesField('accesorios', 'Accesorios registrados', unit?.accesorios),
      field('adquirido_en', 'Fecha de adquisición (opcional)', { type: 'date', value: unit?.adquirido_en?.slice(0, 10) }),
      field('observaciones', 'Observaciones internas (opcional)', { type: 'textarea', maxlength: 5000, full: true, value: unit?.observaciones }),
      confirmField(),
    ],
    save: (v) => ctx.api.request(unit ? `/inventario/unidades/${unit.id}` : '/inventario/unidades', {
      method: unit ? 'PATCH' : 'POST', body: { ...(!unit ? { bien_id: v.bien_id, codigo_inventario: v.codigo_inventario,
        estado: v.estado, ...Object.fromEntries(['marca', 'modelo', 'serie'].filter((key) => v[key].trim()).map((key) => [key, v[key].trim()])) } : {}), ubicacion: v.ubicacion, condicion_fisica: v.condicion_fisica,
        accesorios: lines(v.accesorios), adquirido_en: v.adquirido_en || null, observaciones: v.observaciones.trim() || null },
    }),
    done: saved(ctx, 'Unidad guardada.'),
  });
  if (unit) {
    const form = document.querySelector('#editor form');
    form.append(button('Cambiar estado', () => stateEditor(ctx, unit)));
  }
}
function stateEditor(ctx, unit) {
  const state = field('estado', 'Nuevo estado', { options: [['', 'Selecciona'], ['disponible', 'Disponible'], ['mantenimiento', 'Mantenimiento'], ['baja', 'Baja definitiva']], required: true });
  const reason = field('motivo', 'Motivo autorizado de baja', { type: 'textarea', maxlength: 2000, full: true });
  const change = () => {
    const retired = state.querySelector('select').value === 'baja';
    reason.hidden = !retired;
    reason.querySelector('textarea').required = retired;
  };
  state.querySelector('select').addEventListener('change', change);
  change();
  editor({ title: `Estado de ${unit.codigo_inventario}`,
    description: 'La baja es definitiva. Una unidad prestada debe recibirse mediante devolución.',
    fields: [state, reason, confirmField('Confirmo la inspección y autorización del cambio; entiendo que la baja no se puede revertir.')],
    save: (v) => ctx.api.request(`/inventario/unidades/${unit.id}/estado`, { method: 'PATCH',
      body: { estado: v.estado, confirmar: true, ...(v.estado === 'baja' ? { motivo: v.motivo.trim() } : {}) } }),
    done: saved(ctx, 'Estado actualizado.'),
  });
}

export async function goods(ctx) {
  const { datos: types } = await ctx.api.request('/catalogo/tipos', { signal: ctx.signal });
  if (ctx.signal.aborted) return;
  await listing(ctx, { title: 'Fichas de bienes', description: 'Características compartidas por las unidades físicas.', path: '/catalogo/bienes',
    filters: [field('q', 'Nombre', { type: 'search', maxlength: 100 }), field('tipo', 'Categoría', { options: [['', 'Todas'], ...types.map((t) => [t.codigo, t.nombre])] })],
    tools: [button('Crear ficha', () => goodEditor(ctx, types))],
    columns: [['Nombre', (r) => r.nombre], ['Categoría', (r) => r.tipo_nombre], ['Marca / autor', (r) => r.marca ?? r.autor ?? '—'],
      ['Acciones', (r) => button('Editar ficha', () => goodEditor(ctx, types, r), 'link')]],
  });
}
function goodEditor(ctx, types, good = null) {
  const type = field('tipo_id', 'Categoría', { required: true, options: [['', 'Selecciona'], ...types.map((t) => [t.id, t.nombre])], value: good?.tipo_id });
  const publishing = ['autor', 'edicion', 'isbn'].map((name, i) => field(name, ['Autor', 'Edición', 'ISBN'][i], { maxlength: [200, 100, 32][i], value: good?.[name] }));
  const equipment = ['marca', 'modelo'].map((name) => field(name, name === 'marca' ? 'Marca' : 'Modelo', { maxlength: 100, value: good?.[name] }));
  function update() {
    const book = types.find((t) => t.id === type.querySelector('select').value)?.codigo === 'libro';
    for (const item of publishing) { item.hidden = !book; item.querySelector('input').disabled = !book; }
    for (const item of equipment) { item.hidden = book; item.querySelector('input').disabled = book; }
  }
  type.querySelector('select').disabled = Boolean(good);
  type.querySelector('select').addEventListener('change', update);
  update();
  editor({ title: good ? 'Editar ficha' : 'Crear ficha', fields: [type,
    field('nombre', 'Nombre', { required: true, maxlength: 200, value: good?.nombre }),
    field('descripcion', 'Descripción', { type: 'textarea', full: true, maxlength: 5000, value: good?.descripcion }), ...publishing, ...equipment, confirmField()],
    save: (v) => ctx.api.request(good ? `/inventario/bienes/${good.id}` : '/inventario/bienes', { method: good ? 'PATCH' : 'POST',
      body: { ...(!good ? { tipo_id: v.tipo_id } : {}), nombre: v.nombre, descripcion: v.descripcion.trim() || null,
        ...Object.fromEntries(['autor', 'edicion', 'isbn', 'marca', 'modelo'].filter((key) => key in v).map((key) => [key, v[key].trim() || null])) } }),
    done: saved(ctx, 'Ficha guardada.'),
  });
}
