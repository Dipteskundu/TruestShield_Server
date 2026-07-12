const TREE_BUILDER_PROMPT = (documentType, segments) => `
You are building a hierarchical tree index for a ${documentType}.

Here are the detected text segments in order:
${JSON.stringify(segments, null, 2)}

Return ONLY a valid JSON array. No explanation, no markdown, no code fences.
Each element must match this exact shape:

{
  "nodeId": "node_2_3",
  "parentId": "node_2",
  "title": "2.3 Late Payment Penalties",
  "summary": "A 40-80 word plain-English description of exactly what this section contains — specific, not generic",
  "segmentIndex": 5,
  "pageStart": 4,
  "pageEnd": 4,
  "level": 2,
  "crossRefs": ["node_3_1"]
}

Rules:
1. nodeId format: root-level sections are "node_1", "node_2" etc. Sub-clauses are "node_1_1", "node_2_3" etc.
2. parentId: null for the root document node, "root" for top-level sections, parent nodeId for clauses
3. level: 0 = root document, 1 = top-level section, 2 = clause, 3 = sub-clause
4. summary: must be specific to THIS section's content, not a generic description
5. segmentIndex: the index from the input array (0-based)
6. crossRefs: ONLY include if the text explicitly references another section by number
7. Every segment must map to exactly one node — do not skip any
8. Return ONLY the JSON array, nothing else
`;

module.exports = { TREE_BUILDER_PROMPT };
