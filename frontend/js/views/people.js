import { field, listing, button, actions, editor, saved, showDetails, perform, confirmField, el } from '../ui.js';
import { label, lines } from '../format.js';
import { lookup } from '../lookup.js';

const roles = [['personal_administrativo', 'Personal administrativo'], ['docente', 'Docente'], ['estudiante', 'Estudiante']];
export async function people(ctx) {
  await listing(ctx, { title: 'Personas y cuentas', description: 'Registro autorizado. El rol administrativo no concede por sí solo atribuciones administrativas.', path: '/personas',
    filters: [field('q', 'Nombre o documento', { type: 'search', maxlength: 100 })], tools: [button('Registrar persona', () => personEditor(ctx))],
    columns: [['Nombre', (r) => r.nombre_completo], ['Documento', (r) => r.documento], ['Correo', (r) => r.correo],
      ['Estado', (r) => r.activo ? 'Activa' : 'Inactiva'], ['Acciones', (r) => actions(button('Gestionar', perform(ctx, () => managePerson(ctx, r.id)), 'link'), button('Editar', () => personEditor(ctx, r), 'link'))]],
  });
}
function personEditor(ctx, person = null) {
  editor({ title: person ? 'Editar persona' : 'Registrar persona', fields: [
    ...(!person ? [field('documento', 'Documento', { required: true, maxlength: 32 })] : []),
    field('nombre_completo', 'Nombre completo', { required: true, maxlength: 200, value: person?.nombre_completo }),
    field('correo', 'Correo', { type: 'email', required: true, maxlength: 254, value: person?.correo }),
    field('contacto', 'Contacto (opcional)', { maxlength: 100, value: person?.contacto }), confirmField()],
    save: (v) => ctx.api.request(person ? `/personas/${person.id}` : '/personas', { method: person ? 'PATCH' : 'POST',
      body: { ...(!person ? { documento: v.documento } : {}), nombre_completo: v.nombre_completo, correo: v.correo, contacto: v.contacto.trim() || null } }),
    done: saved(ctx, 'Persona guardada.'),
  });
}
async function managePerson(ctx, id) {
  const person = await ctx.api.request(`/personas/${id}`, { signal: ctx.signal });
  if (ctx.signal.aborted) return;
  const account = person.cuenta;
  showDetails(person.nombre_completo, { 'ID de persona': person.id, Documento: person.documento, Estado: person.activo ? 'Activa' : 'Inactiva',
    'ID de cuenta (solicitante)': account?.id, Usuario: account?.nombre_usuario, Rol: account ? label(account.rol) : 'Sin cuenta',
    'Estado de cuenta': account ? account.activo ? 'Activa' : 'Inactiva' : '—',
    'Atribución administrativa': account?.atribucion_admin ? 'Sí' : 'No',
    'Perfiles registrados': account?.perfiles.map((p) => `${label(p.tipo)} · ${p.codigo} · ${p.habilitado ? 'habilitado' : 'no habilitado'}`).join('\n'),
  }, actions(button(person.activo ? 'Desactivar persona' : 'Activar persona', () => stateEditor(ctx, person)),
    account ? button('Gestionar cuenta', () => accountStateEditor(ctx, person)) : person.activo ? button('Crear cuenta', () => accountEditor(ctx, person)) : null,
    account ? button('Registrar / actualizar perfil', () => profileEditor(ctx, person)) : null));
}
function stateEditor(ctx, person) {
  editor({ title: person.activo ? 'Desactivar persona' : 'Activar persona',
    description: person.activo ? 'Se desactivará su cuenta y se revocarán sus sesiones. Los préstamos permanecen registrados. Si es tu propia cuenta, perderás acceso.'
      : 'La cuenta no se reactiva automáticamente: actívala por separado.',
    fields: [confirmField('Confirmo que tengo autorización para cambiar el estado de esta persona.')],
    save: () => ctx.api.request(`/personas/${person.id}/estado`, { method: 'PATCH', body: { activo: !person.activo } }),
    done: saved(ctx, 'Estado de persona actualizado.'),
  });
}
function profileFields(ctx, type, profile = {}) {
  if (!['docente', 'estudiante'].includes(type)) return [];
  const common = [field('codigo', 'Código institucional', { required: true, maxlength: 50, value: profile.codigo }),
    field('habilitado', 'Confirmo que el perfil ha sido validado institucionalmente y está habilitado.', { type: 'checkbox', full: true, value: profile.habilitado })];
  if (type === 'estudiante') return [...common,
    lookup(ctx, { name: 'plan_id', title: 'Plan de estudios', path: '/planes-estudio', describe: (r) => `${r.codigo} · ${r.nombre} · Semestres: ${r.semestres.join(', ')}` }),
    field('semestre', 'Semestre autorizado', { type: 'number', required: true, min: 1, max: 32767, step: 1, value: profile.semestre })];
  if (type === 'docente') return [...common,
    field('especialidad', 'Especialidad', { required: true, maxlength: 150, value: profile.especialidad }),
    field('vinculacion', 'Vinculación', { required: true, maxlength: 150, value: profile.vinculacion })];
  return [];
}
function profileBody(type, v) {
  return { tipo: type, codigo: v.codigo, habilitado: v.habilitado === 'on',
    ...(type === 'estudiante' ? { plan_id: v.plan_id, semestre: Number(v.semestre) } : { especialidad: v.especialidad, vinculacion: v.vinculacion }) };
}
function accountEditor(ctx, person) {
  const role = field('rol', 'Rol de la cuenta', { required: true, options: [['', 'Selecciona'], ...roles] });
  const profile = el('div', { class: 'form-grid full' });
  role.querySelector('select').addEventListener('change', () => profile.replaceChildren(...profileFields(ctx, role.querySelector('select').value)));
  editor({ title: `Cuenta de ${person.nombre_completo}`, description: 'La habilitación del perfil requiere validación institucional. No se conceden privilegios administrativos desde este formulario.',
    fields: [field('nombre_usuario', 'Nombre de usuario', { required: true, maxlength: 64, autocomplete: 'off' }),
      field('password', 'Contraseña inicial', { type: 'password', required: true, minlength: 12, maxlength: 128, autocomplete: 'new-password', help: '12 a 128 caracteres. Comunícala por un canal seguro.' }), role, profile, confirmField()],
    save: async (v, form) => {
      try { return await ctx.api.request(`/personas/${person.id}/cuenta`, { method: 'POST', body: {
        nombre_usuario: v.nombre_usuario, password: v.password, rol: v.rol,
        ...(v.rol !== 'personal_administrativo' ? { perfil: profileBody(v.rol, v) } : {}),
      } }); } finally { form.elements.password.value = ''; }
    }, done: saved(ctx, 'Cuenta registrada.'),
  });
}
function accountStateEditor(ctx, person) {
  const account = person.cuenta;
  editor({ title: `Cuenta ${account.nombre_usuario}`, description: 'Cambiar el rol revoca sesiones. Registra primero el perfil correspondiente. Cambiar el rol no concede atribución administrativa.',
    fields: [field('rol', 'Rol', { options: roles, value: account.rol, required: true }),
      field('activo', 'Cuenta activa', { type: 'checkbox', value: account.activo }),
      confirmField('Confirmo el cambio; si modifico o desactivo mi propia cuenta puedo perder acceso.')],
    save: (v) => ctx.api.request(`/personas/${person.id}/cuenta`, { method: 'PATCH', body: { rol: v.rol, activo: v.activo === 'on' } }),
    done: saved(ctx, 'Cuenta actualizada. Los cambios de rol requieren iniciar sesión de nuevo.'),
  });
}
function profileEditor(ctx, person) {
  const type = field('tipo', 'Tipo de perfil', { required: true, options: [['', 'Selecciona'], ['docente', 'Docente'], ['estudiante', 'Estudiante']] });
  const profile = el('div', { class: 'form-grid full' });
  type.querySelector('select').addEventListener('change', () => {
    const value = type.querySelector('select').value;
    profile.replaceChildren(...profileFields(ctx, value, person.cuenta.perfiles.find((p) => p.tipo === value)));
  });
  editor({ title: 'Perfil académico', description: 'En estudiantes, selecciona de nuevo el plan autorizado y verifica el semestre. Habilitar exige validación institucional.',
    fields: [type, profile, confirmField()], save: (v) => ctx.api.request(`/personas/${person.id}/perfil`, { method: 'PUT', body: profileBody(v.tipo, v) }),
    done: saved(ctx, 'Perfil registrado.'),
  });
}
export async function plans(ctx) {
  await listing(ctx, { title: 'Planes académicos', description: 'Registra únicamente planes y semestres autorizados por la institución.', path: '/planes-estudio',
    filters: [field('q', 'Código, programa o nombre', { type: 'search', maxlength: 100 })],
    tools: [button('Registrar plan', () => editor({ title: 'Registrar plan', fields: [
      field('codigo', 'Código', { required: true, maxlength: 50 }), field('programa', 'Programa', { required: true, maxlength: 150 }),
      field('nombre', 'Nombre del plan', { required: true, maxlength: 150 }),
      field('semestres', 'Semestres autorizados', { type: 'textarea', required: true, full: true, help: 'Un número entero por línea. No se presupone un rango de semestres.' }), confirmField()],
      save: (v) => ctx.api.request('/planes-estudio', { method: 'POST', body: { codigo: v.codigo, programa: v.programa, nombre: v.nombre, semestres: lines(v.semestres).map(Number) } }),
      done: saved(ctx, 'Plan registrado.'),
    }))], columns: [['Código', (r) => r.codigo], ['Programa', (r) => r.programa], ['Nombre', (r) => r.nombre],
      ['Semestres', (r) => r.semestres.join(', ')], ['Estado', (r) => r.activo ? 'Activo' : 'Inactivo']],
  });
}
