const express = require("express");
const authController = require("../controllers/auth.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/register", asyncHandler(authController.register));
router.post("/login", asyncHandler(authController.login));
router.get("/me", authMiddleware, asyncHandler(authController.me));

module.exports = router;
