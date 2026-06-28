const ScanResult = require("../models/ScanResult");
const { analyzeText } = require("../services/aiService");
const { scanUrl } = require("../services/urlSafetyService");
const { analyzeImage } = require("../services/visionService");
const { hashInput, getCache, setCache } = require("../services/cacheService");
const ApiError = require("../utils/apiError");

exports.scanText = async (req, res) => {
  const { type, content } = req.validated.body;
  const cacheKey = `scan:text:${hashInput(`${type}:${content}`)}`;

  const cached = await getCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const result = await analyzeText(type, content);
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
};

exports.scanUrl = async (req, res) => {
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
};

exports.scanImage = async (req, res) => {
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
};

exports.getSharedResult = async (req, res) => {
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
};
