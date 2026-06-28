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

module.exports = { extractTextFromPdf, chunkByClauses };
