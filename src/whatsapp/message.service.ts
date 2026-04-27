import { getSocket } from "./baileys.manager";

/**
 * Sends a plain-text message to a WhatsApp group.
 *
 * Throws if the socket is not connected or if Baileys rejects the send
 * (e.g. the bot is no longer in the group). BullMQ handles retries at the
 * job level — no retry logic belongs here.
 */
export async function sendTextMessage(
  groupJid: string,
  text: string
): Promise<void> {
  const sock = getSocket();
  await sock.sendMessage(groupJid, { text });
}
