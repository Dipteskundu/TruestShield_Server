const express = require("express");
const adminController = require("../controllers/admin.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware, adminMiddleware } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", asyncHandler(adminController.getStats));
router.get("/users", asyncHandler(adminController.getUsers));
router.get("/scans", asyncHandler(adminController.getRecentScans));

module.exports = router;
