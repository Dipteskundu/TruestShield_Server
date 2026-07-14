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
    try {
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
            new ApiError(429, "Please login to continue scanning")
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

      // Atomic check-and-increment to prevent race conditions
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { weekStart: { $lt: currentMonday } },
            { weekStart: null },
          ],
        },
        {
          $set: { weeklyCredits: 1, weekStart: currentMonday },
        },
        { new: true }
      );

      if (updatedUser) {
        // Week was reset, user gets 1 credit
        req.creditCount = 1;
        return next();
      }

      // Week hasn't reset, try to increment if under limit
      const userAfterReset = await User.findOneAndUpdate(
        {
          _id: userId,
          weeklyCredits: { $lt: WEEKLY_LIMIT },
        },
        {
          $inc: { weeklyCredits: 1 },
        },
        { new: true }
      );

      if (!userAfterReset) {
        return next(
          new ApiError(429, "Weekly credit limit reached. Upgrade to Pro for unlimited scans.")
        );
      }

      req.creditCount = userAfterReset.weeklyCredits;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function documentCreditMiddleware() {
  return async (req, _res, next) => {
    try {
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

      // Atomic check-and-increment to prevent race conditions
      const updatedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { documentMonthStart: { $lt: currentMonthStart } },
            { documentMonthStart: null },
          ],
        },
        {
          $set: { documentCredits: 1, documentMonthStart: currentMonthStart },
        },
        { new: true }
      );

      if (updatedUser) {
        // Month was reset, user gets 1 credit
        req.creditCount = 1;
        return next();
      }

      // Month hasn't reset, try to increment if under limit
      const userAfterReset = await User.findOneAndUpdate(
        {
          _id: userId,
          documentCredits: { $lt: DOCUMENT_MONTHLY_LIMIT },
        },
        {
          $inc: { documentCredits: 1 },
        },
        { new: true }
      );

      if (!userAfterReset) {
        return next(
          new ApiError(429, "Monthly document limit reached (5/month on free plan). Upgrade to Pro for unlimited.")
        );
      }

      req.creditCount = userAfterReset.documentCredits;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { creditMiddleware, documentCreditMiddleware, optionalAuth };
