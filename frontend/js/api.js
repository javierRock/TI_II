export class ApiError extends Error {
  constructor(message, status = 0, fields = []) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Ningún secreto se persiste en localStorage, sessionStorage o en la URL.
export function createApi({ fetcher = globalThis.fetch, onUnauthorized = () => {} } = {}) {
  let csrfToken = null;
  return {
    setSession(session) { csrfToken = session?.csrf_token ?? null; },
    async request(path, { method = 'GET', body, signal } = {}) {
      if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) throw new Error('Ruta de API inválida');
      let response;
      try {
        response = await fetcher(`/api/v1${path}`, {
          method, credentials: 'same-origin', cache: 'no-store', signal,
          headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new ApiError(method === 'GET' ? 'No se pudo conectar. Comprueba tu conexión y vuelve a intentar.'
          : 'No se recibió respuesta. Consulta el registro antes de repetir: la operación podría haberse guardado.');
      }
      let data = null;
      if (response.status !== 204) {
        try { data = await response.json(); }
        catch { throw new ApiError('Respuesta no válida del servicio. Consulta el registro antes de repetir una escritura.', response.status); }
      }
      if (!response.ok) {
        if (response.status === 401 && path !== '/auth/login') { csrfToken = null; onUnauthorized(); }
        throw new ApiError(data?.error ?? 'No se pudo completar la solicitud', response.status, data?.campos ?? []);
      }
      return data;
    },
  };
}
