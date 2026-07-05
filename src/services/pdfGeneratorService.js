const PDFDocument = require("pdfkit");

const COLORS = {
  high: { r: 220, g: 38, b: 38 },
  medium: { r: 245, g: 158, b: 11 },
  low: { r: 16, g: 185, b: 129 },
  primary: { r: 99, g: 102, b: 241 },
  muted: { r: 107, g: 114, b: 128 },
  dark: { r: 31, g: 41, b: 55 },
  light: { r: 243, g: 244, b: 246 },
  white: { r: 255, g: 255, b: 255 },
  amber: { r: 245, g: 158, b: 11 },
};

function riskColor(level) {
  return COLORS[level] || COLORS.muted;
}

function wrapText(doc, text, x, y, maxWidth, options = {}) {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y, options);
  return y + doc.heightOfString(lines, { width: maxWidth });
}

function drawHeader(doc, report) {
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
    .text("TrustShield Report", 50, 50);

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
    .text(report.title.replace("TrustShield Report — ", ""), 50, 78);

  doc
    .fontSize(9)
    .text(`Generated: ${new Date(report.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, 95);

  doc
    .moveTo(50, 115)
    .lineTo(545, 115)
    .strokeColor(COLORS.light.r, COLORS.light.g, COLORS.light.b)
    .lineWidth(1)
    .stroke();

  return 130;
}

function drawDisclaimer(doc, y) {
  const boxHeight = 40;
  doc
    .rect(50, y, 495, boxHeight)
    .fill(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b, 0.08);

  doc
    .rect(50, y, 4, boxHeight)
    .fill(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b)
    .text("NOTICE: Not Legal Advice", 62, y + 8, { width: 470 });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
    .text(
      "TrustShield is a legal literacy tool, not a substitute for professional legal advice. For decisions with significant financial or legal consequences, consult a qualified attorney.",
      62,
      y + 22,
      { width: 470 }
    );

  return y + boxHeight + 15;
}

function drawRiskScore(doc, report, y) {
  const score = report.overallRiskScore;
  const label = score > 60 ? "HIGH RISK" : score > 30 ? "MODERATE RISK" : "LOW RISK";
  const color = score > 60 ? COLORS.high : score > 30 ? COLORS.medium : COLORS.low;

  doc
    .rect(50, y, 495, 55)
    .fill(color.r, color.g, color.b, 0.06);

  doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor(color.r, color.g, color.b)
    .text(`${score}`, 70, y + 10, { continued: true });

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(color.r, color.g, color.b)
    .text("%", { continued: true });

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(color.r, color.g, color.b)
    .text(`   ${label}`, { continued: true });

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
    .text(`   Overall risk score based on ${report.clauses.length} analyzed clauses`);

  return y + 70;
}

function drawExecutiveSummary(doc, report, y) {
  if (!report.executiveSummary) return y;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
    .text("Executive Summary", 50, y);

  y += 18;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);

  const bottom = wrapText(doc, report.executiveSummary, 50, y, 495, {
    lineGap: 3,
  });

  return bottom + 15;
}

function drawMissingProtections(doc, report, y) {
  if (!report.missingProtections || report.missingProtections.length === 0) return y;

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.amber.r, COLORS.amber.g, COLORS.amber.b)
    .text("Missing Protections", 50, y);

  y += 18;

  for (const protection of report.missingProtections) {
    if (y > 750) {
      doc.addPage();
      y = 50;
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
      .text(`•  ${protection}`, 60, y, { width: 475 });
    y += doc.heightOfString(protection, { width: 475, fontSize: 9 }) + 6;
  }

  return y + 10;
}

function drawClauses(doc, report, y) {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
    .text("Clause Breakdown", 50, y);

  y += 20;

  for (const clause of report.clauses) {
    if (y > 680) {
      doc.addPage();
      y = 50;
    }

    const color = riskColor(clause.riskLevel);

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(color.r, color.g, color.b)
      .text(`Clause ${clause.index + 1}`, 50, y, { continued: true });

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(color.r, color.g, color.b)
      .text(`   [${clause.riskLevel.toUpperCase()}]`, { continued: true });

    if (clause.keyTerms && clause.keyTerms.length > 0) {
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
        .text(`   Terms: ${clause.keyTerms.join(", ")}`);
    } else {
      doc.text("");
    }

    y += 18;

    // Original text
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b);
    const originalBottom = wrapText(doc, `"${clause.originalText}"`, 60, y, 475, { lineGap: 2 });
    y = originalBottom + 6;

    // Plain English
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
      .text("Plain English: ", 60, y, { continued: true });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b);
    const plainBottom = wrapText(doc, clause.plainExplanation, 60, y + 14, 475, { lineGap: 2 });
    y = plainBottom + 6;

    // Risk reason (if medium or high)
    if (clause.riskLevel !== "low" && clause.riskReason) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(color.r, color.g, color.b)
        .text("Risk: ", 60, y, { continued: true });

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(color.r, color.g, color.b);
      const riskBottom = wrapText(doc, clause.riskReason, 60, y + 14, 475, { lineGap: 2 });
      y = riskBottom + 6;
    }

    // Separator
    y += 4;
    doc
      .moveTo(50, y)
      .lineTo(545, y)
      .strokeColor(COLORS.light.r, COLORS.light.g, COLORS.light.b)
      .lineWidth(0.5)
      .stroke();

    y += 12;
  }

  return y;
}

function drawGlossary(doc, report, y) {
  if (!report.glossary || report.glossary.length === 0) return y;

  if (y > 650) {
    doc.addPage();
    y = 50;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
    .text("Glossary", 50, y);

  y += 18;

  for (const entry of report.glossary) {
    if (y > 730) {
      doc.addPage();
      y = 50;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.dark.r, COLORS.dark.g, COLORS.dark.b)
      .text(entry.term, 60, y, { continued: true });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
      .text(` — ${entry.definition}`, { width: 465 });

    y += doc.heightOfString(`${entry.term} — ${entry.definition}`, { width: 465, fontSize: 9 }) + 6;
  }

  return y;
}

function drawFooter(doc, pageCount) {
  for (let i = 1; i <= pageCount; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted.r, COLORS.muted.g, COLORS.muted.b)
      .text(
        `TrustShield — Not legal advice. Page ${i} of ${pageCount}`,
        50,
        doc.page.height - 35,
        { align: "center", width: 495 }
      );
  }
}

function generatePdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: report.title,
        Author: "TrustShield",
        Subject: "Document Analysis Report",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pageCount = doc.bufferedPageRange().count;
      drawFooter(doc, pageCount);
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    let y = drawHeader(doc, report);
    y = drawDisclaimer(doc, y);
    y = drawRiskScore(doc, report, y);
    y = drawExecutiveSummary(doc, report, y);
    y = drawMissingProtections(doc, report, y);
    y = drawClauses(doc, report, y);
    y = drawGlossary(doc, report, y);

    doc.end();
  });
}

module.exports = { generatePdf };
