const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const ApiError = require("./utils/apiError");
const errorHandler = require("./middleware/error.middleware");

const authRoutes = require("./routes/auth.routes");
const scanRoutes = require("./routes/scan.routes");
const documentRoutes = require("./routes/document.routes");
const userRoutes = require("./routes/user.routes");
const adminRoutes = require("./routes/admin.routes");
const chatbotRoutes = require("./routes/chatbot.routes");
const adminChatbotRoutes = require("./routes/adminChatbot.routes");

const app = express();

// CORS — in production restrict to FRONTEND_URL; in development allow all
app.use(cors({
  origin: process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL || true
    : true,
  credentials: true,
}));

app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Root route — prevents 404 noise in logs for GET / and GET /favicon.ico
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "trustshield-api", version: "1.0.0" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "trustshield-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/scan", scanRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/admin/chatbot", adminChatbotRoutes);

app.use((_req, _res, next) => {
  next(new ApiError(404, "Route not found"));
});

app.use(errorHandler);

module.exports = app;
