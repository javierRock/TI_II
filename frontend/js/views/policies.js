import { field, listing, button, actions, badge, editor, saved, confirmField, showDetails } from '../ui.js';
import { date, label, localDate, isoDate } from '../format.js';

const scopeOptions = [['general', 'General'], ['docente', 'Docente'], ['estudiante', 'Estudiante']];
export async function policies(ctx) {
  await listing(ctx, { title: 'Políticas de préstamo', description: 'Versiones aprobadas con condiciones históricas. Crear un borrador no autoriza entregas.', path: '/politicas',
    filters: [field('rol', 'Alcance', { options: [['', 'Todos'], ...scopeOptions] }),
      field('estado', 'Estado', { options: [['', 'Todos'], ...['borrador', 'programada', 'vigente', 'expirada'].map((s) => [s, label(s)])] })],
    tools: [button('Crear borrador', () => policyEditor(ctx))],
    columns: [['Versión / nombre', (r) => `v${r.version} · ${r.nombre}`], ['Alcance', (r) => r.rol ? label(r.rol) : 'General'],
      ['Vigencia', (r) => `${date(r.vigencia_inicio)} → ${r.vigencia_fin ? date(r.vigencia_fin) : 'Sin fin'}`], ['Estado', (r) => badge(r.estado)],
      ['Acciones', (r) => actions(button('Detalle', () => showDetails(r.nombre, { ID: r.id, Versión: r.version, Alcance: r.rol ? label(r.rol) : 'General',
        Cupo: r.cupo_total, Duración: `${r.duracion_cantidad} ${r.duracion_unidad}`, Modalidades: r.modalidades.map(label).join(', '),
        Tolerancia: `${r.tolerancia_horas} horas`, Inicio: date(r.vigencia_inicio), Fin: date(r.vigencia_fin), Aprobación: date(r.aprobada_en), 'Aprobador (ID)': r.aprobada_por }), 'link'),
        ...(!r.aprobada_en ? [button('Editar', () => policyEditor(ctx, r), 'link'), button('Aprobar', () => approveEditor(ctx, r))]
          : r.estado !== 'expirada' ? [button('Acortar vigencia', () => endEditor(ctx, r), 'link')] : []))]],
  });
}
function policyEditor(ctx, policy = null) {
  editor({ title: policy ? 'Editar borrador' : 'Crear borrador de política',
    description: 'Introduce los valores autorizados; no hay cupos ni plazos institucionales por defecto. Garantías, renovaciones y cobros no están soportados.',
    fields: [...(!policy ? [field('rol', 'Alcance', { options: [['', 'Selecciona'], ...scopeOptions], required: true })] : []),
      field('nombre', 'Nombre', { required: true, maxlength: 150, value: policy?.nombre }),
      field('vigencia_inicio', 'Inicio (hora local)', { type: 'datetime-local', step: 1, required: true, value: localDate(policy?.vigencia_inicio) }),
      field('vigencia_fin', 'Fin (opcional, hora local)', { type: 'datetime-local', step: 1, value: localDate(policy?.vigencia_fin) }),
      field('cupo_total', 'Cupo total de préstamos abiertos', { type: 'number', min: 1, max: 32767, step: 1, required: true, value: policy?.cupo_total }),
      field('duracion_cantidad', 'Duración máxima', { type: 'number', min: 1, max: 36500, step: 1, required: true, value: policy?.duracion_cantidad }),
      field('duracion_unidad', 'Unidad de duración', { required: true, options: [['', 'Selecciona'], ['horas', 'Horas'], ['dias', 'Días de 24 horas']], value: policy?.duracion_unidad }),
      field('tolerancia_horas', 'Tolerancia (horas)', { type: 'number', min: 0, max: 2147483647, step: 1, required: true, value: policy?.tolerancia_horas, help: 'Escribe 0 si no hay tolerancia aprobada.' }),
      field('retiro', 'Permitir retiro', { type: 'checkbox', value: policy?.modalidades.includes('retiro') }),
      field('en_sitio', 'Permitir uso en sitio', { type: 'checkbox', value: policy?.modalidades.includes('en_sitio') }), confirmField()],
    save: (v) => {
      const modalidades = ['retiro', 'en_sitio'].filter((name) => v[name] === 'on');
      if (!modalidades.length) throw new Error('Selecciona al menos una modalidad autorizada.');
      return ctx.api.request(policy ? `/politicas/${policy.id}` : '/politicas', { method: policy ? 'PATCH' : 'POST', body: {
        ...(!policy ? { rol: v.rol === 'general' ? null : v.rol } : {}), nombre: v.nombre,
        vigencia_inicio: isoDate(v.vigencia_inicio), vigencia_fin: v.vigencia_fin ? isoDate(v.vigencia_fin) : null,
        cupo_total: Number(v.cupo_total), duracion_cantidad: Number(v.duracion_cantidad), duracion_unidad: v.duracion_unidad,
        tolerancia_horas: Number(v.tolerancia_horas), modalidades,
      } });
    }, done: saved(ctx, 'Borrador guardado. Falta su aprobación explícita.'),
  });
}
function approveEditor(ctx, policy) {
  editor({ title: `Aprobar v${policy.version}: ${policy.nombre}`,
    description: `Cupo ${policy.cupo_total}; duración ${policy.duracion_cantidad} ${policy.duracion_unidad}; modalidades ${policy.modalidades.map(label).join(', ')}. Una vez aprobadas, las condiciones no se pueden editar.`,
    fields: [field('referencia_aprobacion', 'Documento o acuerdo institucional', { type: 'textarea', maxlength: 2000, required: true, full: true }),
      field('sustituye_id', 'ID de versión sustituida (opcional)', { pattern: '[1-9][0-9]{0,18}', help: 'Mismo alcance e inicio futuro. La API valida y sustituye ambas vigencias atómicamente.' }),
      confirmField('Confirmo que existe autorización institucional para aprobar estas condiciones.')],
    submit: 'Aprobar versión', save: (v) => ctx.api.request(`/politicas/${policy.id}/aprobar`, { method: 'POST', body: {
      confirmar: true, referencia_aprobacion: v.referencia_aprobacion, ...(v.sustituye_id ? { sustituye_id: v.sustituye_id } : {}),
    } }), done: saved(ctx, 'Versión aprobada.'),
  });
}
function endEditor(ctx, policy) {
  editor({ title: 'Acortar vigencia', description: 'Solo se permite un fin futuro. No cambia las condiciones de préstamos ya entregados.', fields: [
    field('vigencia_fin', 'Nuevo fin (hora local)', { type: 'datetime-local', step: 1, required: true }),
    field('motivo', 'Motivo autorizado', { type: 'textarea', maxlength: 2000, required: true, full: true }), confirmField()],
    save: (v) => ctx.api.request(`/politicas/${policy.id}/vigencia`, { method: 'PATCH', body: { vigencia_fin: isoDate(v.vigencia_fin), motivo: v.motivo, confirmar: true } }),
    done: saved(ctx, 'Vigencia acortada.'),
  });
}
