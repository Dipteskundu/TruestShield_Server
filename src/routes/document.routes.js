const express = require("express");
const documentController = require("../controllers/document.controller");
const exportController = require("../controllers/export.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const {
  documentUploadSchema,
  chatSchema,
  documentIdSchema,
} = require("../validators/document.validator");
const { uploadPdf } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", asyncHandler(documentController.list));

router.post(
  "/upload",
  uploadPdf,
  validate(documentUploadSchema),
  asyncHandler(documentController.upload)
);

router.get(
  "/:id",
  validate(documentIdSchema),
  asyncHandler(documentController.getById)
);

router.get(
  "/:id/status",
  validate(documentIdSchema),
  asyncHandler(documentController.getStatus)
);

router.post(
  "/:id/chat",
  validate(chatSchema),
  asyncHandler(documentController.chat)
);

router.get(
  "/:id/export",
  validate(documentIdSchema),
  asyncHandler(exportController.exportReport)
);

module.exports = router;
