const crypto = require("crypto");
const { redisCommand, isConfigured } = require("../config/redis");

function hashInput(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function getCache(key) {
  if (!isConfigured) return null;
  const value = await redisCommand(["GET", key]);
  return value ? JSON.parse(value) : null;
}

async function setCache(key, value, ttlSeconds = 86400) {
  if (!isConfigured) return;
  await redisCommand([
    "SET",
    key,
    JSON.stringify(value),
    "EX",
    String(ttlSeconds),
  ]);
}

async function incrementRateLimit(key, ttlSeconds = 86400) {
  if (!isConfigured) return 1;
  const count = await redisCommand(["INCR", key]);
  if (count === 1) {
    await redisCommand(["EXPIRE", key, String(ttlSeconds)]);
  }
  return count;
}

module.exports = { hashInput, getCache, setCache, incrementRateLimit };
