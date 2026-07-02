const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { maskKey } = require("../services/encryptionService");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    plan: {
      type: String,
      enum: ["free", "pro"],
      default: "free",
    },
    dailyScans: {
      text: { type: Number, default: 0 },
      url: { type: Number, default: 0 },
      image: { type: Number, default: 0 },
    },
    lastScanReset: { type: Date, default: Date.now },
    weeklyCredits: { type: Number, default: 0 },
    weekStart: { type: Date, default: null },
    avatar: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },
    aiPreferences: {
      provider: {
        type: String,
        enum: ["system", "anthropic", "openai", "gemini", "custom"],
        default: "system",
      },
      model: { type: String, default: null },
      customProviders: [
        {
          name: { type: String, required: true, trim: true },
          endpoint: { type: String, required: true, trim: true },
          apiKey: { type: String, required: true },
          model: { type: String, required: true, trim: true },
          isActive: { type: Boolean, default: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  const customProviders = (this.aiPreferences?.customProviders || []).map((p) => ({
    id: p._id,
    name: p.name,
    endpoint: p.endpoint,
    apiKey: maskKey(p.apiKey),
    model: p.model,
    isActive: p.isActive,
    createdAt: p.createdAt,
  }));

  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    plan: this.plan,
    avatar: this.avatar?.url || null,
    dailyScans: this.dailyScans,
    weeklyCredits: this.weeklyCredits,
    aiPreferences: {
      provider: this.aiPreferences?.provider || "system",
      model: this.aiPreferences?.model || null,
      customProviders,
    },
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", userSchema);
