const axios = require("axios");

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const isConfigured = Boolean(redisUrl && redisToken);

async function redisCommand(command) {
  if (!isConfigured) return null;

  const response = await axios.post(
    redisUrl,
    command,
    {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    }
  );

  return response.data?.result ?? null;
}

module.exports = { redisCommand, isConfigured };
