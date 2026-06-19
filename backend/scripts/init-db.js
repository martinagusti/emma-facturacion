const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { env } = require("../src/config/env");

async function main() {
  const schemaPath = path.join(__dirname, "../src/db/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const bootstrapConnection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true
  });

  await bootstrapConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.database}\`
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci`
  );
  await bootstrapConnection.end();

  const schemaConnection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true
  });

  await schemaConnection.query(schemaSql);
  await schemaConnection.end();

  console.log(`Base de datos ${env.db.database} inicializada correctamente.`);
}

main().catch((error) => {
  console.error("Error inicializando la base de datos:", error);
  process.exitCode = 1;
});
