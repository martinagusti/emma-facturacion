const { app } = require("./app");
const { env } = require("./config/env");

app.listen(env.port, () => {
  console.log(`EMMA API escuchando en http://localhost:${env.port}`);
});
