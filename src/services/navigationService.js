const { callAI } = require("./aiProviderService");
const DocumentTreeNode = require("../models/DocumentTreeNode");
const { NAVIGATION_PROMPT } = require("../config/prompts/navigationPrompt");
const { ANSWER_PROMPT } = require("../config/prompts/answerPrompt");

async function loadTreeSummary(documentId) {
  const nodes = await DocumentTreeNode.find({ documentId })
    .select(
      "nodeId parentId title summary level path crossRefs pageStart pageEnd isLeaf"
    )
    .sort({ level: 1, pageStart: 1 })
    .lean();
  return nodes;
}

function formatTreeForNavigation(nodes) {
  return nodes
    .map((n) => {
      const indent = "  ".repeat(n.level);
      const leafMarker = n.isLeaf ? " [LEAF]" : "";
      return `${indent}[${n.nodeId}]${leafMarker} ${n.title}\n${indent}  ${n.summary}`;
    })
    .join("\n\n");
}

async function navigateTree(query, documentId) {
  const nodes = await loadTreeSummary(documentId);
  const treeText = formatTreeForNavigation(nodes);

  const messages = [
    {
      role: "user",
      content: NAVIGATION_PROMPT(query, treeText),
    },
  ];

  const raw = await callAI(messages, "gemini", "gemini-1.5-flash");
  if (!raw) {
    throw new Error("Failed to get response from Gemini for navigation");
  }

  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

async function retrieveNodeContent(selectedNodeIds, documentId) {
  const nodes = await DocumentTreeNode.find({
    documentId,
    nodeId: { $in: selectedNodeIds },
  }).lean();

  const contentNodes = [];

  for (const node of nodes) {
    if (node.isLeaf && node.content) {
      contentNodes.push(node);
    } else {
      const children = await DocumentTreeNode.find({
        documentId,
        parentId: node.nodeId,
        isLeaf: true,
      }).lean();
      contentNodes.push(...children);
    }
  }

  return contentNodes;
}

async function expandWithCrossRefs(selectedNodeIds, contentNodes, documentId) {
  const allCrossRefs = contentNodes.flatMap((n) => n.crossRefs || []);
  const newRefs = allCrossRefs.filter((id) => !selectedNodeIds.includes(id));

  if (newRefs.length === 0) return contentNodes;

  const refNodes = await DocumentTreeNode.find({
    documentId,
    nodeId: { $in: newRefs },
    isLeaf: true,
  }).lean();

  return [...contentNodes, ...refNodes];
}

async function generateAnswer(
  query,
  contentNodes,
  conversationHistory,
  documentType
) {
  if (contentNodes.length === 0) {
    return {
      answer:
        "I couldn't find a section in this document that directly addresses that question. " +
        "The document may not cover this topic, or it might be phrased differently. " +
        "Try rephrasing your question using terms from the document's section headings.",
      citedNodeIds: [],
      citedNodes: [],
      confidence: "low",
      nodesFound: false,
    };
  }

  const contextText = contentNodes
    .map(
      (n) =>
        `[${n.nodeId} — ${n.title} — Page ${n.pageStart}–${n.pageEnd}]\n` +
        `Path: ${n.path}\n\n` +
        `${n.content}`
    )
    .join("\n\n" + "─".repeat(60) + "\n\n");

  const historyMessages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    ...historyMessages,
    {
      role: "user",
      content: ANSWER_PROMPT(query, contextText, documentType),
    },
  ];

  const raw = await callAI(messages, "gemini", "gemini-1.5-flash");
  if (!raw) {
    throw new Error("Failed to get response from Gemini for answer generation");
  }

  return {
    answer: raw,
    citedNodeIds: contentNodes.map((n) => n.nodeId),
    citedNodes: contentNodes.map((n) => ({
      nodeId: n.nodeId,
      title: n.title,
      pageStart: n.pageStart,
      pageEnd: n.pageEnd,
      path: n.path,
    })),
    confidence: "high",
    nodesFound: true,
  };
}

async function answerDocumentQuery(
  query,
  documentId,
  conversationHistory,
  documentType
) {
  const navigation = await navigateTree(query, documentId);
  const { selectedNodeIds, reasoning, needsCrossRefs } = navigation;

  if (!selectedNodeIds || selectedNodeIds.length === 0) {
    return {
      answer:
        "I couldn't identify which section of this document answers your question. " +
        "Try being more specific or asking about a particular clause or section.",
      citedNodeIds: [],
      citedNodes: [],
      navigationReasoning: reasoning,
      confidence: "low",
      nodesFound: false,
    };
  }

  let contentNodes = await retrieveNodeContent(selectedNodeIds, documentId);

  if (needsCrossRefs) {
    contentNodes = await expandWithCrossRefs(
      selectedNodeIds,
      contentNodes,
      documentId
    );
  }

  const result = await generateAnswer(
    query,
    contentNodes,
    conversationHistory,
    documentType
  );

  return {
    ...result,
    navigationReasoning: reasoning,
  };
}

module.exports = {
  answerDocumentQuery,
  loadTreeSummary,
  navigateTree,
  retrieveNodeContent,
  generateAnswer,
};
