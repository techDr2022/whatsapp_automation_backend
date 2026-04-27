import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { syncCampaignsToQueue, removeClientJobs } from "../queues/scheduler";
import type { Client } from "../types/database";

export const clientsRouter = Router();

// GET /api/clients
clientsRouter.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) return void res.status(500).json({ error: error.message });
  res.json({ data: data as Client[] });
});

// POST /api/clients
clientsRouter.post("/", async (req: Request, res: Response) => {
  const {
    name,
    business_name,
    group_jid,
    group_name,
    timezone,
  } = req.body as {
    name?: string;
    business_name?: string;
    group_jid?: string;
    group_name?: string;
    timezone?: string;
  };

  if (!name || !business_name || !group_jid) {
    return void res
      .status(400)
      .json({ error: "name, business_name, and group_jid are required." });
  }

  if (!group_jid.endsWith("@g.us")) {
    return void res.status(400).json({ error: "group_jid must end with @g.us" });
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ name, business_name, group_jid, group_name, timezone })
    .select()
    .single();

  if (error) {
    const isDuplicate = error.code === "23505";
    return void res.status(isDuplicate ? 409 : 500).json({ error: error.message });
  }

  res.status(201).json({ data: data as Client });
});

// PATCH /api/clients/:id
clientsRouter.patch("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const { data: existing, error: fetchErr } = await supabase
    .from("clients")
    .select("status")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (fetchErr || !existing) {
    return void res.status(404).json({ error: "Client not found." });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(req.body)
    .eq("id", id)
    .select()
    .single();

  if (error) return void res.status(500).json({ error: error.message });

  const existingStatus = (existing as { status: string }).status;
  const newStatus = (req.body as { status?: string }).status;

  if (newStatus && newStatus !== existingStatus) {
    if (newStatus === "paused" || newStatus === "needs_attention") {
      await removeClientJobs(id);
    } else if (newStatus === "active") {
      await syncCampaignsToQueue();
    }
  }

  res.json({ data: data as Client });
});

// DELETE /api/clients/:id  (soft delete)
clientsRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);

  const { error } = await supabase
    .from("clients")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) return void res.status(500).json({ error: error.message });

  await removeClientJobs(id);

  res.json({ data: { id, deleted: true } });
});
