const ChatSession = require("../models/ChatSession");
const ChatBotMessage = require("../models/ChatBotMessage");
const { buildUserContext } = require("../services/chatContextService");
const { buildSystemPrompt } = require("../services/chatPromptService");
const { streamChatCompletion } = require("../services/chatbotAiService");

exports.sendMessage = async (req, res) => {
  const { message, sessionId } = req.validated?.body || req.body;
  const userId = req.user?.id ?? null;

  let session;
  if (sessionId) {
    session = await ChatSession.findOne({ _id: sessionId, userId });
    if (!session) {
      session = await ChatSession.create({
        userId,
        title: message.slice(0, 60),
        messageCount: 0,
      });
    }
  } else {
    session = await ChatSession.create({
      userId,
      title: message.slice(0, 60),
      messageCount: 0,
    });
  }

  const history = await ChatBotMessage.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .select("role content");

  const userContext = userId ? await buildUserContext(userId) : null;
  const systemPrompt = buildSystemPrompt(userContext);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  await ChatBotMessage.create({
    sessionId: session._id,
    userId,
    role: "user",
    content: message,
    flagged: false,
  });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Session-Id", session._id.toString());

  let fullResponse = "";

  try {
    await streamChatCompletion(systemPrompt, messages, (chunk) => {
      fullResponse += chunk;
      res.write(chunk);
    });
  } catch (err) {
    fullResponse =
      "I'm having trouble connecting right now. Please try again in a moment.";
    res.write(fullResponse);
  }

  res.end();

  await ChatBotMessage.create({
    sessionId: session._id,
    userId,
    role: "assistant",
    content: fullResponse,
    flagged: false,
  });

  await ChatSession.findByIdAndUpdate(session._id, {
    updatedAt: new Date(),
    $inc: { messageCount: 2 },
    lastMessagePreview: fullResponse.slice(0, 80),
  });
};

exports.getSessions = async (req, res) => {
  const sessions = await ChatSession.find({ userId: req.user.id })
    .sort({ updatedAt: -1 })
    .select("title messageCount lastMessagePreview createdAt updatedAt");

  res.json({ success: true, data: sessions });
};

exports.getSession = async (req, res) => {
  const session = await ChatSession.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found",
    });
  }

  const messages = await ChatBotMessage.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .select("role content flagged blockedReason createdAt");

  res.json({ success: true, data: { session, messages } });
};

exports.deleteSession = async (req, res) => {
  const session = await ChatSession.findOneAndDelete({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!session) {
    return res.status(404).json({
      success: false,
      message: "Session not found",
    });
  }

  await ChatBotMessage.deleteMany({ sessionId: session._id });

  res.json({ success: true, data: { message: "Session deleted" } });
};

exports.deleteAllSessions = async (req, res) => {
  const sessions = await ChatSession.find({ userId: req.user.id }).select(
    "_id"
  );

  const sessionIds = sessions.map((s) => s._id);

  await ChatBotMessage.deleteMany({ sessionId: { $in: sessionIds } });
  await ChatSession.deleteMany({ userId: req.user.id });

  res.json({ success: true, data: { message: "All sessions deleted" } });
};

exports.createSession = async (req, res) => {
  const session = await ChatSession.create({
    userId: req.user.id,
    title: "New conversation",
    messageCount: 0,
  });

  res.json({ success: true, data: session });
};

exports.getStatus = async (req, res) => {
  const { isUserBlocked } = require("../services/escalationService");
  const blocked = req.user ? await isUserBlocked(req.user.id) : false;

  res.json({
    success: true,
    data: { blocked, userId: req.user?.id || null },
  });
};
