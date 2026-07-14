const axios = require("axios");
const { uploadBuffer } = require("./cloudinaryService");
const ApiError = require("../utils/apiError");

function parseSightengineResponse(data) {
  const aiProb = data?.ai_generated?.prob ?? 0;
  const manipulationProb = data?.manipulation?.prob ?? 0;
  const faces = data?.face ?? [];
  const hasFaces = Array.isArray(faces) ? faces.length > 0 : false;

  return { aiProb, manipulationProb, hasFaces };
}

function calculateVerdict(aiProb, manipulationProb) {
  if (aiProb > 0.8 || manipulationProb > 0.7) {
    return "dangerous";
  }
  if (aiProb > 0.5 || manipulationProb > 0.3) {
    return "suspicious";
  }
  return "safe";
}

function buildReasons(aiProb, manipulationProb, hasFaces) {
  const reasons = [];

  if (aiProb > 0.3) {
    reasons.push(
      `This image was likely AI-generated (${Math.round(aiProb * 100)}% probability)`
    );
  }

  if (manipulationProb > 0.1) {
    reasons.push(
      `Signs of digital manipulation detected (${Math.round(manipulationProb * 100)}% probability)`
    );
  }

  if (hasFaces) {
    reasons.push("Faces detected in image — possible facial manipulation");
  }

  if (reasons.length === 0) {
    reasons.push("No strong AI-generation signals detected");
  }

  return reasons;
}

function computeConfidence(verdict, score) {
  if (verdict === "dangerous") return Math.max(85, score);
  if (verdict === "suspicious") return Math.max(60, Math.min(80, score));
  return Math.max(70, score);
}

async function analyzeImage(buffer, mimetype) {
  if (!buffer) {
    throw new ApiError(400, "No image provided");
  }

  const cloudinaryResult = await uploadBuffer(buffer, "trustshield/scans", "image");

  if (cloudinaryResult.mode === "mock") {
    throw new ApiError(503, "Image upload service unavailable. Please try again later.");
  }

  const user = process.env.SIGHTENGINE_API_USER;
  const secret = process.env.SIGHTENGINE_API_SECRET;

  if (!user || !secret) {
    throw new ApiError(503, "Image analysis service not configured. Please contact support.");
  }

  try {
    const response = await axios.post(
      "https://api.sightengine.com/1.0/check.json",
      null,
      {
        params: {
          url: cloudinaryResult.secure_url,
          models: "genai,face",
          api_user: user,
          api_secret: secret,
        },
        timeout: 15000,
      }
    );

    const { aiProb, manipulationProb, hasFaces } = parseSightengineResponse(response.data);

    let score = 100;
    if (aiProb > 0.8) score -= 50;
    else if (aiProb > 0.5) score -= 25;
    if (manipulationProb > 0.5) score -= 30;
    else if (manipulationProb > 0.3) score -= 15;
    score = Math.max(0, Math.min(100, score));

    const verdict = calculateVerdict(aiProb, manipulationProb);
    const confidence = computeConfidence(verdict, score);
    const reasons = buildReasons(aiProb, manipulationProb, hasFaces);

    return {
      verdict,
      confidence,
      reasons,
      metadata: {
        aiGenerationProbability: aiProb,
        manipulationProbability: manipulationProb,
        faceDetection: hasFaces,
        cloudinaryPublicId: cloudinaryResult.public_id,
        rawResponse: response.data,
        mode: "live",
      },
    };
  } catch (error) {
    console.error("Sightengine API error:", error.message);
    return {
      verdict: "suspicious",
      confidence: 65,
      reasons: [
        "Image analysis service encountered an error",
        "Consider verifying the source before trusting this image",
      ],
      metadata: { mode: "fallback", error: error.message },
    };
  }
}

module.exports = { analyzeImage };
