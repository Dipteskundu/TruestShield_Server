const Document = require("../models/Document");
const Clause = require("../models/Clause");
const ApiError = require("../utils/apiError");

exports.exportReport = async (req, res) => {
  const document = await Document.findOne({
    _id: req.params.id,
    userId: req.user.id,
  });

  if (!document) throw new ApiError(404, "Document not found");
  if (document.status !== "ready") {
    throw new ApiError(400, "Document is not ready for export");
  }

  const clauses = await Clause.find({ documentId: document._id }).sort({
    clauseIndex: 1,
  });

  const report = {
    title: `TrustShield Report — ${document.fileName}`,
    disclaimer:
      "TrustShield is not legal advice. It is a legal literacy tool. Consult a qualified attorney for binding decisions.",
    executiveSummary: document.executiveSummary,
    overallRiskScore: document.overallRiskScore,
    missingProtections: document.missingProtections || [],
    glossary: document.glossary || [],
    clauses: clauses.map((c) => ({
      index: c.clauseIndex,
      originalText: c.originalText,
      plainExplanation: c.plainExplanation,
      riskLevel: c.riskLevel,
      riskReason: c.riskReason,
      keyTerms: c.keyTerms || [],
      missingProtections: c.missingProtections || [],
    })),
    generatedAt: new Date().toISOString(),
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="trustshield-report-${document._id}.json"`
  );
  res.json(report);
};
