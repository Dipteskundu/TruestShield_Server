const ScanResult = require("../models/ScanResult");
const User = require("../models/User");
const { analyzeText } = require("../services/aiService");
const { scanUrl } = require("../services/urlSafetyService");
const { analyzeImage } = require("../services/visionService");
const { hashInput, getCache, setCache } = require("../services/cacheService");
const { decrypt } = require("../services/encryptionService");
const ApiError = require("../utils/apiError");

async function scanText(req, res) {
  const { type, content } = req.validated.body;
  const cacheKey = `scan:text:${hashInput(`${type}:${content}`)}`;

  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  let userPreferences = null;
  if (req.user?.id) {
    const user = await User.findById(req.user.id).select("aiPreferences");
    if (user?.aiPreferences) {
      userPreferences = {
        provider: user.aiPreferences.provider,
        model: user.aiPreferences.model,
        customProvider: null,
        apiKey: null,
      };

      if (user.aiPreferences.provider === "custom" && user.aiPreferences.customProviders?.length > 0) {
        const activeProvider = user.aiPreferences.customProviders.find((p) => p.isActive);
        if (activeProvider) {
          userPreferences.customProvider = {
            endpoint: activeProvider.endpoint,
            apiKey: activeProvider.apiKey,
            model: activeProvider.model,
          };
        }
      } else if (user.aiPreferences.provider !== "system") {
        const providerKey = `${user.aiPreferences.provider.toUpperCase()}_API_KEY`;
        userPreferences.apiKey = process.env[providerKey] || null;
      }
    }
  }

  const result = await analyzeText(type, content, userPreferences);
  const saved = await ScanResult.create({
    userId: req.user?.id || null,
    type,
    input: content.slice(0, 5000),
    ...result,
  });

  const payload = {
    id: saved._id,
    type: saved.type,
    verdict: saved.verdict,
    confidence: saved.confidence,
    reasons: saved.reasons,
    shareToken: saved.shareToken,
    createdAt: saved.createdAt,
  };

  await setCache(cacheKey, payload);
  res.status(201).json({ success: true, data: payload });
}

async function scanUrlHandler(req, res) {
  const { url } = req.validated.body;
  const cacheKey = `scan:url:${hashInput(url)}`;

  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const result = await scanUrl(url);
  const saved = await ScanResult.create({
    userId: req.user?.id || null,
    type: "url",
    input: url,
    verdict: result.verdict,
    confidence: result.confidence,
    reasons: result.reasons,
    metadata: result.metadata,
  });

  const payload = {
    id: saved._id,
    type: "url",
    verdict: saved.verdict,
    confidence: saved.confidence,
    reasons: saved.reasons,
    metadata: saved.metadata,
    shareToken: saved.shareToken,
    createdAt: saved.createdAt,
  };

  await setCache(cacheKey, payload);
  res.status(201).json({ success: true, data: payload });
}

async function scanImage(req, res) {
  if (!req.file) {
    throw new ApiError(400, "Image file is required");
  }

  const result = await analyzeImage(req.file.buffer, req.file.mimetype);
  const saved = await ScanResult.create({
    userId: req.user?.id || null,
    type: "image",
    input: req.file.originalname,
    verdict: result.verdict,
    confidence: result.confidence,
    reasons: result.reasons,
    metadata: result.metadata,
  });

  res.status(201).json({
    success: true,
    data: {
      id: saved._id,
      type: "image",
      verdict: saved.verdict,
      confidence: saved.confidence,
      reasons: saved.reasons,
      shareToken: saved.shareToken,
      createdAt: saved.createdAt,
    },
  });
}

async function getCreditStatus(req, res) {
  const { module } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.json({
      success: true,
      data: { isGuest: true, limit: 2, module },
    });
  }

  const user = await User.findById(userId).select("plan weeklyCredits weekStart");
  if (!user) {
    return res.json({
      success: true,
      data: { isGuest: true, limit: 2, module },
    });
  }

  if (user.plan === "pro") {
    return res.json({
      success: true,
      data: { isPro: true, limit: null, module },
    });
  }

  const now = new Date();
  const day = now.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const currentMonday = new Date(now);
  currentMonday.setUTCDate(now.getUTCDate() - diff);
  currentMonday.setUTCHours(0, 0, 0, 0);

  let weeklyCredits = user.weeklyCredits || 0;
  if (!user.weekStart || user.weekStart < currentMonday) {
    weeklyCredits = 0;
  }

  res.json({
    success: true,
    data: {
      isGuest: false,
      plan: user.plan,
      used: weeklyCredits,
      limit: 20,
      remaining: Math.max(0, 20 - weeklyCredits),
      module,
    },
  });
}

async function getSharedResult(req, res) {
  const scan = await ScanResult.findOne({
    $or: [{ _id: req.params.id }, { shareToken: req.params.id }],
    expiresAt: { $gt: new Date() },
  });

  if (!scan) throw new ApiError(404, "Scan result not found or expired");

  res.json({
    success: true,
    data: {
      id: scan._id,
      type: scan.type,
      verdict: scan.verdict,
      confidence: scan.confidence,
      reasons: scan.reasons,
      createdAt: scan.createdAt,
    },
  });
}

module.exports = {
  scanText,
  scanUrl: scanUrlHandler,
  scanImage,
  getCreditStatus,
  getSharedResult,
};
