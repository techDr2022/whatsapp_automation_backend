import { getSocket } from "./baileys.manager";

export interface GroupInfo {
  jid: string;
  name: string;
  participantCount: number;
}

/**
 * Returns all WhatsApp groups the bot account has joined.
 * Results are sorted alphabetically by name.
 */
export async function fetchAllGroups(): Promise<GroupInfo[]> {
  const sock = getSocket();

  const groupMap = await sock.groupFetchAllParticipating();

  return Object.values(groupMap)
    .map((group) => ({
      jid: group.id,
      name: group.subject,
      participantCount: group.participants.length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
