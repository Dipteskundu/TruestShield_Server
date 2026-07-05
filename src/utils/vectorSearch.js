function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

function findRelevantClauses(questionEmbedding, clauses, topK = 5) {
  if (!questionEmbedding || !clauses || clauses.length === 0) return [];
  if (clauses.length <= topK) return clauses;

  const scored = clauses
    .filter((c) => c.embedding && c.embedding.length > 0)
    .map((clause) => ({
      clause,
      score: cosineSimilarity(questionEmbedding, clause.embedding),
    }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map((s) => s.clause);
}

module.exports = { cosineSimilarity, findRelevantClauses };
