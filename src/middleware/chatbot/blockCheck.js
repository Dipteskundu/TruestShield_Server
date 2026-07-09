const { isUserBlocked } = require("../../services/escalationService");

async function blockCheck(req, res, next) {
  if (!req.user) return next();

  const blocked = await isUserBlocked(req.user.id);
  if (blocked) {
    return res.status(403).json({
      success: true,
      data: {
        response:
          "Your access to TrustBot has been restricted. " +
          "Please contact support if you believe this is an error.",
        blocked: true,
        flagged: false,
      },
    });
  }

  next();
}

module.exports = blockCheck;
