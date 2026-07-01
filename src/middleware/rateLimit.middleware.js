const ApiError = require("../utils/apiError");
const { getCache, incrementRateLimit } = require("../services/cacheService");
const User = require("../models/User");

const PLAN_LIMITS = {
  free: { text: 50, url: 30, image: 20 },
  pro: { text: 100, url: 60, image: 40 },
};

function rateLimitMiddleware(module) {
  return async (req, _res, next) => {
    const userId = req.user?.id;

    if (!PLAN_LIMITS[module]) return next();

    let limit = PLAN_LIMITS.free[module];
    if (userId) {
      try {
        const user = await User.findById(userId).select("plan");
        if (user?.plan && PLAN_LIMITS[user.plan]) {
          limit = PLAN_LIMITS[user.plan][module];
        }
      } catch {
        // Default to free limits on error
      }
    }

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
