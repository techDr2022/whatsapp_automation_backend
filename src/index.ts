import "dotenv/config";
import express from "express";
import cors from "cors";

import { initWhatsApp } from "./whatsapp/baileys.manager";
import { syncCampaignsToQueue } from "./queues/scheduler";

// Import the worker so it starts listening on boot
import "./queues/campaign.worker";

import { whatsappRouter } from "./api/whatsapp.route";
import { clientsRouter } from "./api/clients.route";
import { templatesRouter } from "./api/templates.route";
import { campaignsRouter } from "./api/campaigns.route";
import { logsRouter } from "./api/logs.route";
import { queueRouter } from "./api/queue.route";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "*";

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/whatsapp",  whatsappRouter);
app.use("/api/clients",   clientsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/logs",      logsRouter);
app.use("/api/queue",     queueRouter);

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

// WA connects then scheduler syncs repeatable jobs — both non-blocking
initWhatsApp()
  .then(() => syncCampaignsToQueue())
  .catch((err: Error) => console.error("[startup]", err.message));
