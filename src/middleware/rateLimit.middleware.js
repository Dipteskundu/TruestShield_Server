const ApiError = require("../utils/apiError");

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

if (!globalThis.__rateLimitAttempts) {
  globalThis.__rateLimitAttempts = new Map();
}
const attempts = globalThis.__rateLimitAttempts;

if (!globalThis.__rateLimitCleanupInterval) {
  globalThis.__rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of attempts) {
      if (now - data.windowStart > WINDOW_MS) {
        attempts.delete(key);
      }
    }
  }, 60 * 1000);
}

function authRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  let record = attempts.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    record = { count: 1, windowStart: now };
    attempts.set(ip, record);
    return next();
  }

  record.count++;

  if (record.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
    res.setHeader("Retry-After", retryAfter);
    throw new ApiError(
      429,
      `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`
    );
  }

  next();
}

module.exports = { authRateLimit };
