const mongoose = require("mongoose");

const chatBotMessageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatSession",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
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
  blockedReason: {
    type: String,
    default: null,
  },
  flagged: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

chatBotMessageSchema.index({ sessionId: 1, createdAt: 1 });
chatBotMessageSchema.index({ userId: 1, flagged: 1, createdAt: -1 });

module.exports = mongoose.model("ChatBotMessage", chatBotMessageSchema);
