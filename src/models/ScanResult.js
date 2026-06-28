const mongoose = require("mongoose");
const crypto = require("crypto");

const scanResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: ["email", "job", "message", "url", "image"],
      required: true,
    },
    input: { type: String, required: true },
    verdict: {
      type: String,
      enum: ["safe", "suspicious", "dangerous"],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 100, required: true },
    reasons: [{ type: String }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    shareToken: {
      type: String,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScanResult", scanResultSchema);
