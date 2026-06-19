const path = require("path");
const dotenv = require("dotenv");

const rootDir = path.resolve(__dirname, "../../..");
dotenv.config({ path: path.join(rootDir, ".env") });

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric env var: ${name}`);
  }
  return parsed;
}

const env = {
  rootDir,
  frontendDir: path.join(rootDir, "frontend"),
  port: readNumber("PORT", 3001),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: readNumber("DB_PORT", 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "emma_control_facturacion",
    connectionLimit: readNumber("DB_CONNECTION_LIMIT", 10)
  },
  adminRegistrationKey: process.env.ADMIN_REGISTRATION_KEY || "",
  sessionSecret: process.env.SESSION_SECRET || "change_me_session_secret"
};

module.exports = { env };
