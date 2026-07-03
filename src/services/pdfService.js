const { callWithUserPreference } = require("./aiProviderService");

let pdfParse;

async function loadPdfParse() {
  if (!pdfParse) {
    pdfParse = require("pdf-parse");
  }
  return pdfParse;
}

async function extractTextFromPdf(buffer) {
  const parser = await loadPdfParse();
  const data = await parser(buffer);
  return data.text;
}

function chunkByClauses(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const chunks = normalized
    .split(/\n\s*\n|\.\s+(?=[A-Z])/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 30);

  return chunks.length > 0 ? chunks : [normalized.slice(0, 2000)];
}

const CLAUSE_CHUNKING_PROMPT = `You are a legal document analyst. Your job is to identify individual clauses or sections in the document text below.

Rules:
- Each clause should be a self-contained legal provision, obligation, right, or condition
- Split on section headers (e.g., "1.1", "Section 2", "Article III"), paragraph breaks, and logical boundaries
- Keep each clause as close to its original wording as possible — do NOT summarize or rewrite
- A clause should be meaningful on its own (typically 1-5 sentences)
- If a clause is very short (under 20 characters), merge it with the next one
- Return ONLY a JSON array of strings, where each string is one clause
- No markdown, no wrapping, no explanation — raw JSON array only

Example output format:
["Clause 1 text here...", "Clause 2 text here...", "Clause 3 text here..."]`;

async function chunkDocumentWithAI(text, documentType, userPreferences = null) {
  const maxInputLength = 12000;
  const truncated = text.length > maxInputLength ? text.slice(0, maxInputLength) : text;

  const prompt = `${CLAUSE_CHUNKING_PROMPT}

Document type: ${documentType}

Document text:
${truncated}`;

  const messages = [{ role: "user", content: prompt }];

  try {
    const result = await callWithUserPreference(messages, userPreferences);
    if (!result) return null;

    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const validClauses = parsed
      .filter((c) => typeof c === "string" && c.trim().length > 20)
      .map((c) => c.trim());

    if (validClauses.length < 2) return null;

    return validClauses;
  } catch {
    return null;
  }
}

async function smartChunkClauses(text, documentType, userPreferences = null) {
  const aiClauses = await chunkDocumentWithAI(text, documentType, userPreferences);
  if (aiClauses && aiClauses.length >= 2) {
    return aiClauses;
  }

  return chunkByClauses(text);
}

module.exports = { extractTextFromPdf, chunkByClauses, smartChunkClauses };
