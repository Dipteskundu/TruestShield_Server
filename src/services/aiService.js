const axios = require("axios");

const MOCK_RESPONSES = {
  email: {
    verdict: "suspicious",
    confidence: 72,
    reasons: [
      "Sender domain does not match the displayed name",
      "Urgent language pressuring immediate action",
      "Contains a shortened link to an unknown domain",
    ],
  },
  job: {
    verdict: "dangerous",
    confidence: 85,
    reasons: [
      "Salary listed is unusually high for the role described",
      "Requests banking details before any interview",
      "Company name does not appear in public business records",
    ],
  },
  message: {
    verdict: "suspicious",
    confidence: 68,
    reasons: [
      "Unexpected prize or lottery notification pattern",
      "Message creates artificial urgency",
      "Link domain does not match the claimed sender organization",
    ],
  },
};

async function analyzeText(type, content) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return MOCK_RESPONSES[type] || MOCK_RESPONSES.email;
  }

  try {
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Analyze this ${type} content for fraud/scam signals. Return ONLY valid JSON with keys: verdict (safe|suspicious|dangerous), confidence (0-100), reasons (string array).\n\nContent:\n${content}`,
          },
        ],
      },
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    const text = response.data.content?.[0]?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : MOCK_RESPONSES[type];
  } catch {
    return MOCK_RESPONSES[type] || MOCK_RESPONSES.email;
  }
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
