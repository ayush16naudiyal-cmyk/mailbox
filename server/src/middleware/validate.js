// Reusable validation middleware. Pass zod schemas for whichever parts of the
// request you want checked:
//   router.patch('/:id', validate({ params: idParams, body: updateSchema }), handler)
//
// The parsed values are stored on req.validated (e.g. req.validated.query.page),
// because zod also converts types: "2" in the query string becomes the number 2.
// We don't overwrite req.query because Express 5 makes it read-only.
export function validate(schemas) {
  return (req, res, next) => {
    req.validated = {};
    const details = [];

    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;

      // req.body is undefined when the request has no JSON body.
      const result = schemas[part].safeParse(req[part] ?? {});

      if (result.success) {
        req.validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ location: part, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      const err = new Error('Invalid input');
      err.status = 400;
      err.details = details;
      return next(err); // the central error handler sends the 400 response
    }

    next();
  };
}
