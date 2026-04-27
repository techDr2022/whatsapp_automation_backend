import { Router, Request, Response } from "express";
import { campaignQueue } from "../queues/campaign.queue";

export const queueRouter = Router();
const SCHEDULER_TZ = "Asia/Kolkata";

function formatIST(epochMs: number): string {
  const istDate = new Date(epochMs + 330 * 60 * 1000);
  return istDate.toISOString().replace("T", " ").slice(0, 19) + " IST";
}

// GET /api/queue/status
queueRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const counts = await campaignQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed"
    );
    res.json({ data: counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get queue status.";
    res.status(500).json({ error: message });
  }
});

// GET /api/queue/repeatables
queueRouter.get("/repeatables", async (_req: Request, res: Response) => {
  try {
    const jobs = await campaignQueue.getRepeatableJobs();
    const data = jobs.map((job) => ({
      id: job.id ?? null,
      key: job.key,
      pattern: job.pattern ?? null,
      tz: SCHEDULER_TZ,
      nextUtc: job.next ? new Date(job.next).toISOString() : null,
      nextIst: job.next ? formatIST(job.next) : null,
      endDate: job.endDate ?? null,
    }));
    res.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get repeatable jobs.";
    res.status(500).json({ error: message });
  }
});
