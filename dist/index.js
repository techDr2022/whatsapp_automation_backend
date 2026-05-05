"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const baileys_manager_1 = require("./whatsapp/baileys.manager");
const scheduler_1 = require("./queues/scheduler");
// Import the worker so it starts listening on boot
require("./queues/campaign.worker");
const whatsapp_route_1 = require("./api/whatsapp.route");
const clients_route_1 = require("./api/clients.route");
const templates_route_1 = require("./api/templates.route");
const campaigns_route_1 = require("./api/campaigns.route");
const logs_route_1 = require("./api/logs.route");
const queue_route_1 = require("./api/queue.route");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT ?? 3001);
const FRONTEND_URL = process.env.FRONTEND_URL ?? "*";
// ── Middleware ────────────────────────────────────────────────────────────────
app.use((0, cors_1.default)({ origin: FRONTEND_URL, credentials: true }));
app.use(express_1.default.json());
// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/whatsapp", whatsapp_route_1.whatsappRouter);
app.use("/api/clients", clients_route_1.clientsRouter);
app.use("/api/templates", templates_route_1.templatesRouter);
app.use("/api/campaigns", campaigns_route_1.campaignsRouter);
app.use("/api/logs", logs_route_1.logsRouter);
app.use("/api/queue", queue_route_1.queueRouter);
// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
});
// WA connects then scheduler syncs repeatable jobs — both non-blocking
(0, baileys_manager_1.initWhatsApp)()
    .then(() => (0, scheduler_1.syncCampaignsToQueue)())
    .catch((err) => console.error("[startup]", err.message));
