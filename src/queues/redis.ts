import IORedis from "ioredis";

/**
 * Shared IORedis connection used by the BullMQ queue, worker, and scheduler.
 * maxRetriesPerRequest: null is required by BullMQ.
 */
export const redisConnection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  }
);

redisConnection.on("connect", () => console.log("[Redis] Connected."));
redisConnection.on("error", (err) => console.error("[Redis] Error:", err.message));
