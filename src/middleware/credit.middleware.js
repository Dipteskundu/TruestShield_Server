const { optionalAuth } = require("./auth.middleware");
const { incrementRateLimit } = require("../services/cacheService");
const User = require("../models/User");
const ApiError = require("../utils/apiError");

function getCurrentWeek() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - jan1) / 86400000) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getCurrentWeekMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

const WEEKLY_LIMIT = 20;

function creditMiddleware(module) {
  return async (req, _res, next) => {
    const userId = req.user?.id;

    // Guest: tracked per module + IP in Redis
    if (!userId) {
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      const week = getCurrentWeek();
      const key = `credits:guest:${module}:${ip}:${week}`;
      const count = await incrementRateLimit(key, 604800);

      req.creditCount = count;

      if (count > 2) {
        return next(
          new ApiError(429, "guest_limit", "Please login to continue scanning")
        );
      }

      return next();
    }

    // Pro: unlimited
    const user = await User.findById(userId).select("plan weeklyCredits weekStart");
    if (user?.plan === "pro") {
      return next();
    }

    // Registered free: weekly credits shared across modules
    const currentMonday = getCurrentWeekMonday();
    let weeklyCredits = user?.weeklyCredits || 0;
    const weekStart = user?.weekStart;

    if (!weekStart || weekStart < currentMonday) {
      weeklyCredits = 0;
      await User.findByIdAndUpdate(userId, {
        weeklyCredits: 0,
        weekStart: currentMonday,
      });
    }

    if (weeklyCredits >= WEEKLY_LIMIT) {
      return next(
        new ApiError(
          429,
          "credit_limit",
          "Weekly credit limit reached. Upgrade to Pro for unlimited scans."
        )
      );
    }

    await User.findByIdAndUpdate(userId, { $inc: { weeklyCredits: 1 } });

    req.creditCount = weeklyCredits + 1;
    next();
  };
}

module.exports = { creditMiddleware, optionalAuth };
