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
    missingProtections: [{ type: String }],
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    shareToken: { type: String },
    expiresAt: { type: Date, default: null },
    treeBuilt: { type: Boolean, default: false },
    treeBuiltAt: { type: Date, default: null },
    treeVersion: { type: String, default: "v1" },
    nodeCount: { type: Number, default: 0 },
    leafCount: { type: Number, default: 0 },
    treeError: { type: String, default: null },
  },
  { timestamps: true }
);

documentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Document", documentSchema);
