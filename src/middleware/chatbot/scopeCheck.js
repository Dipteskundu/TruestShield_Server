const OUT_OF_SCOPE_PATTERNS = [
  /write (me )?(a |an )?(essay|story|poem|code|email to|letter)/i,
  /who (is|was) (the )?(president|prime minister|ceo)/i,
  /recipe for|how to cook|weather (in|today|tomorrow)/i,
  /stock price|crypto|bitcoin|investment advice/i,
  /translate (this )?to/i,
  /write (a |some )?code (for|that|to)/i,
  /what is (the )?(capital of|population of)/i,
  /tell me (a )?joke/i,
  /who (won|won the) (the )?(game|match|election)/i,
];

function scopeCheck(req, res, next) {
  const message = req.body.message || "";
  const isOutOfScope = OUT_OF_SCOPE_PATTERNS.some((p) => p.test(message));

  if (isOutOfScope) {
    return res.status(200).json({
      success: true,
      data: {
        response:
          "I'm TrustBot, TrustShield's assistant — I'm only able to help with " +
          "questions about the platform and your account. " +
          "Is there something about TrustShield I can help you with?",
        blocked: false,
        flagged: false,
      },
    });
  }

  next();
}

module.exports = scopeCheck;
