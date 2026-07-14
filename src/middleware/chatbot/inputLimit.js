const { CHATBOT_MAX_INPUT_LENGTH } = require("../../config/chatbot-knowledge");

function inputLimit(req, res, next) {
  const message = req.body.message || "";

  if (message.length > CHATBOT_MAX_INPUT_LENGTH) {
    return res.status(413).json({
      success: false,
      message: "That message is a bit long for me to process. Could you break it into a shorter question?",
      data: {
        response:
          "That message is a bit long for me to process. " +
          "Could you break it into a shorter question?",
        blocked: false,
        flagged: false,
      },
    });
  }

  next();
}

module.exports = inputLimit;
