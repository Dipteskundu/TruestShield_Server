const serverless = require("serverless-http");
const app = require("../src/app");
const connectDB = require("../src/config/db");

let dbConnected = false;
let serverlessHandler;

async function ensureDB() {
  if (!dbConnected) {
    await connectDB();
    dbConnected = true;
  }
}

serverlessHandler = serverless(app);

module.exports = async (req, res) => {
  await ensureDB();
  return serverlessHandler(req, res);
};
