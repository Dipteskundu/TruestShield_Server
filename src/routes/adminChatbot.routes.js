const express = require("express");
const adminChatbotController = require("../controllers/adminChatbot.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware, adminMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", asyncHandler(adminChatbotController.getChatbotStats));
router.get("/flags", asyncHandler(adminChatbotController.getFlaggedMessages));
router.get("/blocks", asyncHandler(adminChatbotController.getBlockedUsers));
router.post("/blocks/:id/lift", asyncHandler(adminChatbotController.liftBlock));
router.get("/users/:userId/sessions", asyncHandler(adminChatbotController.getUserSessions));
router.get("/sessions/:id/messages", asyncHandler(adminChatbotController.getSessionMessages));

module.exports = router;
