// Every error in the app ends up here. Express 5 also forwards errors thrown
// inside async route handlers, so routes don't need their own try/catch.
// Express only treats a middleware as an error handler if it has 4 arguments,
// so `next` must stay even though we don't use it.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Errors we create on purpose carry a status (e.g. 400 for bad JSON from express.json()).
  const status = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) {
    console.error(err);
  }

  const body = {
    error: {
      // Don't reveal internal error messages to users in production.
      message: status >= 500 && isProduction ? 'Internal server error' : err.message,
    },
  };

  if (err.details) {
    body.error.details = err.details;
  }

  // Stack traces help while developing but must never leak in production.
  if (!isProduction && status >= 500) {
    body.error.stack = err.stack;
  }

  res.status(status).json(body);
}
