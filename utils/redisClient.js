const { createClient } = require("redis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redisClient = createClient({
  url: redisUrl,
  socket: process.env.REDIS_URL
    ? {
      tls: true,
      rejectUnauthorized: false, // important for Upstash
    }
    : undefined,
});

redisClient.on("connect", () => {
  console.log("✅ Redis Connected");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis Client Error:", err);
});

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.error("❌ Redis Connection Failed:", err);
  }
})();

module.exports = redisClient;