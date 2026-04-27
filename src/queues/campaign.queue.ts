import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import type { CampaignJobPayload } from "../types/queue.types";

/**
 * The BullMQ queue for campaign message delivery.
 *
 * Default job options:
 *   - 3 attempts with exponential backoff (5s → 25s → 125s)
 *   - Keep last 100 completed and 200 failed jobs in Redis for dashboard stats
 */
export const campaignQueue = new Queue<CampaignJobPayload>("campaigns", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});
