const { callAI } = require("./aiProviderService");
const DocumentTreeNode = require("../models/DocumentTreeNode");
const Document = require("../models/Document");
const { TREE_BUILDER_PROMPT } = require("../config/prompts/treeBuilderPrompt");

const HEADING_PATTERNS = [
  /^(\d+)\.\s+[A-Z][^.]{2,}$/m,
  /^(\d+)\.(\d+)\s+[A-Z][^.]{2,}$/m,
  /^(\d+)\.(\d+)\.(\d+)\s+[A-Z][^.]{2,}$/m,
  /^(ARTICLE|SECTION|CLAUSE)\s+[IVXLC\d]+/mi,
  /^[A-Z][A-Z\s]{4,30}:?\s*$/m,
  /^Schedule\s+[A-Z\d]+/mi,
];

function detectStructure(pages) {
  const segments = [];
  let current = { heading: "Introduction", lines: [], startPage: 1 };

  pages.forEach((pageText, pageIdx) => {
    const pageNumber = pageIdx + 1;
    const lines = pageText.split("\n");

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const isHeading = HEADING_PATTERNS.some((p) => p.test(trimmed));

      if (isHeading && current.lines.length > 3) {
        segments.push({
          heading: current.heading,
          content: current.lines.join("\n").trim(),
          startPage: current.startPage,
          endPage: pageNumber,
        });
        current = { heading: trimmed, lines: [], startPage: pageNumber };
      } else {
        current.lines.push(line);
      }
    });
  });

  if (current.lines.length > 0) {
    segments.push({
      heading: current.heading,
      content: current.lines.join("\n").trim(),
      startPage: current.startPage,
      endPage: pages.length,
    });
  }

  return segments;
}

async function buildTree(segments, documentType) {
  const segmentList = segments.map((s, i) => ({
    index: i,
    heading: s.heading,
    contentPreview: s.content.slice(0, 400),
    startPage: s.startPage,
    endPage: s.endPage,
  }));

  const messages = [
    {
      role: "user",
      content: TREE_BUILDER_PROMPT(documentType, segmentList),
    },
  ];

  const raw = await callAI(messages, "gemini", "gemini-1.5-flash");
  if (!raw) {
    throw new Error("Failed to get response from Gemini for tree building");
  }

  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function buildPath(node, allNodes) {
  const parts = [node.title];
  let current = node;

  while (current.parentId && current.parentId !== "root") {
    const parent = allNodes.find((n) => n.nodeId === current.parentId);
    if (!parent) break;
    parts.unshift(parent.title);
    current = parent;
  }

  parts.unshift("root");
  return parts.join(" > ");
}

function markLeafNodes(treeNodes) {
  const parentIds = new Set(treeNodes.map((n) => n.parentId).filter(Boolean));
  return treeNodes.map((n) => ({
    ...n,
    isLeaf: !parentIds.has(n.nodeId),
  }));
}

async function persistTree(documentId, treeNodes, segments) {
  const withLeafFlag = markLeafNodes(treeNodes);

  const nodeDocuments = withLeafFlag.map((node) => ({
    documentId,
    nodeId: node.nodeId,
    parentId: node.parentId || null,
    title: node.title,
    summary: node.summary,
    level: node.level,
    pageStart: node.pageStart,
    pageEnd: node.pageEnd,
    path: buildPath(node, withLeafFlag),
    crossRefs: node.crossRefs || [],
    isLeaf: node.isLeaf,
    content: node.isLeaf
      ? segments[node.segmentIndex]?.content || null
      : null,
  }));

  await DocumentTreeNode.insertMany(nodeDocuments);

  const leafCount = nodeDocuments.filter((n) => n.isLeaf).length;

  await Document.findByIdAndUpdate(documentId, {
    treeBuilt: true,
    treeBuiltAt: new Date(),
    nodeCount: nodeDocuments.length,
    leafCount,
  });

  return { nodeCount: nodeDocuments.length, leafCount };
}

async function constructDocumentTree(documentId, pdfBuffer, documentType) {
  try {
    const { extractTextWithMetadata } = require("./pdfService");
    const { pages } = await extractTextWithMetadata(pdfBuffer);
    const segments = detectStructure(pages);
    const treeNodes = await buildTree(segments, documentType);
    const result = await persistTree(documentId, treeNodes, segments);
    return result;
  } catch (error) {
    await Document.findByIdAndUpdate(documentId, {
      treeError: error.message,
    });
    throw error;
  }
}

module.exports = {
  constructDocumentTree,
  detectStructure,
  buildTree,
  persistTree,
};
