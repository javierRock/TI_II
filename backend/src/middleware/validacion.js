import { HttpError } from '../shared/errors.js';

export function validate(schemas) {
  return (request, _response, next) => {
    request.data = {};
    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(request[part]);
      if (!result.success) {
        const error = new HttpError(400, 'Datos de solicitud inválidos', 'VALIDACION');
        error.campos = result.error.issues.map((issue) => ({
          campo: [part, ...issue.path].join('.'), mensaje: issue.message,
        }));
        return next(error);
      }
      request.data[part] = result.data;
    }
    next();
  };
}
