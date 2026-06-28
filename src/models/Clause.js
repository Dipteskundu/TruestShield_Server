const mongoose = require("mongoose");

const clauseSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    clauseIndex: { type: Number, required: true },
    originalText: { type: String, required: true },
    plainExplanation: { type: String, default: "" },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    riskReason: { type: String, default: "" },
    missingProtections: [{ type: String }],
    keyTerms: [{ type: String }],
    embedding: [{ type: Number }],
  },
  { timestamps: true }
);

clauseSchema.index({ documentId: 1, clauseIndex: 1 });

module.exports = mongoose.model("Clause", clauseSchema);
