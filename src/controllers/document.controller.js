const Document = require("../models/Document");
const Clause = require("../models/Clause");
const ChatMessage = require("../models/ChatMessage");
const DocumentTreeNode = require("../models/DocumentTreeNode");
const DocumentChatSession = require("../models/DocumentChatSession");
const DocumentChatMessage = require("../models/DocumentChatMessage");
const ApiError = require("../utils/apiError");
const {
  extractTextFromPdf,
  smartChunkClauses,
} = require("../services/pdfService");
const {
  analyzeClauses,
  aggregateDocumentAnalysis,
} = require("../services/aiService");
const { constructDocumentTree } = require("../services/treeService");
const { answerDocumentQuery } = require("../services/navigationService");
const { uploadBuffer } = require("../services/cloudinaryService");

const VALID_AUTO_DELETE_DAYS = [1, 7, 30, 90, 365];

async function processDocument(documentId, rawText, documentType, pdfBuffer) {
  try {
    const clauses = await smartChunkClauses(rawText, documentType);
    const analyzed = await analyzeClauses(clauses, documentType);

    await Promise.all(
      analyzed.map(async (clause) => {
        return Clause.create({
          documentId,
          ...clause,
        });
      })
    );

    const allClauseDocs = await Clause.find({ documentId });

    const allMissingProtections = [
      ...new Set(allClauseDocs.flatMap((c) => c.missingProtections || [])),
    ];

    const aggregation = await aggregateDocumentAnalysis(
      allClauseDocs,
      documentType
    );

    await Document.findByIdAndUpdate(documentId, {
      status: "ready",
      overallRiskScore: aggregation.overallRiskScore,
      executiveSummary: aggregation.executiveSummary,
      glossary: aggregation.glossary,
      missingProtections: allMissingProtections,
    });

    if (pdfBuffer) {
      try {
        await constructDocumentTree(documentId, pdfBuffer, documentType);
      } catch (treeError) {
        console.error("Tree construction failed:", treeError);
        await Document.findByIdAndUpdate(documentId, {
          treeError: treeError.message,
        });
      }
    }
  } catch (error) {
    console.error("Document processing failed:", error);
    try {
      await Document.findByIdAndUpdate(documentId, { status: "failed" });
    } catch (updateError) {
      console.error("Failed to mark document as failed:", updateError);
    }
  }
}

exports.upload = async (req, res) => {
  const {
    documentType = "other",
    text,
    fileName,
    autoDeleteDays,
  } = req.validated.body;
  let rawText = text || "";
  let resolvedFileName = fileName || "Pasted Text";
  let pdfBuffer = null;

  if (req.file) {
    if (req.file.mimetype === "application/pdf") {
      pdfBuffer = req.file.buffer;
      rawText = await extractTextFromPdf(req.file.buffer);
      resolvedFileName = req.file.originalname;
      await uploadBuffer(req.file.buffer, "trustshield/documents", "raw");
    } else {
      throw new ApiError(400, "Only PDF files are supported for document upload");
    }
  }

  if (!rawText || rawText.length < 50) {
    throw new ApiError(400, "Document text must be at least 50 characters");
  }

  const docData = {
    userId: req.user.id,
    fileName: resolvedFileName,
    documentType,
    rawText: rawText.slice(0, 50000),
    status: "processing",
  };

  if (autoDeleteDays && VALID_AUTO_DELETE_DAYS.includes(autoDeleteDays)) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + autoDeleteDays);
    docData.expiresAt = expiresAt;
  }

  const document = await Document.create(docData);

  processDocument(document._id, rawText, documentType, pdfBuffer);

  res.status(202).json({
    success: true,
    data: {
      id: document._id,
      fileName: document.fileName,
      documentType: document.documentType,
      status: document.status,
      creditsUsed: req.creditCount,
    },
  });
};

exports.getById = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");

  const clauses = await Clause.find({ documentId: document._id }).sort({
    clauseIndex: 1,
  });

  res.json({
    success: true,
    data: { document, clauses },
  });
};

exports.getStatus = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  }).select(
    "status overallRiskScore executiveSummary glossary missingProtections treeBuilt treeError"
  );

  if (!document) throw new ApiError(404, "Document not found");

  res.json({ success: true, data: document });
};

exports.list = async (req, res) => {
  const documents = await Document.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .select(
      "fileName documentType status overallRiskScore createdAt treeBuilt"
    );

  res.json({
    success: true,
    data: documents.map((d) => ({
      id: d._id,
      fileName: d.fileName,
      documentType: d.documentType,
      status: d.status,
      overallRiskScore: d.overallRiskScore,
      createdAt: d.createdAt,
      treeBuilt: d.treeBuilt,
    })),
  });
};

exports.chat = async (req, res) => {
  const { question } = req.validated.body;
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");
  if (document.status !== "ready") {
    throw new ApiError(400, "Document is still processing");
  }

  const allClauses = await Clause.find({ documentId: document._id });

  const { answer, citedClauseIds } = await require("../services/aiService").answerDocumentQuestion(
    question,
    allClauses,
    document.documentType
  );

  await ChatMessage.create({
    documentId: document._id,
    userId: req.user.id,
    role: "user",
    content: question,
  });

  const assistantMessage = await ChatMessage.create({
    documentId: document._id,
    userId: req.user.id,
    role: "assistant",
    content: answer,
    citedClauseIds,
  });

  res.json({
    success: true,
    data: {
      answer: assistantMessage.content,
      citedClauseIds: assistantMessage.citedClauseIds,
    },
  });
};

exports.getChatHistory = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");

  const { before, limit = 50 } = req.query;
  const query = { documentId: document._id, userId: req.user.id };

  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .select("role content citedClauseIds createdAt");

  res.json({
    success: true,
    data: messages.reverse(),
  });
};

exports.getDocumentTree = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const document = await Document.findOne({ _id: id, userId });
  if (!document) throw new ApiError(404, "Document not found");
  if (!document.treeBuilt) throw new ApiError(202, "Tree is still being built");

  const nodes = await DocumentTreeNode.find({ documentId: id })
    .select("-content")
    .sort({ level: 1, pageStart: 1 })
    .lean();

  function buildNested(nodes, parentId = null) {
    return nodes
      .filter((n) => n.parentId === parentId)
      .map((n) => ({
        ...n,
        children: buildNested(nodes, n.nodeId),
      }));
  }

  res.json({
    success: true,
    tree: buildNested(nodes),
    flat: nodes,
    nodeCount: document.nodeCount,
    leafCount: document.leafCount,
  });
};

exports.sendDocumentChatMessage = async (req, res) => {
  const { id } = req.params;
  const { message, sessionId } = req.validated?.body || req.body;
  const userId = req.user.id;

  const document = await Document.findOne({ _id: id, userId });
  if (!document) throw new ApiError(404, "Document not found");
  if (!document.treeBuilt) throw new ApiError(400, "Document tree is not ready yet");

  let session;
  if (sessionId) {
    session = await DocumentChatSession.findOne({
      _id: sessionId,
      userId,
      documentId: id,
    });
    if (!session) throw new ApiError(404, "Session not found");
  } else {
    session = await DocumentChatSession.create({
      documentId: id,
      userId,
      title: message.slice(0, 60),
    });
  }

  const history = await DocumentChatMessage.find({ sessionId: session._id })
    .sort({ createdAt: 1 })
    .select("role content")
    .lean();

  await DocumentChatMessage.create({
    sessionId: session._id,
    documentId: id,
    userId,
    role: "user",
    content: message,
  });

  const result = await answerDocumentQuery(
    message,
    id,
    history,
    document.documentType
  );

  await DocumentChatMessage.create({
    sessionId: session._id,
    documentId: id,
    userId,
    role: "assistant",
    content: result.answer,
    citedNodeIds: result.citedNodeIds,
    citedNodes: result.citedNodes,
    navigationReasoning: result.navigationReasoning,
    confidence: result.confidence,
    nodesFound: result.nodesFound,
  });

  await DocumentChatSession.findByIdAndUpdate(session._id, {
    lastMessageAt: new Date(),
    $inc: { messageCount: 2 },
    lastMessagePreview: result.answer.slice(0, 80),
  });

  res.json({
    success: true,
    sessionId: session._id,
    answer: result.answer,
    citedNodes: result.citedNodes,
    confidence: result.confidence,
    nodesFound: result.nodesFound,
  });
};

exports.getChatSessions = async (req, res) => {
  const { id } = req.params;
  const sessions = await DocumentChatSession.find({
    documentId: id,
    userId: req.user.id,
  }).sort({ lastMessageAt: -1 });

  res.json({ success: true, sessions });
};

exports.getChatSession = async (req, res) => {
  const { id, sessionId } = req.params;
  const messages = await DocumentChatMessage.find({
    sessionId,
    documentId: id,
    userId: req.user.id,
  }).sort({ createdAt: 1 });

  res.json({ success: true, messages });
};

exports.deleteChatSession = async (req, res) => {
  const { id, sessionId } = req.params;
  const session = await DocumentChatSession.findOne({
    _id: sessionId,
    documentId: id,
    userId: req.user.id,
  });
  if (!session) throw new ApiError(404, "Session not found");
  await DocumentChatMessage.deleteMany({ sessionId });
  await DocumentChatSession.findByIdAndDelete(sessionId);
  res.json({ success: true });
};

exports.share = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");

  let shareToken = document.shareToken;
  if (!shareToken) {
    const crypto = require("crypto");
    shareToken = crypto.randomBytes(32).toString("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const updated = await Document.findByIdAndUpdate(
      document._id,
      { shareToken, expiresAt },
      { new: true }
    );

    return res.json({
      success: true,
      data: {
        shareToken: updated.shareToken,
        shareUrl: `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/result/${updated.shareToken}`,
        expiresAt: updated.expiresAt,
      },
    });
  }

  res.json({
    success: true,
    data: {
      shareToken,
      shareUrl: `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/result/${shareToken}`,
      expiresAt: document.expiresAt,
    },
  });
};

exports.getPublicByToken = async (req, res) => {
  const document = await Document.findOne({
    shareToken: req.params.token,
    status: "ready",
  }).select(
    "fileName documentType overallRiskScore executiveSummary glossary createdAt"
  );

  if (!document) throw new ApiError(404, "Document not found or not shared");

  const clauses = await Clause.find({ documentId: document._id })
    .sort({ clauseIndex: 1 })
    .select("clauseIndex originalText plainExplanation riskLevel riskReason");

  res.json({
    success: true,
    data: { document, clauses },
  });
};

exports.updateAutoDelete = async (req, res) => {
  const { days } = req.body;

  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");

  let expiresAt = null;
  if (days !== null && days !== undefined) {
    if (!VALID_AUTO_DELETE_DAYS.includes(days)) {
      throw new ApiError(
        400,
        `Invalid auto-delete duration. Allowed: ${VALID_AUTO_DELETE_DAYS.join(
          ", "
        )}, or null to disable.`
      );
    }
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
  }

  await Document.findByIdAndUpdate(document._id, { expiresAt });

  res.json({
    success: true,
    data: {
      expiresAt,
      autoDeleteDays: days || null,
    },
  });
};
