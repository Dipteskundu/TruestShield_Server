const multer = require("multer");
const ApiError = require("../utils/apiError");

const GUEST_LIMIT = 5 * 1024 * 1024;
const REGISTERED_LIMIT = 10 * 1024 * 1024;

const storage = multer.memoryStorage();

const imageFilter = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Invalid file type. Allowed: JPEG, PNG, WebP"));
  }
};

const pdfFilter = (_req, file, cb) => {
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
};

const upload = multer({
  storage,
  limits: {
    fileSize: REGISTERED_LIMIT,
  },
  fileFilter: pdfFilter,
});

const uploadPdf = upload.single("document");

function createUploadMiddleware() {
  return (req, res, next) => {
    const limit = req.user?.id ? REGISTERED_LIMIT : GUEST_LIMIT;
    const instance = multer({
      storage,
      limits: { fileSize: limit },
      fileFilter: imageFilter,
    });

    instance.single("image")(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          const maxMB = req.user?.id ? 10 : 5;
          return next(
            new ApiError(413, `File too large. Maximum size is ${maxMB}MB`)
          );
        }
        return next(err);
      }
      next();
    });
  };
}

const uploadImage = createUploadMiddleware();

module.exports = { uploadImage, uploadPdf, upload };
