const { redis, json, KEY } = require("./_lib");

// GET /api/health -> safe Upstash connection check for Shielded Car Race.
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  const out = {
    game: "Shielded Car Race",
    leaderboardKey: KEY,
    envVarNamesFound: Object.keys(process.env).filter((k) =>
      /REST|KV_|UPSTASH|REDIS/i.test(k)
    ),
  };
  try {
    out.ping = await redis(["PING"]);
    await redis(["SET", "shielded-car-race:health", "ok", "EX", 60]);
    out.writeAndRead = await redis(["GET", "shielded-car-race:health"]);
    out.runnersOnBoard = await redis(["ZCARD", KEY]);
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.reason = String(e.message || e).slice(0, 160);
  }
  json(res, out.ok ? 200 : 503, out);
};
