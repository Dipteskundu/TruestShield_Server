const { cloudinary, isConfigured } = require("../config/cloudinary");
const ApiError = require("../utils/apiError");

function uploadBuffer(buffer, folder, resourceType = "auto") {
  if (!isConfigured) {
    return Promise.resolve({
      secure_url: null,
      public_id: null,
      mode: "mock",
    });
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) reject(new ApiError(500, "File upload failed"));
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
