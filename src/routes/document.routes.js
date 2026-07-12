const express = require("express");
const documentController = require("../controllers/document.controller");
const exportController = require("../controllers/export.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");
const { documentCreditMiddleware } = require("../middleware/credit.middleware");
const validate = require("../middleware/validate.middleware");
const {
  documentUploadSchema,
  chatSchema,
  documentIdSchema,
  documentTokenSchema,
  documentChatMessageSchema,
} = require("../validators/document.validator");
const { uploadPdf } = require("../middleware/upload.middleware");

const router = express.Router();

router.get(
  "/public/:token",
  validate(documentTokenSchema),
  asyncHandler(documentController.getPublicByToken)
);

router.use(authMiddleware);

router.get("/", asyncHandler(documentController.list));

router.post(
  "/upload",
  uploadPdf,
  validate(documentUploadSchema),
  documentCreditMiddleware(),
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
  "/:id/chat",
  validate(documentIdSchema),
  asyncHandler(documentController.getChatHistory)
);

router.get(
  "/:id/tree",
  validate(documentIdSchema),
  asyncHandler(documentController.getDocumentTree)
);

router.post(
  "/:id/chat/message",
  validate(documentChatMessageSchema),
  asyncHandler(documentController.sendDocumentChatMessage)
);

router.get(
  "/:id/chat/sessions",
  validate(documentIdSchema),
  asyncHandler(documentController.getChatSessions)
);

router.get(
  "/:id/chat/sessions/:sessionId",
  validate(documentIdSchema),
  asyncHandler(documentController.getChatSession)
);

router.delete(
  "/:id/chat/sessions/:sessionId",
  validate(documentIdSchema),
  asyncHandler(documentController.deleteChatSession)
);

router.get(
  "/:id/export",
  validate(documentIdSchema),
  asyncHandler(exportController.exportReport)
);

router.post(
  "/:id/share",
  validate(documentIdSchema),
  asyncHandler(documentController.share)
);

router.patch(
  "/:id/auto-delete",
  validate(documentIdSchema),
  asyncHandler(documentController.updateAutoDelete)
);

module.exports = router;
