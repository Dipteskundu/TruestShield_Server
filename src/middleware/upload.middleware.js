const multer = require("multer");
const ApiError = require("../utils/apiError");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(_req, file, cb) {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];

    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, "Invalid file type. Allowed: JPEG, PNG, WebP, PDF"));
    }
  },
});

const uploadImage = upload.single("image");
const uploadPdf = upload.single("document");

module.exports = { uploadImage, uploadPdf, upload };
