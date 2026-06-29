const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");
const User = require("../models/User");
const ApiError = require("../utils/apiError");

exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");
  res.json({ success: true, data: user.toPublicJSON() });
};

exports.updateProfile = async (req, res) => {
  const { name, email } = req.body;
  const updates = {};

  if (name) updates.name = name;
  if (email) {
    const existing = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: req.user.id },
    });
    if (existing) throw new ApiError(409, "Email already in use");
    updates.email = email.toLowerCase();
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields to update");
  }

  const user = await User.findByIdAndUpdate(req.user.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) throw new ApiError(404, "User not found");
  res.json({ success: true, data: user.toPublicJSON() });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current and new password are required");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters");
  }

  const user = await User.findById(req.user.id).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  user.password = newPassword;
  await user.save();

  res.json({ success: true, message: "Password updated successfully" });
};

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

exports.getRemainingScans = async (req, res) => {
  const user = await User.findById(req.user.id).select("dailyScans lastScanReset plan");
  if (!user) {
    return res.json({ success: true, data: { text: 50, url: 30, image: 20 } });
  }

  const now = new Date();
  const lastReset = user.lastScanReset || now;
  const isNewDay =
    lastReset.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);

  const dailyScans = isNewDay
    ? { text: 0, url: 0, image: 0 }
    : user.dailyScans || { text: 0, url: 0, image: 0 };

  const limits = user.plan === "pro"
    ? { text: 100, url: 60, image: 40 }
    : { text: 50, url: 30, image: 20 };

  res.json({
    success: true,
    data: {
      text: Math.max(0, limits.text - dailyScans.text),
      url: Math.max(0, limits.url - dailyScans.url),
      image: Math.max(0, limits.image - dailyScans.image),
    },
  });
};
