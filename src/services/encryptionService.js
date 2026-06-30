const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, "sha512");
}

function encrypt(text, secret = process.env.JWT_SECRET) {
  if (!text) return null;

  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, "hex")]);
  return combined.toString("base64");
}

function decrypt(encryptedBase64, secret = process.env.JWT_SECRET) {
  if (!encryptedBase64) return null;

  try {
    const combined = Buffer.from(encryptedBase64, "base64");

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(secret, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    return null;
  }
}

function maskKey(apiKey) {
  if (!apiKey || apiKey.length < 12) return "****";
  const prefix = apiKey.slice(0, 6);
  const suffix = apiKey.slice(-6);
  return `${prefix}...${suffix}`;
}

module.exports = { encrypt, decrypt, maskKey };
