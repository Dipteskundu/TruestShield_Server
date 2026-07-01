const express = require("express");
const userController = require("../controllers/user.controller");
const asyncHandler = require("../utils/asyncHandler");
const { authMiddleware } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { aiPreferencesSchema, customProviderSchema, testProviderSchema } = require("../validators/user.validator");
const { uploadImage } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", asyncHandler(userController.getProfile));
router.put("/profile", asyncHandler(userController.updateProfile));
router.put("/password", asyncHandler(userController.changePassword));
router.post("/avatar", uploadImage, asyncHandler(userController.uploadAvatar));
router.delete("/avatar", asyncHandler(userController.removeAvatar));
router.get("/history", asyncHandler(userController.getHistory));
router.get("/stats", asyncHandler(userController.getStats));
router.get("/scans/remaining", asyncHandler(userController.getRemainingScans));
router.get("/usage", asyncHandler(userController.getUsage));

router.get("/ai-settings", asyncHandler(userController.getAISettings));
router.put("/ai-settings", validate(aiPreferencesSchema), asyncHandler(userController.updateAISettings));
router.post("/ai-settings/providers", validate(customProviderSchema), asyncHandler(userController.addCustomProvider));
router.delete("/ai-settings/providers/:id", asyncHandler(userController.removeCustomProvider));
router.post("/ai-settings/providers/test", validate(testProviderSchema), asyncHandler(userController.testProvider));

module.exports = router;
