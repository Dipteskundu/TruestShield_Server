const Document = require("../models/Document");
const Clause = require("../models/Clause");
const ChatMessage = require("../models/ChatMessage");
const ApiError = require("../utils/apiError");
const { extractTextFromPdf, smartChunkClauses } = require("../services/pdfService");
const { analyzeClauses, aggregateDocumentAnalysis, answerDocumentQuestion } = require("../services/aiService");
const { generateEmbedding } = require("../services/embeddingService");
const { uploadBuffer } = require("../services/cloudinaryService");
const { findRelevantClauses } = require("../utils/vectorSearch");

const VALID_AUTO_DELETE_DAYS = [1, 7, 30, 90, 365];

async function processDocument(documentId, rawText, documentType) {
  try {
    const clauses = await smartChunkClauses(rawText, documentType);
    const analyzed = await analyzeClauses(clauses, documentType);

    const clauseDocs = await Promise.all(
      analyzed.map(async (clause) => {
        const embedding = await generateEmbedding(clause.originalText);
        return Clause.create({
          documentId,
          ...clause,
          embedding,
        });
      })
    );

    const allMissingProtections = [
      ...new Set(clauseDocs.flatMap((c) => c.missingProtections || [])),
    ];

    const aggregation = await aggregateDocumentAnalysis(clauseDocs, documentType);

    await Document.findByIdAndUpdate(documentId, {
      status: "ready",
      overallRiskScore: aggregation.overallRiskScore,
      executiveSummary: aggregation.executiveSummary,
      glossary: aggregation.glossary,
      missingProtections: allMissingProtections,
    });
  } catch (error) {
    console.error("Document processing failed:", error);
    await Document.findByIdAndUpdate(documentId, { status: "failed" });
  }
}

exports.upload = async (req, res) => {
  const { documentType = "other", text, fileName, autoDeleteDays } = req.validated.body;
  let rawText = text || "";
  let resolvedFileName = fileName || "Pasted Text";

  if (req.file) {
    if (req.file.mimetype === "application/pdf") {
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

  processDocument(document._id, rawText, documentType);

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
  }).select("status overallRiskScore executiveSummary glossary missingProtections");

  if (!document) throw new ApiError(404, "Document not found");

  res.json({ success: true, data: document });
};

exports.list = async (req, res) => {
  const documents = await Document.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .select("fileName documentType status overallRiskScore createdAt");

  res.json({
    success: true,
    data: documents.map((d) => ({
      id: d._id,
      fileName: d.fileName,
      documentType: d.documentType,
      status: d.status,
      overallRiskScore: d.overallRiskScore,
      createdAt: d.createdAt,
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

  let relevantClauses = allClauses;
  try {
    const questionEmbedding = await generateEmbedding(question);
    const topK = allClauses.length <= 5 ? allClauses.length : 5;
    relevantClauses = findRelevantClauses(questionEmbedding, allClauses, topK);
  } catch {
    // Fallback: send all clauses if embedding fails
  }

  const { answer, citedClauseIds } = await answerDocumentQuestion(
    question,
    relevantClauses,
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

    await Document.findByIdAndUpdate(document._id, {
      shareToken,
      expiresAt,
    });
  }

  res.json({
    success: true,
    data: {
      shareToken,
      shareUrl: `${process.env.FRONTEND_URL || "http://localhost:3000"}/result/${shareToken}`,
      expiresAt: document.expiresAt,
    },
  });
};

exports.getPublicByToken = async (req, res) => {
  const document = await Document.findOne({
    shareToken: req.params.token,
    status: "ready",
  }).select("fileName documentType overallRiskScore executiveSummary glossary createdAt");

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
      throw new ApiError(400, `Invalid auto-delete duration. Allowed: ${VALID_AUTO_DELETE_DAYS.join(", ")}, or null to disable.`);
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
