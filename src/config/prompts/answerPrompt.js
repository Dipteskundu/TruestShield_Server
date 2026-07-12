const ANSWER_PROMPT = (query, contextText, documentType) => `
Answer the following question about a ${documentType} using ONLY the document sections provided.
Do not use any general legal knowledge. Your answer must be traceable to the provided text.

Document sections:
${contextText}

Question: ${query}

Instructions:
- Cite the specific clause number (e.g. "according to clause 2.3") when referencing content
- Write in plain English — no legal jargon
- If the answer spans multiple clauses, address each one in order
- If the provided sections do not contain enough information, say "this document section does not directly address that question" and suggest what the user might look for
- NEVER give legal advice — only explain what the document says
- NEVER say "you should" or "you must" — only "the document states" or "clause X says"
- Use "may" and "typically" rather than absolute claims
- Keep the answer concise — 2-5 sentences unless the question genuinely requires more
`;

module.exports = { ANSWER_PROMPT };
