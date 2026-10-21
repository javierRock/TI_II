import { field, listing, button, actions, badge, editor, showDetails, perform, saved, confirmField, el } from '../ui.js';
import { date, label, isoDate, query } from '../format.js';
import { lookup } from '../lookup.js';
import { deliveryEditor } from './loans.js';

export async function reservations(ctx, admin = false) {
  const states = ['solicitada', 'confirmada', 'rechazada', 'cancelada', 'atendida', 'vencida'];
  await listing(ctx, { title: admin ? 'Gestión de reservas' : 'Mis reservas',
    description: 'Solo la confirmación compromete el intervalo. La entrega vuelve a comprobar las condiciones del préstamo.',
    path: admin ? '/reservas' : '/reservas/mias',
    filters: [field('estado', 'Estado', { options: [['', 'Todos'], ...states.map((state) => [state, label(state)])] }),
      field('unidad_id', 'ID de unidad (opcional)', { pattern: '[1-9][0-9]{0,18}' })],
    tools: ['docente', 'estudiante'].includes(ctx.user.rol) ? [button('Solicitar reserva', () => reservationEditor(ctx))] : [],
    columns: [['Bien / unidad', (r) => `${r.bien_nombre} · ${r.codigo_inventario}`],
      ...(admin ? [['ID de titular', (r) => r.solicitante_id]] : []),
      ['Inicio', (r) => date(r.inicio)], ['Fin', (r) => date(r.fin)], ['Estado', (r) => badge(r.estado_actual)],
      ['Acciones', (r) => actions(
        button('Detalle', perform(ctx, async () => {
          const row = await ctx.api.request(`/reservas/${r.id}`, { signal: ctx.signal });
          if (!ctx.signal.aborted) showDetails(`Reserva ${row.id}`, { Unidad: row.codigo_inventario, Estado: label(row.estado_actual),
            Inicio: date(row.inicio), Fin: date(row.fin), Modalidad: label(row.modalidad), Observaciones: row.observaciones,
            Motivo: row.motivo, 'Préstamo asociado': row.prestamo_id });
        }), 'link'),
        admin && r.estado_actual === 'solicitada' ? button('Confirmar', () => decisionEditor(ctx, r, 'confirmar')) : null,
        admin && r.estado_actual === 'solicitada' ? button('Rechazar', () => decisionEditor(ctx, r, 'rechazar')) : null,
        ['solicitada', 'confirmada'].includes(r.estado_actual) ? button('Cancelar', () => decisionEditor(ctx, r, 'cancelar')) : null,
        admin && r.estado_actual === 'confirmada' && new Date(r.inicio) <= new Date() ? button('Registrar entrega', perform(ctx, async () => {
          const unit = await ctx.api.request(`/inventario/unidades/${r.unidad_id}`, { signal: ctx.signal });
          if (!ctx.signal.aborted) deliveryEditor(ctx, unit, r);
        })) : null)]],
  });
}
function reservationEditor(ctx) {
  const unit = lookup(ctx, { name: 'unidad_id', title: 'Unidad a reservar', path: '/catalogo/unidades', key: 'unidad_id',
    describe: (r) => `${r.codigo_inventario} · ${r.nombre} · ${label(r.estado)}` });
  const start = field('inicio', 'Inicio (hora local)', { type: 'datetime-local', step: 1, required: true });
  const end = field('fin', 'Fin (hora local)', { type: 'datetime-local', step: 1, required: true });
  const status = el('p', { role: 'status', class: 'full hint' });
  const check = button('Consultar disponibilidad', perform(ctx, async () => {
    const unidad_id = unit.querySelector('select').value;
    if (!unidad_id) throw new Error('Selecciona una unidad.');
    const result = await ctx.api.request(`/reservas/disponibilidad?${query({ unidad_id,
      inicio: isoDate(start.querySelector('input').value), fin: isoDate(end.querySelector('input').value) })}`, { signal: ctx.signal });
    if (status.isConnected && !ctx.signal.aborted) status.textContent = result.disponible
      ? 'Intervalo disponible ahora. La confirmación verifica también tu perfil, política y cupo.'
      : 'Intervalo ocupado o unidad aún no devuelta. Puedes solicitarlo; solo se confirma si vuelve a estar disponible.';
  }));
  editor({ title: 'Solicitar reserva',
    description: 'El inicio debe ser futuro. Una solicitud pendiente todavía no asegura la unidad.',
    fields: [unit, start, end, field('modalidad', 'Modalidad', { required: true,
      options: [['', 'Selecciona'], ['retiro', 'Retiro'], ['en_sitio', 'En sitio']] }), check, status,
    field('observaciones', 'Observaciones (opcional)', { type: 'textarea', maxlength: 2000, full: true }),
    confirmField('Confirmo la unidad, modalidad y el intervalo solicitado.')], submit: 'Enviar solicitud',
    save: (v) => ctx.api.request('/reservas', { method: 'POST', body: { unidad_id: v.unidad_id,
      inicio: isoDate(v.inicio), fin: isoDate(v.fin), modalidad: v.modalidad, observaciones: v.observaciones.trim() || null, confirmar: true } }),
    done: saved(ctx, 'Solicitud registrada. Requiere confirmación administrativa.'),
  });
}
function decisionEditor(ctx, row, action) {
  const reason = action !== 'confirmar';
  editor({ title: `${label(action)} reserva ${row.id}`,
    description: `${row.codigo_inventario} · ${date(row.inicio)} a ${date(row.fin)}.`,
    fields: [...(reason ? [field('motivo', 'Motivo', { required: true, type: 'textarea', maxlength: 2000, full: true })] : []),
      confirmField(`Confirmo que deseo ${action} esta reserva.`)],
    submit: label(action), save: (v) => ctx.api.request(`/reservas/${row.id}/${action}`, { method: 'POST',
      body: { confirmar: true, ...(reason ? { motivo: v.motivo.trim() } : {}) } }),
    done: saved(ctx, 'Decisión registrada.'),
  });
}
