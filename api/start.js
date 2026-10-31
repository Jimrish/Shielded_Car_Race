const crypto = require("crypto");
const { sign, json } = require("./_lib");

// GET /api/start -> { token }; one signed, single-use token per car race.
module.exports = (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  const payload = Date.now() + "." + crypto.randomBytes(8).toString("hex");
  json(res, 200, { token: payload + "." + sign(payload) });
};
