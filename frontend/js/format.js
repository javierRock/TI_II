export const labels = {
  personal_administrativo: 'Personal administrativo', docente: 'Docente', estudiante: 'Estudiante',
  disponible: 'Disponible', prestada: 'Prestada', mantenimiento: 'Mantenimiento', baja: 'Baja',
  activo: 'Activo', vencido: 'Vencido', devuelto: 'Devuelto', borrador: 'Borrador',
  programada: 'Programada', vigente: 'Vigente', expirada: 'Expirada', retiro: 'Retiro', en_sitio: 'En sitio',
};
export const label = (value) => labels[value] ?? value ?? '—';
export const isAdmin = (user) => Boolean(user?.atribucion_admin && user.rol !== 'estudiante');
export function date(value) {
  if (!value) return '—';
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? 'Fecha inválida' : new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(instant);
}
export function localDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function isoDate(value) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error('Indica una fecha y hora válidas.');
  return parsed.toISOString();
}
export const lines = (value) => String(value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
export function query(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString();
}
export function errorText(error) {
  const fields = Array.isArray(error.fields) ? error.fields.map((item) => `${item.campo || 'Formulario'}: ${item.mensaje}`).join('\n') : '';
  return [error.message, fields].filter(Boolean).join('\n');
}
