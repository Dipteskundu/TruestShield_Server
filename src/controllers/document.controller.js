const Document = require("../models/Document");
const Clause = require("../models/Clause");
const ChatMessage = require("../models/ChatMessage");
const ApiError = require("../utils/apiError");
const { extractTextFromPdf, chunkByClauses } = require("../services/pdfService");
const { analyzeClauses } = require("../services/aiService");
const { generateEmbedding } = require("../services/embeddingService");
const { uploadBuffer } = require("../services/cloudinaryService");

async function processDocument(documentId, rawText, documentType) {
  try {
    const clauses = chunkByClauses(rawText);
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

    const highRiskCount = clauseDocs.filter((c) => c.riskLevel === "high").length;
    const overallRiskScore = Math.min(
      100,
      Math.round((highRiskCount / Math.max(clauseDocs.length, 1)) * 100)
    );

    await Document.findByIdAndUpdate(documentId, {
      status: "ready",
      overallRiskScore,
      executiveSummary: `This ${documentType} document contains ${clauseDocs.length} analyzed clauses. ${highRiskCount} clause(s) flagged as high risk. TrustShield is not legal advice — consult a qualified attorney for binding decisions.`,
    });
  } catch {
    await Document.findByIdAndUpdate(documentId, { status: "failed" });
  }
}

exports.upload = async (req, res) => {
  const { documentType = "other", text, fileName } = req.validated.body;
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

  const document = await Document.create({
    userId: req.user.id,
    fileName: resolvedFileName,
    documentType,
    rawText: rawText.slice(0, 50000),
    status: "processing",
  });

  processDocument(document._id, rawText, documentType);

  res.status(202).json({
    success: true,
    data: {
      id: document._id,
      fileName: document.fileName,
      documentType: document.documentType,
      status: document.status,
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
  }).select("status overallRiskScore executiveSummary");

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

  const clauses = await Clause.find({ documentId: document._id }).limit(10);
  const { answerDocumentQuestion } = require("../services/aiService");
  const { answer, citedClauseIds } = await answerDocumentQuestion(
    question,
    clauses
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
