import {
  field,
  listing,
  button,
  actions,
  badge,
  editor,
  saved,
  confirmField,
  accessoriesField,
} from '../ui.js';
import { date, isoDate, localDate, lines } from '../format.js';
import { lookup } from '../lookup.js';
export async function reservations(ctx, admin = false) {
  await listing(ctx, {
    title: admin ? 'Gestión de reservas' : 'Mis reservas',
    description: 'Intervalos [inicio, fin): solo las confirmadas comprometen disponibilidad.',
    path: admin ? '/reservas' : '/reservas/mias',
    filters: [
      field('estado', 'Estado', {
        options: [
          ['', 'Todos'],
          ...['pendiente', 'confirmada', 'rechazada', 'cancelada', 'atendida', 'vencida'].map(
            (s) => [s, s],
          ),
        ],
      }),
    ],
    tools:
      admin || !['estudiante', 'docente'].includes(ctx.user.rol)
        ? []
        : [button('Solicitar reserva', () => requestEditor(ctx))],
    columns: [
      ['Bien', (r) => `${r.bien_nombre} · ${r.codigo_inventario}`],
      ...(admin ? [['Solicitante', (r) => r.solicitante_nombre]] : []),
      ['Inicio', (r) => date(r.inicio)],
      ['Fin', (r) => date(r.fin)],
      ['Estado', (r) => badge(r.estado)],
      [
        'Acciones',
        (r) =>
          actions(
            ...(r.estado === 'pendiente' && admin
              ? [
                  button('Confirmar', () => decisionEditor(ctx, r, 'confirmar')),
                  button('Rechazar', () => decisionEditor(ctx, r, 'rechazar')),
                ]
              : []),
            ...(['pendiente', 'confirmada'].includes(r.estado)
              ? [button('Cancelar', () => decisionEditor(ctx, r, 'cancelar'))]
              : []),
            ...(r.estado === 'confirmada' && admin
              ? [button('Entregar', () => conversionEditor(ctx, r))]
              : []),
          ),
      ],
    ],
  });
}
function requestEditor(ctx) {
  editor({
    title: 'Solicitar reserva',
    description:
      'El intervalo debe ser futuro y cumplir la política vigente. La solicitud queda pendiente.',
    fields: [
      lookup(ctx, {
        name: 'unidad_id',
        title: 'Unidad',
        path: '/catalogo/unidades',
        key: 'unidad_id',
        describe: (r) => `${r.codigo_inventario} · ${r.nombre}`,
      }),
      field('inicio', 'Inicio (hora local)', { type: 'datetime-local', required: true, step: 1 }),
      field('fin', 'Fin (hora local)', { type: 'datetime-local', required: true, step: 1 }),
      field('uso_previsto', 'Uso previsto', { type: 'textarea', required: true, maxlength: 2000 }),
      confirmField(),
    ],
    save: (v) =>
      ctx.api.request('/reservas', {
        method: 'POST',
        body: {
          unidad_id: v.unidad_id,
          inicio: isoDate(v.inicio),
          fin: isoDate(v.fin),
          uso_previsto: v.uso_previsto,
        },
      }),
    done: saved(ctx, 'Reserva solicitada.'),
  });
}
function decisionEditor(ctx, r, action) {
  editor({
    title: `${action} reserva ${r.id}`,
    description: `${r.codigo_inventario}: ${date(r.inicio)} — ${date(r.fin)}`,
    fields: [
      ...(action !== 'confirmar'
        ? [field('motivo', 'Motivo', { type: 'textarea', required: true, maxlength: 2000 })]
        : []),
      confirmField(),
    ],
    save: (v) =>
      ctx.api.request(`/reservas/${r.id}/${action}`, {
        method: 'POST',
        body: action === 'confirmar' ? {} : { motivo: v.motivo },
      }),
    done: saved(ctx, 'Reserva actualizada.'),
  });
}
function conversionEditor(ctx, r) {
  editor({
    title: `Entregar reserva ${r.id}`,
    description:
      'Solo durante el intervalo confirmado. Verifica físicamente el bien y cada accesorio; el fin no puede superar la reserva.',
    fields: [
      field('vencimiento', 'Vencimiento (hora local)', {
        type: 'datetime-local',
        step: 1,
        value: localDate(r.fin),
        required: true,
      }),
      field('modalidad', 'Modalidad', {
        options: [
          ['retiro', 'Retiro'],
          ['en_sitio', 'En sitio'],
        ],
        required: true,
      }),
      field('condicion_entrega', 'Condición inspeccionada', { required: true, maxlength: 2000 }),
      accessoriesField('accesorios_entrega', 'Accesorios verificados'),
      confirmField(),
    ],
    save: (v) =>
      ctx.api.request(`/reservas/${r.id}/prestamo`, {
        method: 'POST',
        body: {
          vencimiento: isoDate(v.vencimiento),
          modalidad: v.modalidad,
          condicion_entrega: v.condicion_entrega,
          accesorios_entrega: lines(v.accesorios_entrega),
          confirmar: true,
        },
      }),
    done: saved(ctx, 'Reserva atendida y préstamo registrado.'),
  });
}
