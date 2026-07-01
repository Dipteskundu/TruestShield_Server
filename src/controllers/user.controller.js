const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");
const User = require("../models/User");
const ApiError = require("../utils/apiError");
const { encrypt, maskKey } = require("../services/encryptionService");
const { testProviderConnection, getAvailableProviders } = require("../services/aiProviderService");
const { uploadBuffer } = require("../services/cloudinaryService");
const { cloudinary } = require("../config/cloudinary");

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

exports.uploadAvatar = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Please upload an image file");
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (user.avatar?.publicId) {
    try {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    } catch {
      // Ignore deletion errors
    }
  }

  const result = await uploadBuffer(req.file.buffer, "trustshield/avatars", "image");

  if (!result.secure_url) {
    throw new ApiError(500, "Failed to upload avatar");
  }

  user.avatar = {
    url: result.secure_url,
    publicId: result.public_id,
  };

  await user.save();

  res.json({
    success: true,
    data: { avatar: user.avatar.url },
  });
};

exports.removeAvatar = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (user.avatar?.publicId) {
    try {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    } catch {
      // Ignore deletion errors
    }
  }

  user.avatar = { url: null, publicId: null };
  await user.save();

  res.json({ success: true, message: "Avatar removed" });
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

exports.getAISettings = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  const providers = getAvailableProviders();
  const customProviders = (user.aiPreferences?.customProviders || []).map((p) => ({
    id: p._id,
    name: p.name,
    endpoint: p.endpoint,
    apiKey: maskKey(p.apiKey),
    model: p.model,
    isActive: p.isActive,
    createdAt: p.createdAt,
  }));

  res.json({
    success: true,
    data: {
      provider: user.aiPreferences?.provider || "system",
      model: user.aiPreferences?.model || null,
      customProviders,
      availableProviders: providers,
    },
  });
};

exports.updateAISettings = async (req, res) => {
  const { provider, model } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      "aiPreferences.provider": provider,
      "aiPreferences.model": model || null,
    },
    { new: true, runValidators: true }
  );

  if (!user) throw new ApiError(404, "User not found");

  res.json({
    success: true,
    data: {
      provider: user.aiPreferences.provider,
      model: user.aiPreferences.model,
    },
  });
};

exports.addCustomProvider = async (req, res) => {
  const { name, endpoint, apiKey, model } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (!user.aiPreferences) {
    user.aiPreferences = { provider: "system", model: null, customProviders: [] };
  }

  if (!user.aiPreferences.customProviders) {
    user.aiPreferences.customProviders = [];
  }

  const MAX_CUSTOM_PROVIDERS = user.plan === "pro" ? 10 : 3;
  if (user.aiPreferences.customProviders.length >= MAX_CUSTOM_PROVIDERS) {
    throw new ApiError(400, `Maximum ${MAX_CUSTOM_PROVIDERS} custom providers allowed. Upgrade to Pro for more.`);
  }

  const encryptedApiKey = encrypt(apiKey);

  user.aiPreferences.customProviders.push({
    name,
    endpoint,
    apiKey: encryptedApiKey,
    model,
    isActive: true,
  });

  await user.save();

  const newProvider = user.aiPreferences.customProviders[user.aiPreferences.customProviders.length - 1];

  res.status(201).json({
    success: true,
    data: {
      id: newProvider._id,
      name: newProvider.name,
      endpoint: newProvider.endpoint,
      apiKey: maskKey(apiKey),
      model: newProvider.model,
      isActive: newProvider.isActive,
      createdAt: newProvider.createdAt,
    },
  });
};

exports.removeCustomProvider = async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  const providerIndex = user.aiPreferences?.customProviders?.findIndex(
    (p) => p._id.toString() === id
  );

  if (providerIndex === undefined || providerIndex === -1) {
    throw new ApiError(404, "Custom provider not found");
  }

  user.aiPreferences.customProviders.splice(providerIndex, 1);
  await user.save();

  res.json({ success: true, message: "Custom provider removed" });
};

const PLAN_LIMITS = {
  free: { text: 50, url: 30, image: 20, documents: 5 },
  pro: { text: 100, url: 60, image: 40, documents: Infinity },
};

exports.getUsage = async (req, res) => {
  const user = await User.findById(req.user.id).select("plan dailyScans lastScanReset");
  if (!user) throw new ApiError(404, "User not found");

  const plan = user.plan || "free";
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const lastReset = user.lastScanReset || now;
  const isNewDay = lastReset.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
  const dailyScans = isNewDay
    ? { text: 0, url: 0, image: 0 }
    : user.dailyScans || { text: 0, url: 0, image: 0 };

  const [weeklyScans, monthlyScans, allTimeScans, recentScans, recentDocs, monthlyDocCount, allTimeDocCount] =
    await Promise.all([
      ScanResult.aggregate([
        { $match: { userId: user._id, createdAt: { $gte: weekAgo } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      ScanResult.aggregate([
        { $match: { userId: user._id, createdAt: { $gte: monthAgo } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      ScanResult.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      ScanResult.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("type verdict confidence createdAt"),
      Document.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .select("fileName documentType status overallRiskScore createdAt"),
      Document.countDocuments({
        userId: user._id,
        createdAt: { $gte: monthAgo },
      }),
      Document.countDocuments({ userId: user._id }),
    ]);

  const aggregateByType = (results) => {
    const map = { text: 0, url: 0, image: 0 };
    results.forEach((r) => {
      const key = r._id === "email" || r._id === "job" || r._id === "message" ? "text" : r._id;
      if (key in map) map[key] += r.count;
    });
    return map;
  };

  const weekly = aggregateByType(weeklyScans);
  const monthly = aggregateByType(monthlyScans);
  const allTime = aggregateByType(allTimeScans);

  const weeklyTotal = weekly.text + weekly.url + weekly.image;
  const monthlyScanTotal = monthly.text + monthly.url + monthly.image;
  const allTimeTotal = allTime.text + allTime.url + allTime.image;

  const recentActivity = [
    ...recentScans.map((s) => ({
      id: s._id,
      category: "scan",
      type: s.type,
      detail: s.type.charAt(0).toUpperCase() + s.type.slice(1) + " scan",
      verdict: s.verdict,
      confidence: s.confidence,
      date: s.createdAt,
    })),
    ...recentDocs.map((d) => ({
      id: d._id,
      category: "document",
      type: d.documentType,
      detail: d.fileName,
      verdict: d.overallRiskScore != null
        ? d.overallRiskScore > 60 ? "dangerous" : d.overallRiskScore > 30 ? "suspicious" : "safe"
        : null,
      status: d.status,
      date: d.createdAt,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const docsUsedThisMonth = monthlyDocCount;
  const docsLimit = limits.documents === Infinity ? null : limits.documents;
  const docsRemaining = docsLimit !== null ? Math.max(0, docsLimit - docsUsedThisMonth) : null;

  res.json({
    success: true,
    data: {
      plan,
      limits: {
        text: limits.text,
        url: limits.url,
        image: limits.image,
        documents: docsLimit,
      },
      daily: {
        text: { used: dailyScans.text, limit: limits.text, remaining: Math.max(0, limits.text - dailyScans.text) },
        url: { used: dailyScans.url, limit: limits.url, remaining: Math.max(0, limits.url - dailyScans.url) },
        image: { used: dailyScans.image, limit: limits.image, remaining: Math.max(0, limits.image - dailyScans.image) },
        documents: {
          used: docsUsedThisMonth,
          limit: docsLimit,
          remaining: docsRemaining,
          note: docsLimit !== null ? "Monthly limit" : "Unlimited",
        },
      },
      weekly: { ...weekly, total: weeklyTotal },
      monthly: { ...monthly, total: monthlyScanTotal, documents: docsUsedThisMonth },
      allTime: { ...allTime, total: allTimeTotal, documents: allTimeDocCount },
      recentActivity,
    },
  });
};

exports.testProvider = async (req, res) => {
  const { provider, endpoint, apiKey, model } = req.body;

  const result = await testProviderConnection(provider, endpoint, apiKey, model);

  if (!result.success) {
    throw new ApiError(400, result.message);
  }

  res.json({
    success: true,
    data: {
      message: result.message,
      responsePreview: result.responsePreview,
    },
  });
};
