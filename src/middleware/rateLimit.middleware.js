const ApiError = require("../utils/apiError");
const { getCache, incrementRateLimit } = require("../services/cacheService");

const GUEST_LIMITS = { text: 3, url: 5, image: 2 };
const USER_LIMITS = { text: 50, url: 30, image: 20 };

function rateLimitMiddleware(module) {
  return async (req, _res, next) => {
    const userId = req.user?.id || req.ip;
    const isGuest = !req.user?.id;
    const limit = isGuest ? GUEST_LIMITS[module] : USER_LIMITS[module];

    if (!limit) return next();

    const key = `ratelimit:${module}:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await incrementRateLimit(key);

    if (count > limit) {
      return next(
        new ApiError(
          429,
          `Daily ${module} scan limit reached (${limit}/${isGuest ? "guest" : "registered"})`
        )
      );
    }

    req.rateLimitKey = key;
    next();
  };
}

module.exports = { rateLimitMiddleware, getCache };
