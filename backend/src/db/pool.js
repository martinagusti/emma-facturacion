const mysql = require("mysql2/promise");
const { env } = require("../config/env");

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  charset: "utf8mb4",
  waitForConnections: true
});

module.exports = { pool };
