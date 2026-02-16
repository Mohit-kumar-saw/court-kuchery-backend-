const redisClient = require("./redisClient");

const acquireLock = async (key, ttl = 60) => {
  const result = await redisClient.set(key, "locked", {
    NX: true,
    EX: ttl,
  });
  return result === "OK";
};

const releaseLock = async (key) => {
  await redisClient.del(key);
};

module.exports = { acquireLock, releaseLock };
