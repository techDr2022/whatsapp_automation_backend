import { Router, Request, Response } from "express";
import {
  getWAStatus,
  logoutWhatsApp,
  startWhatsAppLogin,
} from "../whatsapp/baileys.manager";
import { fetchAllGroups } from "../whatsapp/group.service";

export const whatsappRouter = Router();

// GET /api/whatsapp/status
whatsappRouter.get("/status", (_req: Request, res: Response) => {
  const status = getWAStatus();
  res.json({ data: status });
});

// POST /api/whatsapp/login
whatsappRouter.post("/login", async (_req: Request, res: Response) => {
  try {
    const status = await startWhatsAppLogin();
    res.json({
      message: "WhatsApp login started. Scan QR if required.",
      data: status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/whatsapp/logout
whatsappRouter.post("/logout", async (_req: Request, res: Response) => {
  try {
    await logoutWhatsApp();
    res.json({
      message: "Logged out successfully. You can now link a new WhatsApp account.",
      data: getWAStatus(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
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
