const express = require("express");
const chatbotController = require("../controllers/chatbot.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware, optionalAuth } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { messageSchema } = require("../validators/chatbot.validator");

const authGate = require("../middleware/chatbot/authGate");
const blockCheck = require("../middleware/chatbot/blockCheck");
const inputLimit = require("../middleware/chatbot/inputLimit");
const injectionDetector = require("../middleware/chatbot/injectionDetector");
const commandDetector = require("../middleware/chatbot/commandDetector");
const scopeCheck = require("../middleware/chatbot/scopeCheck");

const router = express.Router();

router.post(
  "/message",
  optionalAuth,
  authGate,
  blockCheck,
  inputLimit,
  injectionDetector,
  commandDetector,
  scopeCheck,
  validate(messageSchema),
  asyncHandler(chatbotController.sendMessage)
);

router.get("/sessions", authMiddleware, asyncHandler(chatbotController.getSessions));
router.get("/sessions/:id", authMiddleware, asyncHandler(chatbotController.getSession));
router.delete("/sessions/:id", authMiddleware, asyncHandler(chatbotController.deleteSession));
router.delete("/sessions", authMiddleware, asyncHandler(chatbotController.deleteAllSessions));
router.post("/sessions", authMiddleware, asyncHandler(chatbotController.createSession));
router.get("/status", authMiddleware, asyncHandler(chatbotController.getStatus));

module.exports = router;
