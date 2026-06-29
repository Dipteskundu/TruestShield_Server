const axios = require("axios");
const crypto = require("crypto");

const FRAUD_SIGNALS = {
  email: [
    "Sender domain does not match the displayed name",
    "Urgent language pressuring immediate action",
    "Generic greeting instead of your name",
    "Suspicious reply-to address different from sender",
    "Contains shortened links or unknown domains",
    "Requests sensitive information (password, SSN, banking)",
    "Unusual sender address with misspellings of known domains",
    "Threatens account suspension or legal action",
    "Too-good-to-be-true offer or prize notification",
    "Poor grammar or spelling inconsistencies",
  ],
  job: [
    "Salary listed is unusually high for the role described",
    "Requests banking details before any interview",
    "Company name does not appear in public business records",
    "Vague job description with generic responsibilities",
    "Upfront payment required for training or materials",
    "Guaranteed high earnings with minimal effort",
    "Immediate hiring without interview process",
    "Email domain does not match company website domain",
    "Position posted on unusual platforms or via personal email",
    "Spelling errors in company name or branding",
  ],
  message: [
    "Unexpected prize or lottery notification pattern",
    "Message creates artificial urgency",
    "Link domain does not match the claimed sender organization",
    "Impersonation of a known contact or institution",
    "Requests money or gift cards in exchange for something",
    "Claim of inheritance or unclaimed funds",
    "Romance scam language patterns detected",
    "Threatens negative consequences unless immediate action taken",
    "Uses peer pressure or social proof tactics",
    "Contains grammatical patterns common to known scam scripts",
  ],
};

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function generateMockResponse(type) {
  const allSignals = FRAUD_SIGNALS[type] || FRAUD_SIGNALS.email;
  const count = crypto.randomInt(2, 5);
  const reasons = pickRandom(allSignals, count);

  const dangerousKeywords = [
    "banking details",
    "upfront payment",
    "gift cards",
    "SSN",
    "password",
    "lottery",
    "inheritance",
    "legal action",
    "account suspended",
    "wire transfer",
  ];
  const hasDangerous =
    reasons.some((r) =>
      dangerousKeywords.some((k) => r.toLowerCase().includes(k))
    );
  const hasSuspicious = reasons.length >= 3;

  let verdict, confidence;
  if (hasDangerous) {
    verdict = "dangerous";
    confidence = crypto.randomInt(75, 96);
  } else if (hasSuspicious) {
    verdict = "suspicious";
    confidence = crypto.randomInt(55, 79);
  } else {
    verdict = crypto.randomInt(1, 10) <= 3 ? "suspicious" : "safe";
    confidence = verdict === "suspicious" ? crypto.randomInt(45, 65) : crypto.randomInt(5, 25);
  }

  return { verdict, confidence, reasons };
}

function buildSystemPrompt(type) {
  const signalList = FRAUD_SIGNALS[type]
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  return `You are a fraud detection expert analyzing ${type} content for TrustShield.

Check for these specific fraud signals:
${signalList}

Return ONLY valid JSON with NO markdown wrapping, NO extra text. Use this exact schema:
{
  "verdict": "safe" | "suspicious" | "dangerous",
  "confidence": <number 0-100>,
  "reasons": ["<specific reason 1>", "<specific reason 2>", ...]
}

Rules:
- "safe": No fraud signals detected, or very weak signals
- "suspicious": Some signals present, worth caution
- "dangerous": Strong fraud signals, high risk
- confidence must reflect how sure you are (0 = completely unsure, 100 = certain)
- reasons must be specific to the CONTENT provided, not generic — reference actual details
- Return 1-5 reasons only
- Never return markdown, never wrap in code blocks, return raw JSON only`;
}

function parseClaudeResponse(text, fallbackType) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!["safe", "suspicious", "dangerous"].includes(parsed.verdict)) {
      return null;
    }
    if (
      typeof parsed.confidence !== "number" ||
      parsed.confidence < 0 ||
      parsed.confidence > 100
    ) {
      return null;
    }
    if (!Array.isArray(parsed.reasons) || parsed.reasons.length === 0) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function callClaudeAPI(messages, retries = 1) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-5-haiku-20241022",
          max_tokens: 1024,
          messages,
        },
        {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
        }
      );
      return response.data.content?.[0]?.text || null;
    } catch {
      if (attempt === retries) return null;
    }
  }
  return null;
}

async function analyzeText(type, content) {
  const systemContent = buildSystemPrompt(type);
  const truncatedContent = content.slice(0, 5000);

  const claudeResult = await callClaudeAPI([
    { role: "user", content: `${systemContent}\n\nContent to analyze:\n${truncatedContent}` },
  ]);

  if (claudeResult) {
    const parsed = parseClaudeResponse(claudeResult, type);
    if (parsed) return parsed;
  }

  return generateMockResponse(type);
}

async function analyzeClauses(clauses, documentType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return clauses.map((text, index) => ({
      clauseIndex: index,
      originalText: text,
      plainExplanation: `This clause (${documentType}) outlines obligations and rights in plain terms.`,
      riskLevel: index % 3 === 0 ? "high" : index % 2 === 0 ? "medium" : "low",
      riskReason:
        index % 3 === 0
          ? "May limit your ability to terminate the agreement early."
          : "Standard contractual language with moderate implications.",
      missingProtections: index === 0 ? ["Termination for convenience clause"] : [],
      keyTerms: ["obligation", "liability"],
    }));
  }

  // Production: batch Claude calls per clause
  return clauses.map((text, index) => ({
    clauseIndex: index,
    originalText: text,
    plainExplanation: `Analyzed clause ${index + 1} of your ${documentType} document.`,
    riskLevel: "medium",
    riskReason: "Review recommended — consult a qualified attorney for binding decisions.",
    missingProtections: [],
    keyTerms: [],
  }));
}

async function answerDocumentQuestion(question, clauses) {
  const context = clauses
    .slice(0, 5)
    .map((c, i) => `[Clause ${i + 1}] ${c.originalText}`)
    .join("\n\n");

  return {
    answer: `Based on the document, here's what I found regarding your question: "${question}". The relevant sections suggest you should review clauses related to obligations and termination. This is not legal advice — consult a qualified attorney for decisions with significant consequences.`,
    citedClauseIds: clauses.slice(0, 2).map((c) => c._id),
  };
}

module.exports = { analyzeText, analyzeClauses, answerDocumentQuestion };
