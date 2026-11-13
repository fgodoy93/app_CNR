export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'No autenticado') => new AppError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'No tiene permisos para esta acción') => new AppError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Recurso no encontrado') => new AppError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, details?: unknown) => new AppError(409, msg, 'CONFLICT', details);
