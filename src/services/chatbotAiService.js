const axios = require("axios");
const {
  CHATBOT_MODEL,
  CHATBOT_MAX_TOKENS,
} = require("../config/chatbot-knowledge");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function streamChatCompletion(systemPrompt, messages, onChunk) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const payload = {
    model: CHATBOT_MODEL,
    max_tokens: CHATBOT_MAX_TOKENS,
    temperature: 0.7,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  };

  const response = await axios.post(GROQ_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    responseType: "stream",
    timeout: 30000,
  });

  return new Promise((resolve, reject) => {
    let fullResponse = "";
    let buffer = "";

    response.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            onChunk(delta);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    });

    response.data.on("end", () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ") && trimmed.slice(6) !== "[DONE]") {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              onChunk(delta);
            }
          } catch {
            // Ignore
          }
        }
      }
      resolve(fullResponse);
    });

    response.data.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = { streamChatCompletion };
