import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { campaignQueue } from "../queues/campaign.queue";
import { syncCampaignJobs, removeCampaignJobs } from "../queues/scheduler";
import type { Campaign } from "../types/database";
import type { CampaignJobPayload } from "../types/queue.types";

export const campaignsRouter = Router();

// GET /api/campaigns
campaignsRouter.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("campaigns")
    .select("*, templates(name), campaign_clients(client_id, send_day_override, send_time_override, bullmq_job_id)")
    .order("created_at", { ascending: false });

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/campaigns
campaignsRouter.post("/", async (req: Request, res: Response) => {
  const {
    name,
    template_id,
    send_day,
    send_time,
    frequency = "monthly",
    status = "draft",
    clients = [],
  } = req.body as {
    name?: string;
    template_id?: string;
    send_day?: number;
    send_time?: string;
    frequency?: string;
    status?: string;
    clients?: Array<{
      client_id: string;
      send_day_override?: number;
      send_time_override?: string;
    }>;
  };

  if (!name || !template_id || !send_day || !send_time) {
    return void res
      .status(400)
      .json({ error: "name, template_id, send_day, and send_time are required." });
  }

  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .insert({ name, template_id, send_day, send_time, frequency, status })
    .select()
    .single();

  if (campaignErr || !campaign) {
    return void res.status(500).json({ error: campaignErr?.message });
  }

  if (clients.length > 0) {
    const rows = clients.map((c) => ({
      campaign_id: (campaign as Campaign).id,
      client_id: c.client_id,
      send_day_override: c.send_day_override ?? null,
      send_time_override: c.send_time_override ?? null,
      bullmq_job_id: null,
    }));

    const { error: junctionErr } = await supabase
      .from("campaign_clients")
      .insert(rows);

    if (junctionErr) {
      return void res.status(500).json({ error: junctionErr.message });
    }
  }

  if (status === "active") {
    await syncCampaignJobs((campaign as Campaign).id);
  }

  res.status(201).json({ data: campaign as Campaign });
});

// PATCH /api/campaigns/:id
campaignsRouter.patch("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const { data, error } = await supabase
    .from("campaigns")
    .update(req.body)
    .eq("id", id)
    .select()
    .single();

  if (error) return void res.status(500).json({ error: error.message });

  await syncCampaignJobs(id);

  res.json({ data: data as Campaign });
});

// POST /api/campaigns/:id/sync-jobs
campaignsRouter.post("/:id/sync-jobs", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const count = await syncCampaignJobs(id);
    res.json({ data: { synced: count } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync jobs.";
    res.status(500).json({ error: message });
  }
});

// POST /api/campaigns/:id/send-now  (one-off immediate send for all active clients)
campaignsRouter.post("/:id/send-now", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const { data: rows, error } = await supabase
    .from("campaign_clients")
    .select("client_id, clients!inner(status, is_deleted)")
    .eq("campaign_id", id);

  if (error) return void res.status(500).json({ error: error.message });

  type RowWithClient = { client_id: string; clients: { status: string; is_deleted: boolean } };

  const eligible = (rows as unknown as RowWithClient[]).filter(
    (row) => row.clients.status === "active" && !row.clients.is_deleted
  );

  if (eligible.length === 0) {
    return void res
      .status(400)
      .json({ error: "No active clients found for this campaign." });
  }

  const jobs = eligible.map((row) => ({
    name: "send-message",
    data: { campaignId: id, clientId: row.client_id } as CampaignJobPayload,
  }));

  await campaignQueue.addBulk(jobs);

  res.json({ data: { queued: jobs.length } });
});

// DELETE /api/campaigns/:id
campaignsRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  await removeCampaignJobs(id);

  const { error } = await supabase.from("campaigns").delete().eq("id", id);

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data: { id, deleted: true } });
});
