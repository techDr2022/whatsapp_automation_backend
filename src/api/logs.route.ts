import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { campaignQueue } from "../queues/campaign.queue";
import type { MessageLog } from "../types/database";
import type { CampaignJobPayload } from "../types/queue.types";

export const logsRouter = Router();

// GET /api/logs?client_id=&status=&from=&to=
logsRouter.get("/", async (req: Request, res: Response) => {
  const client_id = req.query.client_id ? String(req.query.client_id) : undefined;
  const status     = req.query.status    ? String(req.query.status)    : undefined;
  const from       = req.query.from      ? String(req.query.from)      : undefined;
  const to         = req.query.to        ? String(req.query.to)        : undefined;

  let query = supabase
    .from("message_logs")
    .select("*, clients(name, business_name), campaigns(name)")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (client_id) query = query.eq("client_id", client_id);
  if (status)    query = query.eq("status", status);
  if (from)      query = query.gte("sent_at", from);
  if (to)        query = query.lte("sent_at", to);

  const { data, error } = await query;

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/logs/:id/retry
logsRouter.post("/:id/retry", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const { data: log, error: fetchErr } = await supabase
    .from("message_logs")
    .select("client_id, campaign_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !log) {
    return void res.status(404).json({ error: "Log entry not found." });
  }

  const entry = log as Pick<MessageLog, "client_id" | "campaign_id" | "status">;

  if (entry.status !== "failed") {
    return void res
      .status(400)
      .json({ error: "Only failed log entries can be retried." });
  }

  const payload: CampaignJobPayload = {
    campaignId: entry.campaign_id,
    clientId: entry.client_id,
  };

  const job = await campaignQueue.add("send-message-retry", payload);

  res.json({ data: { jobId: job.id } });
});
