const NAVIGATION_PROMPT = (query, treeText) => `
You are navigating a document tree to find which sections contain the answer to a user's question.
You will read the tree structure below and select the most relevant nodes.

Document tree (each node shows [nodeId] title and its summary):
${treeText}

User question: "${query}"

Return ONLY a valid JSON object. No explanation, no markdown, no code fences.

{
  "selectedNodeIds": ["node_2_3"],
  "reasoning": "One sentence explaining why these nodes were selected",
  "confidence": "high",
  "needsCrossRefs": false
}

Rules:
1. selectedNodeIds: prefer LEAF nodes marked with [LEAF] — they contain the actual content
2. Select the MINIMUM number of nodes needed — do not over-retrieve
3. confidence: "high" if clearly relevant, "medium" if somewhat relevant, "low" if uncertain
4. needsCrossRefs: true only if the selected nodes reference other sections that are also needed
5. If no node is relevant, return selectedNodeIds: [] with confidence: "low"
6. Return ONLY the JSON object, nothing else
`;

module.exports = { NAVIGATION_PROMPT };
