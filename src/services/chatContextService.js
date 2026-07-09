const User = require("../models/User");
const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");

const PLAN_CREDITS = {
  free: { text: 50, url: 30, image: 20, documents: 5 },
  pro: { text: 100, url: 60, image: 40, documents: Infinity },
};

function computeCreditsRemaining(plan, dailyScans) {
  const limits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;
  return {
    textScans: Math.max(0, limits.text - (dailyScans?.text || 0)),
    urlScans: Math.max(0, limits.url - (dailyScans?.url || 0)),
    imageScans: Math.max(0, limits.image - (dailyScans?.image || 0)),
  };
}

async function buildUserContext(userId) {
  if (!userId) return null;

  const user = await User.findById(userId).select(
    "name plan createdAt dailyScans"
  );

  if (!user) return null;

  const [scanCount, docCount, recentActivity] = await Promise.all([
    ScanResult.countDocuments({ userId }),
    Document.countDocuments({ userId }),
    ScanResult.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("type verdict createdAt documentType")
      .lean(),
  ]);

  const creditsRemaining = computeCreditsRemaining(user.plan, user.dailyScans);

  return {
    user: {
      name: user.name.split(" ")[0],
      plan: user.plan,
      memberSince: user.createdAt,
      creditsUsed: {
        textScans: user.dailyScans?.text || 0,
        urlScans: user.dailyScans?.url || 0,
        imageScans: user.dailyScans?.image || 0,
      },
      creditsRemaining,
      totalScansAllTime: scanCount,
      totalDocumentsAllTime: docCount,
      recentActivity: recentActivity.map((s) => ({
        type: s.type,
        verdict: s.verdict,
        date: s.createdAt,
      })),
    },
  };
}

module.exports = { buildUserContext };
