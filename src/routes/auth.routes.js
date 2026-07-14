const express = require("express");
const authController = require("../controllers/auth.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");
const { authRateLimit } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/register", authRateLimit, asyncHandler(authController.register));
router.post("/oauth-register", asyncHandler(authController.oauthRegister));
router.post("/login", authRateLimit, asyncHandler(authController.login));
router.post("/oauth-login", asyncHandler(authController.oauthLogin));
router.get("/me", authMiddleware, asyncHandler(authController.me));

module.exports = router;
