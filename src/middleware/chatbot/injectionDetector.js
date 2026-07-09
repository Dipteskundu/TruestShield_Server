const {
  flagMessage,
  checkEscalation,
} = require("../../services/escalationService");

const INJECTION_PATTERNS = [
  /ignore (all |previous |your )?(instructions|rules|guidelines)/i,
  /pretend (you (are|have)|there are) no (rules|restrictions|guidelines)/i,
  /act as (a different|an unrestricted|a new|another) (ai|model|assistant)/i,
  /you are now|from now on you (are|will|must)/i,
  /DAN|jailbreak|developer mode|unrestricted mode/i,
  /forget (everything|your training|your instructions)/i,
  /\[system\]|\[admin\]|\[override\]/i,
];

async function injectionDetector(req, res, next) {
  const message = req.body.message || "";
  const isInjection = INJECTION_PATTERNS.some((p) => p.test(message));

  if (isInjection) {
    await flagMessage(
      req.user?.id,
      message,
      "prompt_injection_attempt"
    );

    const escalated = await checkEscalation(
      req.user?.id,
      req.body.sessionId
    );

    return res.status(200).json({
      success: true,
      data: {
        response:
          "I noticed that message was trying to change how I behave. " +
          "I'm not able to override my guidelines, and that request has been logged. " +
          "Is there something about TrustShield I can genuinely help you with?",
        blocked: escalated,
        flagged: true,
      },
    });
  }

  next();
}

module.exports = injectionDetector;
