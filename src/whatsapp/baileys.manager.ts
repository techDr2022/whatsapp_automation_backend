import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface WAStatus {
  status: ConnectionStatus;
  /** Base-64 PNG data URL shown while waiting for QR scan. Null when connected. */
  qrDataUrl: string | null;
  account: {
    jid: string;
    phone: string;
    pushName: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module state (singleton)
// ─────────────────────────────────────────────────────────────────────────────

let socket: WASocket | null = null;
let waStatus: WAStatus = { status: "disconnected", qrDataUrl: null, account: null };
let reconnectAttempts = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the active Baileys socket.
 * Throws if the socket hasn't been initialised or the connection is closed.
 */
export function getSocket(): WASocket {
  if (!socket) {
    throw new Error(
      "WhatsApp socket is not initialised. Call initWhatsApp() first.",
    );
  }
  return socket;
}

/** Returns the current connection status and QR data URL (if scanning). */
export function getWAStatus(): WAStatus {
  return { ...waStatus };
}

/**
 * Initialises the WhatsApp connection.
 * Loads the Baileys session from Supabase Storage and auto-reconnects on disconnect.
 * Safe to call multiple times — subsequent calls are no-ops while connected.
 */
export async function initWhatsApp(): Promise<void> {
  // #region agent log
  fetch("http://127.0.0.1:7807/ingest/47cc6123-77ce-4c71-b25f-770fe771b490", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "6cf0c7",
    },
    body: JSON.stringify({
      sessionId: "6cf0c7",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "baileys.manager.ts:initWhatsApp:start",
      message: "initWhatsApp called",
      data: { reconnectAttempts, hasSocket: Boolean(socket) },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(
    `[WA] Baileys version: ${version.join(".")} (latest: ${isLatest})`,
  );

  socket = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: false,
  });

  // #region agent log
  fetch("http://127.0.0.1:7807/ingest/47cc6123-77ce-4c71-b25f-770fe771b490", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "6cf0c7",
    },
    body: JSON.stringify({
      sessionId: "6cf0c7",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "baileys.manager.ts:initWhatsApp:socket-created",
      message: "socket created with fetched version",
      data: { version, isLatest },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  // ── Connection state changes ──────────────────────────────────────────────
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

    // #region agent log
    fetch("http://127.0.0.1:7807/ingest/47cc6123-77ce-4c71-b25f-770fe771b490", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "6cf0c7",
      },
      body: JSON.stringify({
        sessionId: "6cf0c7",
        runId: "pre-fix",
        hypothesisId: "H3",
        location: "baileys.manager.ts:connection.update",
        message: "connection update received",
        data: {
          connection: connection ?? null,
          hasQr: Boolean(qr),
          statusCode: statusCode ?? null,
          currentStatus: waStatus.status,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (qr) {
      waStatus = {
        status: "connecting",
        qrDataUrl: await QRCode.toDataURL(qr),
        account: null,
      };
      console.log("[WA] QR code ready — open /api/whatsapp/status to scan.");
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      const jid = socket?.user?.id ?? "";
      const phone = jid ? jid.split(":")[0] : "";
      waStatus = {
        status: "connected",
        qrDataUrl: null,
        account: jid
          ? {
              jid,
              phone,
              pushName: socket?.user?.name ?? null,
            }
          : null,
      };
      console.log("[WA] Connected.");
    }

    if (connection === "close") {
      waStatus = { ...waStatus, status: "reconnecting", qrDataUrl: null, account: null };

      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const restartRequired = statusCode === DisconnectReason.restartRequired;

      // #region agent log
      fetch("http://127.0.0.1:7807/ingest/47cc6123-77ce-4c71-b25f-770fe771b490", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "6cf0c7",
        },
        body: JSON.stringify({
          sessionId: "6cf0c7",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "baileys.manager.ts:connection.close:branch",
          message: "close branch classification",
          data: { statusCode, loggedOut, restartRequired, reconnectAttempts },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      if (loggedOut) {
        waStatus = { status: "disconnected", qrDataUrl: null, account: null };
        console.warn(
          "[WA] Logged out. Delete session from Supabase Storage and restart.",
        );
        return;
      }

      if (restartRequired) {
        console.log("[WA] Restart required — reconnecting immediately.");
        void initWhatsApp();
        return;
      }

      reconnectAttempts += 1;
      const delayMs = Math.min(3000 * reconnectAttempts, 30_000);
      // #region agent log
      fetch("http://127.0.0.1:7807/ingest/47cc6123-77ce-4c71-b25f-770fe771b490", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "6cf0c7",
        },
        body: JSON.stringify({
          sessionId: "6cf0c7",
          runId: "pre-fix",
          hypothesisId: "H5",
          location: "baileys.manager.ts:connection.close:retry",
          message: "scheduled reconnect after close",
          data: { statusCode, reconnectAttempts, delayMs },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      console.log(
        `[WA] Disconnected (code ${statusCode}) — retrying in ${delayMs}ms (attempt ${reconnectAttempts})`,
      );

      setTimeout(() => void initWhatsApp(), delayMs);
    }
  });

  // ── Credential persistence ────────────────────────────────────────────────
  socket.ev.on("creds.update", saveCreds);

  // ── Group participant events ──────────────────────────────────────────────
  socket.ev.on("group-participants.update", async (event) => {
    if (event.action !== "remove") return;

    const botJid = socket?.user?.id;
    if (!botJid) return;

    // GroupParticipant has an `id` field (the JID). Strip the device suffix (:0, :1…) before comparing.
    const botNumber = botJid.split(":")[0];
    const botWasRemoved = event.participants.some(
      (p) => p.id === botJid || p.id.split(":")[0] === botNumber,
    );
    if (!botWasRemoved) return;

    const groupJid = event.id;
    console.warn(
      `[WA] Bot removed from group ${groupJid} — marking client as needs_attention.`,
    );

    const { error } = await supabase
      .from("clients")
      .update({ status: "needs_attention" })
      .eq("group_jid", groupJid)
      .eq("is_deleted", false);

    if (error) {
      console.error(
        `[WA] Failed to update client status for group ${groupJid}:`,
        error.message,
      );
    }
  });
}
