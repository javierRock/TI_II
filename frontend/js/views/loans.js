import { field, listing, button, actions, badge, editor, showDetails, perform, saved, confirmField, accessoriesField, notify } from '../ui.js';
import { date, label, lines, isoDate } from '../format.js';
import { lookup } from '../lookup.js';

export async function loans(ctx, admin = false) {
  await listing(ctx, { title: admin ? 'Entregas y devoluciones' : 'Mis préstamos',
    description: 'Cada unidad entregada permanece bajo responsabilidad del titular hasta registrar su recepción.',
    path: admin ? '/prestamos' : '/prestamos/mios',
    filters: [field('estado', 'Estado', { options: [['', 'Todos'], ['activo', 'Activo'], ['vencido', 'Vencido'], ['devuelto', 'Devuelto']] }),
      ...(admin ? [field('solicitante_id', 'ID de cuenta (opcional)', { pattern: '[1-9][0-9]{0,18}', help: 'No es el ID de persona.' })] : [])],
    tools: admin ? [button('Registrar entrega', () => deliveryEditor(ctx))] : [],
    columns: [['Bien / unidad', (r) => `${r.bien_nombre} · ${r.codigo_inventario}`],
      ...(admin ? [['Titular', (r) => r.solicitante_nombre]] : []),
      ['Entrega', (r) => date(r.inicio)], ['Vencimiento', (r) => date(r.vencimiento)], ['Estado', (r) => badge(r.estado)],
      ['Acciones', (r) => actions(button('Detalle', perform(ctx, () => loanDetail(ctx, r.id)), 'link'),
        admin && r.estado_cierre === 'abierto' ? button('Recibir', perform(ctx, async () => {
          const loan = await ctx.api.request(`/prestamos/${r.id}`, { signal: ctx.signal });
          if (!ctx.signal.aborted) returnEditor(ctx, loan);
        })) : null)]],
  });
}
async function loanDetail(ctx, id) {
  const r = await ctx.api.request(`/prestamos/${id}`, { signal: ctx.signal });
  if (ctx.signal.aborted) return;
  showDetails(`Préstamo ${r.id}`, { Bien: r.bien_nombre, Unidad: r.codigo_inventario, Estado: label(r.estado), Modalidad: label(r.modalidad),
    Entrega: date(r.inicio), Vencimiento: date(r.vencimiento), Devolución: date(r.devolucion_en),
    'Condición de entrega': r.condicion_entrega, 'Accesorios entregados': r.accesorios_entrega.join('\n'),
    'Condición al recibir': r.condicion_devolucion, 'Accesorios recibidos': r.accesorios_devolucion?.join('\n'),
    'Inspección de aptitud': r.devolucion_apta === null ? 'Sin dato histórico' : r.devolucion_apta ? 'Apta' : 'No apta',
    'Destino al recibir': label(r.destino_devolucion), 'Política aplicada (ID)': r.politica_condiciones_id,
    'Cupo aplicado': r.cupo_aplicado, 'Duración máxima (horas)': r.duracion_max_horas,
    'Tolerancia (horas)': r.tolerancia_horas, 'Retraso (segundos)': r.retraso_segundos,
    'Observaciones de entrega': r.observaciones_entrega, 'Observaciones al recibir': r.observaciones_devolucion });
}
export function deliveryEditor(ctx, unit = null) {
  const condition = field('condicion_entrega', 'Condición física inspeccionada', { type: 'textarea', required: true, maxlength: 2000, full: true, value: unit?.condicion_fisica });
  const accessories = accessoriesField('accesorios_entrega', 'Accesorios que se entregan', unit?.accesorios);
  let selection = 0;
  const unitLookup = !unit ? lookup(ctx, { name: 'unidad_id', title: 'Unidad disponible', path: '/catalogo/unidades', key: 'unidad_id',
    filters: { disponible: 'true' }, describe: (r) => `${r.codigo_inventario} · ${r.nombre} · ${r.ubicacion}`,
    onSelect: async (id) => {
      const revision = ++selection;
      condition.querySelector('textarea').value = '';
      accessories.querySelector('textarea').value = '';
      if (!id) return;
      try {
        const current = await ctx.api.request(`/inventario/unidades/${id}`, { signal: ctx.signal });
        if (revision !== selection || ctx.signal.aborted || !condition.isConnected) return;
        condition.querySelector('textarea').value = current.condicion_fisica;
        accessories.querySelector('textarea').value = current.accesorios.join('\n');
      } catch (error) { if (!ctx.signal.aborted) notify(error.message, true); }
    } }) : null;
  editor({ title: 'Registrar entrega', description: unit ? `Unidad ${unit.codigo_inventario}. Verifica su condición y cada accesorio. El plazo y el cupo dependen de la política aprobada.`
    : 'Selecciona titular y unidad; verifica condición y accesorios. La API valida el plazo y cupo aprobados.',
    fields: [lookup(ctx, { name: 'persona_id', title: 'Persona solicitante', path: '/personas', describe: (r) => `${r.nombre_completo} · ${r.documento}${r.activo ? '' : ' · Inactiva'}` }),
      unitLookup, field('vencimiento', 'Vencimiento (hora local)', { type: 'datetime-local', step: 1, required: true }),
      field('modalidad', 'Modalidad autorizada', { options: [['', 'Selecciona'], ['retiro', 'Retiro'], ['en_sitio', 'En sitio']], required: true }),
      condition, accessories, field('observaciones_entrega', 'Observaciones (opcional)', { type: 'textarea', maxlength: 5000, full: true }),
      confirmField('Confirmo la entrega real, la identidad del titular y la inspección de condición y accesorios.')],
    submit: 'Confirmar entrega',
    save: async (v) => {
      const person = await ctx.api.request(`/personas/${v.persona_id}`);
      ctx.signal.throwIfAborted();
      if (!person.cuenta) throw new Error('La persona seleccionada no tiene una cuenta. Regístrala antes de entregar.');
      return ctx.api.request('/prestamos', { method: 'POST', body: { solicitante_id: person.cuenta.id, unidad_id: unit?.id ?? v.unidad_id,
        vencimiento: isoDate(v.vencimiento), modalidad: v.modalidad, condicion_entrega: v.condicion_entrega,
        accesorios_entrega: lines(v.accesorios_entrega), observaciones_entrega: v.observaciones_entrega.trim() || null, confirmar: true } });
    }, done: saved(ctx, 'Entrega registrada. La unidad está prestada.'),
  });
}
function returnEditor(ctx, loan) {
  const apt = field('apta', 'Resultado de la inspección', { required: true, options: [['', 'Selecciona después de inspeccionar'], ['true', 'Apta: sin daños y accesorios completos'], ['false', 'No apta: daño o accesorios faltantes']] });
  const destination = field('estado_unidad', 'Destino de la unidad', { required: true, options: [['', 'Selecciona'], ['disponible', 'Disponible'], ['mantenimiento', 'Mantenimiento'], ['baja', 'Baja definitiva']] });
  const reason = field('motivo_baja', 'Motivo autorizado de baja', { type: 'textarea', maxlength: 2000, full: true });
  const change = () => {
    const available = destination.querySelector('option[value="disponible"]');
    available.disabled = apt.querySelector('select').value !== 'true';
    if (available.disabled && destination.querySelector('select').value === 'disponible') destination.querySelector('select').value = '';
    const retired = destination.querySelector('select').value === 'baja';
    reason.hidden = !retired;
    reason.querySelector('textarea').required = retired;
  };
  apt.querySelector('select').addEventListener('change', change);
  destination.querySelector('select').addEventListener('change', change);
  change();
  editor({ title: `Recibir ${loan.codigo_inventario}`,
    description: `Entregado: ${loan.accesorios_entrega.join(', ') || 'sin accesorios'}. Anota solo lo recibido. No se declaran automáticamente aptitud ni destino.`,
    fields: [field('condicion_devolucion', 'Condición al recibir', { type: 'textarea', required: true, maxlength: 2000, full: true }),
      accessoriesField('accesorios_devolucion', 'Accesorios realmente recibidos'), apt, destination, reason,
      field('observaciones_devolucion', 'Observaciones (opcional)', { type: 'textarea', maxlength: 5000, full: true }),
      confirmField('Confirmo la recepción real y la inspección. Los daños o faltantes no dejan la unidad disponible.')],
    submit: 'Confirmar devolución',
    save: (v) => ctx.api.request(`/prestamos/${loan.id}/devolucion`, { method: 'POST', body: {
      condicion_devolucion: v.condicion_devolucion, accesorios_devolucion: lines(v.accesorios_devolucion), apta: v.apta === 'true',
      estado_unidad: v.estado_unidad, ...(v.estado_unidad === 'baja' ? { motivo_baja: v.motivo_baja.trim() } : {}),
      observaciones_devolucion: v.observaciones_devolucion.trim() || null, confirmar: true,
    } }), done: saved(ctx, 'Devolución registrada con su inspección y destino.'),
  });
}
