const express = require("express");
const scanController = require("../controllers/scan.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware, optionalAuth } = require("../middleware/auth.middleware");
const { rateLimitMiddleware } = require("../middleware/rateLimit.middleware");
const validate = require("../middleware/validate.middleware");
const { scanTextSchema, scanUrlSchema } = require("../validators/scan.validator");
const { uploadImage } = require("../middleware/upload.middleware");

const router = express.Router();

router.post(
  "/text",
  optionalAuth,
  rateLimitMiddleware("text"),
  validate(scanTextSchema),
  asyncHandler(scanController.scanText)
);

router.post(
  "/url",
  optionalAuth,
  rateLimitMiddleware("url"),
  validate(scanUrlSchema),
  asyncHandler(scanController.scanUrl)
);

router.post(
  "/image",
  optionalAuth,
  rateLimitMiddleware("image"),
  uploadImage,
  asyncHandler(scanController.scanImage)
);

router.get("/result/:id", asyncHandler(scanController.getSharedResult));

module.exports = router;
