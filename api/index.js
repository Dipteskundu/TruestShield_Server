require("dotenv").config();

const app = require("../src/app");
const connectDB = require("../src/config/db");

let dbConnected = false;
let dbConnecting = null;
let serverlessHandler;

const REQUIRED_ENV = ["JWT_SECRET", "MONGODB_URI"];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

async function ensureDbConnected() {
  if (dbConnected) return;

  // Prevent multiple concurrent connection attempts during cold start
  if (!dbConnecting) {
    dbConnecting = connectDB()
      .then(() => {
        dbConnected = true;
        dbConnecting = null;
      })
      .catch((err) => {
        dbConnecting = null;
        throw err;
      });
  }

  return dbConnecting;
}

module.exports = async (req, res) => {
  try {
    validateEnv();
    await ensureDbConnected();

    if (!serverlessHandler) {
      const serverless = require("serverless-http");
      serverlessHandler = serverless(app);
    }

    return serverlessHandler(req, res);
  } catch (err) {
    console.error("Serverless handler error:", err);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message || "Internal server error",
    });
  }
};
