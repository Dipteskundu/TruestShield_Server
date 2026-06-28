async function generateEmbedding(_text) {
  // Placeholder — production uses Claude or dedicated embedding API + Atlas Vector Search
  return Array.from({ length: 8 }, () => Math.random());
}

module.exports = { generateEmbedding };
