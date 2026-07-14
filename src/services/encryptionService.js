const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required for encryption");
  }
  // Derive a separate encryption key from JWT_SECRET using a different context
  return crypto.pbkdf2Sync(jwtSecret, "trustshield-encryption-key-v1", ITERATIONS, KEY_LENGTH, "sha512");
}

function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, "sha512");
}

function encrypt(text, secret) {
  if (!text) return null;

  const key = secret || getEncryptionKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = deriveKey(key, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, "hex")]);
  return combined.toString("base64");
}

function decrypt(encryptedBase64, secret) {
  if (!encryptedBase64) return null;

  try {
    const key = secret || getEncryptionKey();
    const combined = Buffer.from(encryptedBase64, "base64");

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const derivedKey = deriveKey(key, salt);

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
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
