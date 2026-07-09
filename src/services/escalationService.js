const ChatBotMessage = require("../models/ChatBotMessage");
const UserChatBlock = require("../models/UserChatBlock");

async function flagMessage(userId, message, reason) {
  if (!userId) return;

  await ChatBotMessage.create({
    sessionId: null,
    userId,
    role: "user",
    content: message,
    flagged: true,
    blockedReason: reason,
  });
}

async function checkEscalation(userId, sessionId) {
  if (!userId) return false;

  const sessionFlags = await ChatBotMessage.countDocuments({
    sessionId,
    flagged: true,
  });

  if (sessionFlags >= 2) {
    await blockUser(userId, "Repeated policy violations in one session");
    return true;
  }

  const recentFlags = await ChatBotMessage.countDocuments({
    userId,
    flagged: true,
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });

  if (recentFlags >= 5) {
    await blockUser(userId, "Repeated policy violations across sessions", 24);
    return true;
  }

  return false;
}

async function blockUser(userId, reason, durationHours = null) {
  const expiresAt = durationHours
    ? new Date(Date.now() + durationHours * 60 * 60 * 1000)
    : null;

  await UserChatBlock.create({
    userId,
    reason,
    blockedAt: new Date(),
    expiresAt,
  });
}

async function isUserBlocked(userId) {
  if (!userId) return false;

  const block = await UserChatBlock.findOne({
    userId,
    resolvedAt: null,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });

  return !!block;
}

module.exports = { flagMessage, checkEscalation, blockUser, isUserBlocked };
