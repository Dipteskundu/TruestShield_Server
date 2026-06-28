const User = require("../models/User");
const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");

exports.getStats = async (_req, res) => {
  const [users, scans, documents] = await Promise.all([
    User.countDocuments(),
    ScanResult.countDocuments(),
    Document.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      totalUsers: users,
      totalScans: scans,
      totalDocuments: documents,
    },
  });
};

exports.getUsers = async (_req, res) => {
  const users = await User.find()
    .select("name email role plan dailyScans createdAt")
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({ success: true, data: users });
};

exports.getRecentScans = async (_req, res) => {
  const scans = await ScanResult.find()
    .sort({ createdAt: -1 })
    .limit(50)
    .select("type verdict confidence createdAt userId");

  res.json({ success: true, data: scans });
};
