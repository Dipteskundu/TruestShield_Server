const mongoose = require("mongoose");

const DocumentChatSessionSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
    },
    lastMessagePreview: {
      type: String,
    },
  },
  { timestamps: true }
);

DocumentChatSessionSchema.index({ documentId: 1, userId: 1, lastMessageAt: -1 });

module.exports = mongoose.model("DocumentChatSession", DocumentChatSessionSchema);
