const ApiError = require("../utils/apiError");
const { getCache, incrementRateLimit } = require("../services/cacheService");

const USER_LIMITS = { text: 50, url: 30, image: 20 };

function rateLimitMiddleware(module) {
  return async (req, _res, next) => {
    const userId = req.user?.id;
    const limit = USER_LIMITS[module];

    if (!limit) return next();

    const key = `ratelimit:${module}:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await incrementRateLimit(key);

    if (count > limit) {
      return next(
        new ApiError(
          429,
          `Daily ${module} scan limit reached (${limit}/day)`
        )
      );
    }

    req.rateLimitKey = key;
    next();
  };
}

module.exports = { rateLimitMiddleware, getCache };
