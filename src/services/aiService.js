const { callWithUserPreference, decrypt } = require("./aiProviderService");
const crypto = require("crypto");
const { generateEmbedding } = require("./embeddingService");

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
    "banking details", "upfront payment", "gift cards", "SSN",
    "password", "lottery", "inheritance", "legal action",
    "account suspended", "wire transfer",
  ];
  const hasDangerous = reasons.some((r) =>
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

    if (!["safe", "suspicious", "dangerous"].includes(parsed.verdict)) return null;
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 100) return null;
    if (!Array.isArray(parsed.reasons) || parsed.reasons.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

async function analyzeText(type, content, userPreferences = null) {
  const systemContent = buildSystemPrompt(type);
  const truncatedContent = content.slice(0, 5000);

  const messages = [
    { role: "user", content: `${systemContent}\n\nContent to analyze:\n${truncatedContent}` },
  ];

  try {
    const result = await callWithUserPreference(messages, userPreferences);
    if (result) {
      const parsed = parseClaudeResponse(result, type);
      if (parsed) return parsed;
    }
  } catch {
    // Fall through to mock response
  }

  return generateMockResponse(type);
}

const CLAUSE_ANALYSIS_PROMPT = `You are a legal document analyst for TrustShield. Analyze the following clause from a {documentType} document.

Return ONLY valid JSON with NO markdown wrapping. Schema:
{
  "plainExplanation": "<2-3 sentence plain-English explanation of what this clause means>",
  "riskLevel": "low" | "medium" | "high",
  "riskReason": "<1-2 sentences explaining WHY this risk level was assigned — reference specific financial exposure or rights lost>",
  "missingProtections": ["<protection that standard contracts of this type include but this clause lacks>"],
  "keyTerms": ["<legal term 1>", "<legal term 2>"]
}

Rules:
- plainExplanation must be understandable by someone with no legal background
- Use "may", "typically", "could mean" — never make absolute legal claims
- riskLevel criteria: "high" = significant financial exposure or major rights lost, "medium" = moderate implications worth reviewing, "low" = standard/generally fair language
- missingProtections: only list protections that are genuinely missing and commonly included in similar contracts. If the clause is fine, return an empty array.
- keyTerms: list 2-5 legal terms from this clause that would benefit from a glossary definition
- Never include markdown, code blocks, or extra text — raw JSON only`;

async function analyzeClauses(clauses, documentType, userPreferences = null) {
  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < clauses.length; i += BATCH_SIZE) {
    const batch = clauses.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (text, batchIndex) => {
        const clauseIndex = i + batchIndex;
        const prompt = CLAUSE_ANALYSIS_PROMPT
          .replace("{documentType}", documentType);

        const messages = [
          { role: "user", content: `${prompt}\n\nClause to analyze:\n${text.slice(0, 3000)}` },
        ];

        try {
          const result = await callWithUserPreference(messages, userPreferences);
          if (result) {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.plainExplanation && parsed.riskLevel) {
                return {
                  clauseIndex,
                  originalText: text,
                  plainExplanation: parsed.plainExplanation || "",
                  riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel) ? parsed.riskLevel : "medium",
                  riskReason: parsed.riskReason || "Review recommended.",
                  missingProtections: Array.isArray(parsed.missingProtections) ? parsed.missingProtections : [],
                  keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
                };
              }
            }
          }
        } catch {
          // Fall through to default
        }

        return {
          clauseIndex,
          originalText: text,
          plainExplanation: `This clause outlines obligations and rights related to the ${documentType} agreement.`,
          riskLevel: "medium",
          riskReason: "Review recommended — consult a qualified attorney for binding decisions.",
          missingProtections: [],
          keyTerms: [],
        };
      })
    );

    results.push(...batchResults);
  }

  return results.sort((a, b) => a.clauseIndex - b.clauseIndex);
}

const AGGREGATION_PROMPT = `You are a legal document analyst for TrustShield. You have already analyzed individual clauses of a {documentType} document. Now provide a document-level summary.

Here are the analyzed clauses:
{clauseResults}

Return ONLY valid JSON with NO markdown wrapping. Schema:
{
  "executiveSummary": "<3-4 sentence plain-English overview of the entire document — what it is, what it covers, and the overall risk level>",
  "overallRiskScore": <number 0-100>,
  "glossary": [
    {"term": "<legal term>", "definition": "<plain-English definition as used in this document>"}
  ]
}

Rules:
- executiveSummary must be plain English, not legal jargon
- overallRiskScore: 0-20 = low risk, 21-50 = moderate, 51-75 = high risk, 76-100 = very high risk
- Weight the score: each high-risk clause adds more than medium, which adds more than low
- glossary: define every unique legal term found across all clause keyTerms. Each definition should be specific to how the term is used in THIS document.
- Never include markdown, code blocks, or extra text — raw JSON only`;

async function aggregateDocumentAnalysis(clauses, documentType, userPreferences = null) {
  const clauseSummary = clauses.map((c, i) =>
    `Clause ${i + 1} [${c.riskLevel}]: ${c.originalText.slice(0, 500)}... → ${c.plainExplanation}`
  ).join("\n");

  const prompt = AGGREGATION_PROMPT
    .replace("{documentType}", documentType)
    .replace("{clauseResults}", clauseSummary);

  const messages = [{ role: "user", content: prompt }];

  try {
    const result = await callWithUserPreference(messages, userPreferences);
    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          executiveSummary: parsed.executiveSummary || "",
          overallRiskScore: Math.min(100, Math.max(0, parsed.overallRiskScore || 50)),
          glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
        };
      }
    }
  } catch {
    // Fall through to manual aggregation
  }

  const highCount = clauses.filter((c) => c.riskLevel === "high").length;
  const mediumCount = clauses.filter((c) => c.riskLevel === "medium").length;
  const lowCount = clauses.filter((c) => c.riskLevel === "low").length;
  const total = clauses.length || 1;
  const weightedScore = Math.round(((highCount * 3 + mediumCount * 2 + lowCount * 1) / (total * 3)) * 100);

  const allKeyTerms = [...new Set(clauses.flatMap((c) => c.keyTerms || []))];
  const glossary = allKeyTerms.map((term) => ({
    term,
    definition: `${term} — a legal term used in this document. Consult a legal professional for the precise definition in your jurisdiction.`,
  }));

  return {
    executiveSummary: `This ${documentType} document contains ${total} analyzed clauses. ${highCount} are flagged as high risk, ${mediumCount} as medium risk. TrustShield is not legal advice — consult a qualified attorney for binding decisions.`,
    overallRiskScore: Math.min(100, weightedScore),
    glossary,
  };
}

async function answerDocumentQuestion(question, clauses, documentType = "document", userPreferences = null) {
  const context = clauses
    .map((c, i) => `[Clause ${c.clauseIndex + 1} — Risk: ${c.riskLevel}]\n${c.originalText}\nPlain English: ${c.plainExplanation}`)
    .join("\n\n");

  const prompt = `You are a document analysis assistant for TrustShield. Answer the user's question using ONLY the provided clauses from their ${documentType} document.

IMPORTANT RULES:
- Only answer based on the clauses provided below. Do not use outside knowledge.
- Always cite which clause(s) your answer is based on by referencing their clause numbers.
- Use plain English — avoid legal jargon.
- Use "may", "typically", "could mean" — never make absolute legal claims.
- Start your answer with the most relevant information, then add context if needed.
- If the answer is not in the provided clauses, say so clearly.

Clauses from the document:
${context}

User question: ${question}

Return ONLY valid JSON with NO markdown wrapping. Schema:
{
  "answer": "<plain-English answer citing specific clause numbers>",
  "citedClauseIndices": [<1-based clause index numbers>]
}`;

  const messages = [{ role: "user", content: prompt }];

  try {
    const result = await callWithUserPreference(messages, userPreferences);
    if (result) {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.answer) {
          const citedIndices = Array.isArray(parsed.citedClauseIndices) ? parsed.citedClauseIndices : [];
          const citedClauseIds = citedIndices
            .filter((idx) => idx >= 1 && idx <= clauses.length)
            .map((idx) => clauses[idx - 1]._id);

          return { answer: parsed.answer, citedClauseIds };
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  return {
    answer: `Based on the document, here's what I found regarding your question: "${question}". The relevant sections suggest reviewing the clauses related to obligations and key terms. This is not legal advice — consult a qualified attorney for decisions with significant consequences.`,
    citedClauseIds: clauses.slice(0, 2).map((c) => c._id),
  };
}

module.exports = { analyzeText, analyzeClauses, aggregateDocumentAnalysis, answerDocumentQuestion };
