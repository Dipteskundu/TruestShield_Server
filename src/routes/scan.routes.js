const express = require("express");
const scanController = require("../controllers/scan.controller");
const asyncHandler = require("../utils/asyncHandler");
const { optionalAuth, creditMiddleware } = require("../middleware/credit.middleware");
const validate = require("../middleware/validate.middleware");
const { scanTextSchema, scanUrlSchema } = require("../validators/scan.validator");
const { uploadImage } = require("../middleware/upload.middleware");

const router = express.Router();

router.post(
  "/text",
  creditMiddleware("text"),
  validate(scanTextSchema),
  asyncHandler(scanController.scanText)
);

router.post(
  "/url",
  creditMiddleware("url"),
  validate(scanUrlSchema),
  asyncHandler(scanController.scanUrl)
);

router.post(
  "/image",
  creditMiddleware("image"),
  uploadImage,
  asyncHandler(scanController.scanImage)
);

router.get(
  "/credits/:module",
  optionalAuth,
  asyncHandler(scanController.getCreditStatus)
);

router.get("/result/:id", asyncHandler(scanController.getSharedResult));

module.exports = router;
