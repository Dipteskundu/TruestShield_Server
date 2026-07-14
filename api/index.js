require("dotenv").config();

const app = require("../src/app");
const connectDB = require("../src/config/db");

let dbConnected = false;
let serverlessHandler;

const REQUIRED_ENV = ["JWT_SECRET", "MONGODB_URI"];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

module.exports = async (req, res) => {
  try {
    validateEnv();

    if (!dbConnected) {
      await connectDB();
      dbConnected = true;
    }

    if (!serverlessHandler) {
      const serverless = require("serverless-http");
      serverlessHandler = serverless(app);
    }

    return serverlessHandler(req, res);
  } catch (err) {
    console.error("Serverless handler error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};
