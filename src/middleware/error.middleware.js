const ApiError = require("../utils/apiError");

function errorHandler(err, _req, res, _next) {
  const statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  const message = err instanceof ApiError ? err.message : err.message || "Internal server error";

  console.error(`[Error] ${statusCode}: ${message}`);
  if (process.env.NODE_ENV === "development" && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && err.stack
      ? { stack: err.stack }
      : {}),
  });
}

module.exports = errorHandler;
