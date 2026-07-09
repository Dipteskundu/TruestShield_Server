const ChatSession = require("../models/ChatSession");
const ChatBotMessage = require("../models/ChatBotMessage");
const UserChatBlock = require("../models/UserChatBlock");
const User = require("../models/User");

exports.getChatbotStats = async (_req, res) => {
  const [totalSessions, totalMessages, flaggedMessages, blockedUsers, activeBlocks] =
    await Promise.all([
      ChatSession.countDocuments(),
      ChatBotMessage.countDocuments(),
      ChatBotMessage.countDocuments({ flagged: true }),
      UserChatBlock.distinct("userId").then((ids) => ids.length),
      UserChatBlock.countDocuments({
        resolvedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }),
    ]);

  res.json({
    success: true,
    data: {
      totalSessions,
      totalMessages,
      flaggedMessages,
      blockedUsers,
      activeBlocks,
    },
  });
};

exports.getFlaggedMessages = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    ChatBotMessage.find({ flagged: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("userId role content blockedReason createdAt")
      .lean(),
    ChatBotMessage.countDocuments({ flagged: true }),
  ]);

  const userIds = [...new Set(messages.map((m) => m.userId).filter(Boolean))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email")
    .lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  const enriched = messages.map((m) => ({
    ...m,
    userName: m.userId ? userMap[m.userId.toString()]?.name || "Unknown" : "Guest",
    userEmail: m.userId ? userMap[m.userId.toString()]?.email || "Unknown" : null,
  }));

  res.json({
    success: true,
    data: {
      messages: enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
};

exports.getBlockedUsers = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const [blocks, total] = await Promise.all([
    UserChatBlock.find()
      .sort({ blockedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("userId reason blockedAt expiresAt resolvedAt resolvedBy")
      .lean(),
    UserChatBlock.countDocuments(),
  ]);

  const userIds = [
    ...new Set(
      [...blocks.map((b) => b.userId), ...blocks.map((b) => b.resolvedBy)].filter(
        Boolean
      )
    ),
  ];
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email")
    .lean();
  const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

  const enriched = blocks.map((b) => ({
    ...b,
    userName: userMap[b.userId.toString()]?.name || "Unknown",
    userEmail: userMap[b.userId.toString()]?.email || "Unknown",
    resolvedByName: b.resolvedBy
      ? userMap[b.resolvedBy.toString()]?.name || "Unknown"
      : null,
  }));

  res.json({
    success: true,
    data: {
      blocks: enriched,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
};

exports.liftBlock = async (req, res) => {
  const { id } = req.params;

  const block = await UserChatBlock.findById(id);
  if (!block) {
    return res.status(404).json({
      success: false,
      message: "Block not found",
    });
  }

  if (block.resolvedAt) {
    return res.status(400).json({
      success: false,
      message: "Block is already resolved",
    });
  }

  block.resolvedAt = new Date();
  block.resolvedBy = req.user.id;
  await block.save();

  res.json({ success: true, data: block });
};

exports.getUserSessions = async (req, res) => {
  const { userId } = req.params;

  const sessions = await ChatSession.find({ userId })
    .sort({ updatedAt: -1 })
    .select("title messageCount lastMessagePreview createdAt updatedAt")
    .lean();

  res.json({ success: true, data: sessions });
};

exports.getSessionMessages = async (req, res) => {
  const { id } = req.params;

  const messages = await ChatBotMessage.find({ sessionId: id })
    .sort({ createdAt: 1 })
    .select("role content flagged blockedReason createdAt")
    .lean();

  res.json({ success: true, data: messages });
};
