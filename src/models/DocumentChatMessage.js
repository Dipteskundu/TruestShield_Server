const mongoose = require("mongoose");

const DocumentChatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentChatSession",
      required: true,
    },
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
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    citedNodeIds: {
      type: [String],
      default: [],
    },
    citedNodes: {
      type: [
        {
          nodeId: String,
          title: String,
          pageStart: Number,
          pageEnd: Number,
          path: String,
        },
      ],
      default: [],
    },
    navigationReasoning: {
      type: String,
      default: null,
    },
    confidence: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "high",
    },
    nodesFound: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

DocumentChatMessageSchema.index({ sessionId: 1, createdAt: 1 });

module.exports = mongoose.model("DocumentChatMessage", DocumentChatMessageSchema);
