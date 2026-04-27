"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const qrcode_1 = __importDefault(require("qrcode"));
let reconnectAttempts = 0;
const WHATSAPP_VERSION = [2, 3000, 1035194821];
const connectToWhatsApp = async () => {
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)("auth_info_baileys");
    const sock = (0, baileys_1.default)({
        version: WHATSAPP_VERSION,
        auth: state,
        browser: baileys_1.Browsers.macOS("Desktop"),
        syncFullHistory: true,
    });
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrString = await qrcode_1.default.toString(qr, {
                type: "terminal",
                small: true,
            });
            console.log("Scan this QR in WhatsApp > Linked devices:\n");
            console.log(qrString);
        }
        if (connection === "open") {
            reconnectAttempts = 0;
            console.log("Opened connection");
        }
        else if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
            if (statusCode === 405) {
                console.log("Received 405 from WhatsApp");
                console.log(lastDisconnect?.error);
            }
            if (statusCode === baileys_1.DisconnectReason.restartRequired) {
                console.log("Restart required by WhatsApp, creating a new socket...");
                void connectToWhatsApp();
                return;
            }
            if (shouldReconnect) {
                reconnectAttempts += 1;
                const delayMs = Math.min(3000 * reconnectAttempts, 30000);
                console.log(`Reconnecting to WhatsApp in ${delayMs}ms`, lastDisconnect?.error);
                setTimeout(() => {
                    void connectToWhatsApp();
                }, delayMs);
            }
            else {
                console.log("Device logged out. Delete auth_info_baileys and relink.");
                console.log(lastDisconnect?.error);
            }
        }
    });
    sock.ev.on("creds.update", saveCreds);
};
void connectToWhatsApp();
