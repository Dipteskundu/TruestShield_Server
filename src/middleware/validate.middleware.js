const ApiError = require("../utils/apiError");

function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      return next(new ApiError(400, message));
    }

    req.validated = result.data;
    next();
  };
}

module.exports = validate;
