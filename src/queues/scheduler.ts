import { campaignQueue } from "./campaign.queue";
import { supabase } from "../lib/supabase";
import type { Campaign, CampaignClient } from "../types/database";

type CampaignWithClients = Campaign & {
  campaign_clients: Pick<
    CampaignClient,
    "id" | "client_id" | "send_day_override" | "send_time_override" | "bullmq_job_id"
  >[];
};

const SCHEDULER_TIMEZONE = "Asia/Kolkata";

function buildCronPattern(day: number, istTime: string): string {
  const [hour = "0", minute = "0"] = istTime.split(":");
  return `${minute} ${hour} ${day} * *`;
}

function jobId(campaignId: string, clientId: string): string {
  return `campaign:${campaignId}:client:${clientId}`;
}

function formatISTFromEpoch(epochMs: number): string {
  const istDate = new Date(epochMs + 330 * 60 * 1000);
  return istDate.toISOString().replace("T", " ").slice(0, 19) + " IST";
}

// ─────────────────────────────────────────────────────────────────────────────
// Remove helpers
// ─────────────────────────────────────────────────────────────────────────────

async function removeJobByKey(repeatKey: string): Promise<void> {
  try {
    await campaignQueue.removeRepeatableByKey(repeatKey);
  } catch {
    // Key may no longer exist in Redis (e.g. after Redis flush)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Syncs BullMQ repeatable jobs for a single campaign.
 * - If campaign is not active: removes all existing jobs and returns.
 * - If active: removes stale jobs and registers fresh ones with the correct cron.
 * Also updates campaign_clients.bullmq_job_id with the new repeat key.
 */
export async function syncCampaignJobs(campaignId: string): Promise<number> {
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*, campaign_clients(*)")
    .eq("id", campaignId)
    .single();

  if (error || !campaign) {
    throw new Error(`Campaign ${campaignId} not found: ${error?.message}`);
  }

  const typed = campaign as unknown as CampaignWithClients;
  const campaignClients = typed.campaign_clients;

  // Remove all existing jobs for this campaign
  for (const cc of campaignClients) {
    if (cc.bullmq_job_id) {
      await removeJobByKey(cc.bullmq_job_id);
    }
  }

  if (typed.status !== "active") {
    console.log(`[scheduler] Campaign ${campaignId} is ${typed.status} — jobs removed.`);
    return 0;
  }

  let synced = 0;

  for (const cc of campaignClients) {
    const day = cc.send_day_override ?? typed.send_day;
    const time = (cc.send_time_override ?? typed.send_time) as string;
    const cron = buildCronPattern(day, time);
    const id = jobId(campaignId, cc.client_id);

    // Add repeatable job (BullMQ deduplicates by jobId).
    // Keep cron in IST and pass explicit timezone so behavior is environment-independent.
    await campaignQueue.add(
      "send-message",
      { campaignId, clientId: cc.client_id },
      {
        repeat: { pattern: cron, tz: SCHEDULER_TIMEZONE },
        jobId: id,
      }
    );

    // Retrieve the generated repeat key and persist it
    const repeatableJobs = await campaignQueue.getRepeatableJobs();
    const registered = repeatableJobs.find((j) => j.id === id);
    const nextRunMs = registered?.next ?? null;
    const nextRunUtc = nextRunMs ? new Date(nextRunMs).toISOString() : null;
    const nextRunIst = nextRunMs ? formatISTFromEpoch(nextRunMs) : null;

    await supabase
      .from("campaign_clients")
      .update({ bullmq_job_id: registered?.key ?? null })
      .eq("id", cc.id);

    console.log(
      `[scheduler] Registered job campaign=${campaignId} client=${cc.client_id} cron="${cron}" tz=${SCHEDULER_TIMEZONE} next_utc=${nextRunUtc ?? "n/a"} next_ist=${nextRunIst ?? "n/a"} key=${registered?.key ?? "n/a"}`,
    );

    synced++;
  }

  console.log(`[scheduler] Synced ${synced} job(s) for campaign ${campaignId}.`);
  return synced;
}

/**
 * Removes all BullMQ repeatable jobs for a campaign.
 */
export async function removeCampaignJobs(campaignId: string): Promise<void> {
  const { data: rows } = await supabase
    .from("campaign_clients")
    .select("bullmq_job_id")
    .eq("campaign_id", campaignId);

  for (const row of rows ?? []) {
    if (row.bullmq_job_id) await removeJobByKey(row.bullmq_job_id);
  }

  console.log(`[scheduler] Removed all jobs for campaign ${campaignId}.`);
}

/**
 * Removes all BullMQ repeatable jobs for a specific client across all campaigns.
 */
export async function removeClientJobs(clientId: string): Promise<void> {
  const { data: rows } = await supabase
    .from("campaign_clients")
    .select("bullmq_job_id")
    .eq("client_id", clientId);

  for (const row of rows ?? []) {
    if (row.bullmq_job_id) await removeJobByKey(row.bullmq_job_id);
  }

  console.log(`[scheduler] Removed all jobs for client ${clientId}.`);
}

/**
 * Called on server startup — syncs repeatable jobs for all active campaigns.
 * Safe to call on every restart; BullMQ deduplicates by jobId so no doubles.
 */
export async function syncCampaignsToQueue(): Promise<void> {
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "active");

  if (error) {
    console.error("[scheduler] Failed to fetch campaigns:", error.message);
    return;
  }

  const ids = (campaigns ?? []).map((c) => c.id);
  console.log(`[scheduler] Syncing ${ids.length} active campaign(s)…`);

  for (const id of ids) {
    await syncCampaignJobs(id);
  }

  console.log("[scheduler] Startup sync complete.");
}
