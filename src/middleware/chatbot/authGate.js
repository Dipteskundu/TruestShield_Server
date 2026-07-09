function authGate(req, res, next) {
  const requestsUserData =
    req.body.message &&
    /(?:my|me|i|my account|my stats|my plan|my credits|my usage|my history|my scans|my documents)/i.test(
      req.body.message
    );

  if (requestsUserData && !req.user) {
    return res.status(200).json({
      success: true,
      data: {
        response:
          "You need to be signed in to access your account information. " +
          "I can still help you with questions about TrustShield — " +
          "or sign in to see your stats and history.",
        blocked: false,
        flagged: false,
      },
    });
  }

  next();
}

module.exports = authGate;
