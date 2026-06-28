const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");

exports.getHistory = async (req, res) => {
  const { module: moduleFilter } = req.query;

  const scanQuery = { userId: req.user.id };
  if (moduleFilter && moduleFilter !== "document") {
    scanQuery.type = moduleFilter;
  }

  const [scans, documents] = await Promise.all([
    moduleFilter === "document"
      ? []
      : ScanResult.find(scanQuery).sort({ createdAt: -1 }).limit(50),
    moduleFilter && moduleFilter !== "document"
      ? []
      : Document.find({ userId: req.user.id })
          .sort({ createdAt: -1 })
          .limit(50)
          .select("fileName documentType status overallRiskScore createdAt"),
  ]);

  res.json({
    success: true,
    data: {
      scans: scans.map((s) => ({
        id: s._id,
        module: "scan",
        type: s.type,
        verdict: s.verdict,
        confidence: s.confidence,
        createdAt: s.createdAt,
      })),
      documents: documents.map((d) => ({
        id: d._id,
        module: "document",
        fileName: d.fileName,
        documentType: d.documentType,
        status: d.status,
        overallRiskScore: d.overallRiskScore,
        createdAt: d.createdAt,
      })),
    },
  });
};

exports.getStats = async (req, res) => {
  const userId = req.user.id;

  const [scanCount, documentCount, dangerousScans] = await Promise.all([
    ScanResult.countDocuments({ userId }),
    Document.countDocuments({ userId }),
    ScanResult.countDocuments({ userId, verdict: "dangerous" }),
  ]);

  res.json({
    success: true,
    data: {
      totalScans: scanCount,
      documentsAnalyzed: documentCount,
      fraudCaught: dangerousScans,
    },
  });
};
