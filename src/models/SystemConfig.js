const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "global" },
    rateLimits: {
      free: {
        text: { type: Number, default: 50, min: 1 },
        url: { type: Number, default: 30, min: 1 },
        image: { type: Number, default: 20, min: 1 },
      },
      pro: {
        text: { type: Number, default: 100, min: 1 },
        url: { type: Number, default: 60, min: 1 },
        image: { type: Number, default: 40, min: 1 },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
