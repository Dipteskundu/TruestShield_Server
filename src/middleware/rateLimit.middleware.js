const ApiError = require("../utils/apiError");
const { getCache, setCache, incrementRateLimit } = require("../services/cacheService");
const User = require("../models/User");
const SystemConfig = require("../models/SystemConfig");

const DEFAULT_LIMITS = {
  free: { text: 50, url: 30, image: 20 },
  pro: { text: 100, url: 60, image: 40 },
};

const CONFIG_CACHE_KEY = "config:rateLimits";
const CONFIG_CACHE_TTL = 300; // 5 minutes

async function getRateLimits() {
  const cached = await getCache(CONFIG_CACHE_KEY);
  if (cached) return cached;

  try {
    const config = await SystemConfig.findById("global");
    if (config?.rateLimits) {
      await setCache(CONFIG_CACHE_KEY, config.rateLimits, CONFIG_CACHE_TTL);
      return config.rateLimits;
    }
  } catch {
    // Fall through to defaults
  }

  return DEFAULT_LIMITS;
}

function rateLimitMiddleware(module) {
  return async (req, _res, next) => {
    const userId = req.user?.id;

    const limits = await getRateLimits();

    if (!limits.free[module] && module !== "document") return next();

    let limit = limits.free[module] || 0;
    if (userId) {
      try {
        const user = await User.findById(userId).select("plan");
        if (user?.plan && limits[user.plan]) {
          limit = limits[user.plan][module] || limit;
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
