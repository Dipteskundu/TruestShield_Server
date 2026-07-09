const {
  flagMessage,
  checkEscalation,
  blockUser,
} = require("../../services/escalationService");

const COMMAND_PATTERNS = [
  /run (a |the )?(command|script|code|query)/i,
  /execute|sudo|bash|shell|terminal|ssh|kubectl|docker/i,
  /drop (table|database|collection)/i,
  /delete (all |every )?(user|record|database|document)/i,
  /access (the )?(server|database|file system|backend)/i,
  /(show|get|list) (all )?users/i,
];

async function commandDetector(req, res, next) {
  const message = req.body.message || "";
  const isCommand = COMMAND_PATTERNS.some((p) => p.test(message));

  if (isCommand) {
    await flagMessage(
      req.user?.id,
      message,
      "server_command_attempt"
    );

    const escalated = await checkEscalation(
      req.user?.id,
      req.body.sessionId
    );

    if (escalated) {
      return res.status(403).json({
        success: true,
        data: {
          response:
            "This session has been blocked due to repeated attempts to perform " +
            "restricted operations. Please contact support.",
          blocked: true,
          flagged: true,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        response:
          "I don't have any ability to run commands, access servers, or interact " +
          "with any system infrastructure — and I wouldn't do this even if asked. " +
          "This request has been flagged. If you have a genuine technical question " +
          "about TrustShield, I'm happy to help.",
        blocked: false,
        flagged: true,
      },
    });
  }

  next();
}

module.exports = commandDetector;
