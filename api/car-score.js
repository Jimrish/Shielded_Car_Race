const { redis, sign, json, top, KEY } = require("./_lib");

// POST /api/car-score
// Body: { handle, score, pos, time, overtakes, t, token }
module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (_) {
      b = null;
    }
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    return json(res, 400, { error: "Bad request" });

  const handle = String(b.handle || "").replace(/^@/, "");
  const score = Math.floor(Number(b.score));
  const pos = Math.floor(Number(b.pos));
  const time = Number(b.time);
  const overtakes = Math.floor(Number(b.overtakes));
  const t = Number(b.t);
  const [ts, nonce, sig] = String(b.token || "").split(".");

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle))
    return json(res, 400, { error: "Invalid X handle" });
  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 10000 ||
    !Number.isInteger(pos) ||
    pos < 1 ||
    pos > 6 ||
    !Number.isFinite(time) ||
    time < 0 ||
    time > 7200 ||
    !Number.isInteger(overtakes) ||
    overtakes < 0 ||
    overtakes > 100 ||
    !Number.isFinite(t) ||
    t < 0 ||
    t > 7200
  ) {
    return json(res, 400, { error: "Invalid car race result" });
  }
  if (!ts || !nonce || !sig || sign(ts + "." + nonce) !== sig) {
    return json(res, 403, { error: "Invalid token" });
  }
  const age = (Date.now() - Number(ts)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age > 7200 || t > age + 5) {
    return json(res, 403, { error: "Timing check failed" });
  }

  // Current game formula: placement points + time bonus + 25 points per overtake.
  // A deliberately generous ceiling allows normal race results while rejecting extreme scores.
  const maxPlausible = 2200 + overtakes * 25;
  if (score > maxPlausible)
    return json(res, 400, { error: "Car race score not plausible" });

  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const rateKey = "shielded-car-race:rate:" + ip;
    const count = await redis(["INCR", rateKey]);
    if (count === 1) await redis(["EXPIRE", rateKey, 600]);
    if (count > 30)
      return json(res, 429, { error: "Too many submissions, try again later" });

    const fresh = await redis([
      "SET",
      "shielded-car-race:used:" + nonce,
      "1",
      "NX",
      "EX",
      7200,
    ]);
    if (fresh !== "OK") return json(res, 403, { error: "Token already used" });

    const member = handle.toLowerCase();
    await redis(["ZADD", KEY, "GT", score, member]);
    const rank = await redis(["ZREVRANK", KEY, member]);
    json(res, 200, { ok: true, rank: rank + 1, top: await top(10) });
  } catch (e) {
    json(res, 503, {
      error: "Car leaderboard unavailable",
      reason: String(e.message || e).slice(0, 160),
    });
  }
};
