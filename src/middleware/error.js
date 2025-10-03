// Centralized error handler and helpers
export function errorHandler(err, _req, res, _next) {
  // Normalize known shapes
  const status = err.statusCode || err.status || 500;
  const code = err.code || err.error || 'SERVER_ERROR';
  const message = err.message && typeof err.message === 'string' ? err.message : undefined;
  const details = err.details || err.body || undefined;

  // Log server-side
  // eslint-disable-next-line no-console
  console.error('[error]', { status, code, message, details });

  res.status(status).json({ error: code, message, details });
}

export function httpError(status, code, details) {
  const e = new Error(code);
  e.statusCode = status;
  e.code = code;
  if (details !== undefined) e.details = details;
  return e;
}
