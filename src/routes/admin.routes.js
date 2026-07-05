const express = require("express");
const adminController = require("../controllers/admin.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware, adminMiddleware } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { rateLimitsSchema } = require("../validators/admin.validator");

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get("/stats", asyncHandler(adminController.getStats));
router.get("/users", asyncHandler(adminController.getUsers));
router.get("/scans", asyncHandler(adminController.getRecentScans));
router.get("/rate-limits", asyncHandler(adminController.getRateLimits));
router.put("/rate-limits", validate(rateLimitsSchema), asyncHandler(adminController.updateRateLimits));

module.exports = router;
