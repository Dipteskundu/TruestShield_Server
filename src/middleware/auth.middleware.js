const jwt = require("jsonwebtoken");
const ApiError = require("../utils/apiError");
const User = require("../models/User");

function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!token) {
    return next(new ApiError(401, "Authentication required"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  const token =
    req.cookies?.token ||
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Guest request — continue without user
  }

  next();
}

async function adminMiddleware(req, _res, next) {
  try {
    if (!req.user?.id) {
      return next(new ApiError(401, "Authentication required"));
    }

    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return next(new ApiError(403, "Admin access required"));
    }

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { authMiddleware, optionalAuth, adminMiddleware };
