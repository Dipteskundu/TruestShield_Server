const ScanResult = require("../models/ScanResult");
const Document = require("../models/Document");
const Clause = require("../models/Clause");
const ChatMessage = require("../models/ChatMessage");
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
  const user = await User.findById(req.user.id).select("plan weeklyCredits weekStart");
  if (!user) {
    return res.json({ success: true, data: { text: 20, url: 20, image: 20 } });
  }

  if (user.plan === "pro") {
    return res.json({
      success: true,
      data: { text: null, url: null, image: null },
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

  const remaining = Math.max(0, 20 - weeklyCredits);

  res.json({
    success: true,
    data: {
      text: remaining,
      url: remaining,
      image: remaining,
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

exports.getUsage = async (req, res) => {
  const user = await User.findById(req.user.id).select("plan weeklyCredits weekStart");
  if (!user) throw new ApiError(404, "User not found");

  const plan = user.plan || "free";
  const isPro = plan === "pro";

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

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
  const docsLimit = isPro ? null : 5;
  const docsRemaining = docsLimit !== null ? Math.max(0, docsLimit - docsUsedThisMonth) : null;

  const weeklyLimit = isPro ? null : 20;
  const weeklyRemaining = weeklyLimit !== null ? Math.max(0, weeklyLimit - weeklyCredits) : null;

  res.json({
    success: true,
    data: {
      plan,
      limits: {
        weeklyCredits: weeklyLimit,
        documents: docsLimit,
      },
      weekly: {
        used: weeklyCredits,
        limit: weeklyLimit,
        remaining: weeklyRemaining,
        ...weekly,
        total: weeklyTotal,
      },
      monthly: { ...monthly, total: monthlyScanTotal, documents: docsUsedThisMonth },
      allTime: { ...allTime, total: allTimeTotal, documents: allTimeDocCount },
      documents: {
        used: docsUsedThisMonth,
        limit: docsLimit,
        remaining: docsRemaining,
        note: docsLimit !== null ? "Monthly limit" : "Unlimited",
      },
      recentActivity,
    },
  });
};

exports.getActivity = async (req, res) => {
  const {
    type,
    verdict,
    dateFrom,
    dateTo,
    search,
    page = "1",
    limit = "20",
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * pageSize;

  const scanMatch = { userId: req.user.id };
  const docMatch = { userId: req.user.id };

  if (type) {
    if (type === "text") {
      scanMatch.type = { $in: ["email", "job", "message"] };
    } else if (["email", "job", "message", "url", "image"].includes(type)) {
      scanMatch.type = type;
    }
  }

  if (verdict) {
    scanMatch.verdict = verdict;
  }

  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    scanMatch.createdAt = dateFilter;
    docMatch.createdAt = dateFilter;
  }

  if (search) {
    const regex = { $regex: search, $options: "i" };
    scanMatch.input = regex;
    docMatch.fileName = regex;
  }

  const [scanResults, scanTotal] = await Promise.all([
    ScanResult.find(scanMatch)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize + 1)
      .select("type input verdict confidence reasons metadata createdAt"),
    ScanResult.countDocuments(scanMatch),
  ]);

  const [docResults, docTotal] = await Promise.all([
    Document.find(docMatch)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize + 1)
      .select("fileName documentType status overallRiskScore createdAt"),
    Document.countDocuments(docMatch),
  ]);

  const allItems = [
    ...scanResults.map((s) => ({
      id: s._id,
      category: "scan",
      type: s.type,
      label: s.type.charAt(0).toUpperCase() + s.type.slice(1) + " Scan",
      input: s.input ? s.input.slice(0, 200) : "",
      inputFull: s.input || "",
      verdict: s.verdict,
      confidence: s.confidence,
      reasons: s.reasons || [],
      metadata: s.metadata || {},
      date: s.createdAt,
    })),
    ...docResults.map((d) => ({
      id: d._id,
      category: "document",
      type: d.documentType,
      label: d.fileName,
      input: "",
      inputFull: "",
      verdict: d.overallRiskScore != null
        ? d.overallRiskScore > 60 ? "dangerous" : d.overallRiskScore > 30 ? "suspicious" : "safe"
        : null,
      confidence: d.overallRiskScore || 0,
      reasons: [],
      metadata: { documentType: d.documentType, status: d.status },
      date: d.createdAt,
    })),
  ];

  allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const hasMore = allItems.length > pageSize;
  const items = hasMore ? allItems.slice(0, pageSize) : allItems;
  const totalCount = scanTotal + docTotal;
  const totalPages = Math.ceil(totalCount / pageSize);

  res.json({
    success: true,
    data: {
      items,
      pagination: {
        page: pageNum,
        limit: pageSize,
        totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
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

exports.deleteAccount = async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new ApiError(400, "Password is required to delete your account");
  }

  const user = await User.findById(req.user.id).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, "Incorrect password");

  const userId = user._id;

  // Find all user documents to cascade-delete clauses
  const userDocuments = await Document.find({ userId }).select("_id");
  const docIds = userDocuments.map((d) => d._id);

  // Cascade delete related data
  await Promise.all([
    docIds.length > 0 ? Clause.deleteMany({ documentId: { $in: docIds } }) : Promise.resolve(),
    ChatMessage.deleteMany({ userId }),
    Document.deleteMany({ userId }),
    ScanResult.deleteMany({ userId }),
  ]);

  // Remove avatar from Cloudinary
  if (user.avatar?.publicId) {
    try {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    } catch {
      // Ignore deletion errors
    }
  }

  await User.findByIdAndDelete(userId);

  res.json({ success: true, message: "Account deleted permanently" });
};
