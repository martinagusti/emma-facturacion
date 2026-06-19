const crypto = require("crypto");
const { env } = require("../config/env");

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function parseBase64url(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function hashPassword(password) {
  const input = String(password || "");
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  return "h" + Math.abs(hash).toString(16) + "_" + input.length;
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", env.sessionSecret)
    .update(encodedPayload)
    .digest("base64url");
}

function createToken(user) {
  const now = Date.now();
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_MS
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return encodedPayload + "." + signature;
}

function verifyToken(token) {
  const raw = String(token || "").trim();
  if (!raw || raw.indexOf(".") === -1) {
    throw new Error("Token inv?lido");
  }
  const parts = raw.split(".");
  if (parts.length !== 2) {
    throw new Error("Token inv?lido");
  }
  const encodedPayload = parts[0];
  const providedSignature = parts[1];
  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Token inv?lido");
  }
  const payload = parseBase64url(encodedPayload);
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Sesi?n expirada");
  }
  return payload;
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    pendingActivation: !!user.pendingActivation,
    role: user.role,
    isAdmin: !!user.isAdmin,
    name: user.name || String(user.email || "").split("@")[0],
    commercialName: user.commercialName || "",
    createdBy: user.createdBy || "",
    createdAt: user.createdAt || ""
  };
}

module.exports = {
  createToken,
  hashPassword,
  sanitizeUser,
  verifyToken
};
