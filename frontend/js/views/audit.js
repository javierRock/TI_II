import { field, listing, button, showDetails, el, perform } from '../ui.js';
import { date } from '../format.js';

export async function audit(ctx) {
  await listing(ctx, { title: 'Auditoría', description: 'Historial de solo lectura. Las correcciones generan nuevos eventos y no reescriben el pasado.', path: '/auditoria',
    filters: [field('entidad', 'Entidad (opcional)', { maxlength: 80 }), field('entidad_id', 'ID de registro (opcional)', { maxlength: 100 }),
      field('accion', 'Acción (opcional)', { maxlength: 100 })],
    columns: [['Fecha', (r) => date(r.creado_en)], ['Acción', (r) => r.accion], ['Entidad / ID', (r) => `${r.entidad} · ${r.entidad_id}`],
      ['Actor', (r) => r.actor_usuario_id ?? r.proceso ?? '—'], ['Resultado', (r) => r.resultado],
      ['Detalle', (r) => button('Ver evento', perform(ctx, async () => {
        const event = await ctx.api.request(`/auditoria/${r.id}`, { signal: ctx.signal });
        if (!ctx.signal.aborted) showDetails(`Evento ${event.id}`, { Fecha: date(event.creado_en), Acción: event.accion, Entidad: event.entidad,
          'ID de entidad': event.entidad_id, Actor: event.actor_usuario_id, Proceso: event.proceso, Resultado: event.resultado },
        el('pre', {}, JSON.stringify(event.detalle, null, 2)));
      }), 'link')]],
  });
}
