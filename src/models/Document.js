const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: { type: String, default: "Untitled Document" },
    documentType: {
      type: String,
      enum: [
        "lease",
        "freelance",
        "nda",
        "employment",
        "tos",
        "vendor",
        "other",
      ],
      default: "other",
    },
    rawText: { type: String },
    fileUrl: { type: String },
    overallRiskScore: { type: Number, min: 0, max: 100, default: 0 },
    executiveSummary: { type: String, default: "" },
    glossary: [{ term: String, definition: String }],
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    shareToken: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
