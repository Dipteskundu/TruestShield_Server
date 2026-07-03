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

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const WEEKLY_LIMIT = 20;
const DOCUMENT_MONTHLY_LIMIT = 5;

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
    const user = await User.findById(userId).select(
      "plan weeklyCredits weekStart documentCredits documentMonthStart"
    );
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

function documentCreditMiddleware() {
  return async (req, _res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return next(new ApiError(401, "Authentication required for document analysis"));
    }

    const user = await User.findById(userId).select(
      "plan documentCredits documentMonthStart"
    );

    if (user?.plan === "pro") {
      return next();
    }

    const currentMonthStart = getCurrentMonthStart();
    let documentCredits = user?.documentCredits || 0;
    const monthStart = user?.documentMonthStart;

    if (!monthStart || monthStart < currentMonthStart) {
      documentCredits = 0;
      await User.findByIdAndUpdate(userId, {
        documentCredits: 0,
        documentMonthStart: currentMonthStart,
      });
    }

    if (documentCredits >= DOCUMENT_MONTHLY_LIMIT) {
      return next(
        new ApiError(
          429,
          "document_limit",
          "Monthly document limit reached (5/month on free plan). Upgrade to Pro for unlimited."
        )
      );
    }

    await User.findByIdAndUpdate(userId, { $inc: { documentCredits: 1 } });

    req.creditCount = documentCredits + 1;
    next();
  };
}

module.exports = { creditMiddleware, documentCreditMiddleware, optionalAuth };
