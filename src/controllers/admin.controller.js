const User = require("../models/User");
const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");
const SystemConfig = require("../models/SystemConfig");
const { deleteCache } = require("../services/cacheService");

const DEFAULT_RATE_LIMITS = {
  free: { text: 50, url: 30, image: 20 },
  pro: { text: 100, url: 60, image: 40 },
};

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

exports.getRateLimits = async (_req, res) => {
  const config = await SystemConfig.findById("global");
  const limits = config?.rateLimits || DEFAULT_RATE_LIMITS;

  res.json({ success: true, data: limits });
};

exports.updateRateLimits = async (req, res) => {
  const { free, pro } = req.validated?.body || req.body;

  const config = await SystemConfig.findByIdAndUpdate(
    "global",
    { rateLimits: { free, pro } },
    { new: true, upsert: true, runValidators: true }
  );

  await deleteCache("config:rateLimits");

  res.json({ success: true, data: config.rateLimits });
};
