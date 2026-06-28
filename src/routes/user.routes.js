const express = require("express");
const userController = require("../controllers/user.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/history", asyncHandler(userController.getHistory));
router.get("/stats", asyncHandler(userController.getStats));

module.exports = router;
