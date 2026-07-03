const OpenAI = require("openai");

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 2048;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateEmbedding(text) {
  const openai = getClient();
  const truncated = text.slice(0, 8000);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncated,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      return response.data[0].embedding;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) {
        throw error;
      }
      if (error.status === 429) {
        await sleep(RETRY_DELAY_MS * (attempt + 1) * 2);
      } else {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
}

async function generateEmbeddings(texts) {
  const openai = getClient();
  const truncated = texts.map((t) => t.slice(0, 8000));
  const results = [];

  for (let i = 0; i < truncated.length; i += MAX_BATCH_SIZE) {
    const batch = truncated.slice(i, i + MAX_BATCH_SIZE);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        });

        const sorted = response.data.sort((a, b) => a.index - b.index);
        results.push(...sorted.map((d) => d.embedding));
        break;
      } catch (error) {
        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
        if (error.status === 429) {
          await sleep(RETRY_DELAY_MS * (attempt + 1) * 2);
        } else {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
  }

  return results;
}

module.exports = { generateEmbedding, generateEmbeddings, EMBEDDING_DIMENSIONS };
