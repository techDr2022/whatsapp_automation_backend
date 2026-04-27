import { Router, Request, Response } from "express";
import { getWAStatus } from "../whatsapp/baileys.manager";
import { fetchAllGroups } from "../whatsapp/group.service";

export const whatsappRouter = Router();

// GET /api/whatsapp/status
whatsappRouter.get("/status", (_req: Request, res: Response) => {
  const status = getWAStatus();
  res.json({ data: status });
});

// GET /api/whatsapp/groups
whatsappRouter.get("/groups", async (_req: Request, res: Response) => {
  try {
    const groups = await fetchAllGroups();
    res.json({ data: groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isNotConnected = message.toLowerCase().includes("not initialised") ||
                           message.toLowerCase().includes("not connected");
    res.status(isNotConnected ? 503 : 500).json({ error: message });
  }
});
