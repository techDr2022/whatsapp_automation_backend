import { Worker, Job } from "bullmq";
import { redisConnection } from "./redis";
import { supabase } from "../lib/supabase";
import { renderTemplate } from "../lib/template.renderer";
import { sendTextMessage } from "../whatsapp/message.service";
import type { CampaignJobPayload } from "../types/queue.types";
import type { Client } from "../types/database";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Processor
// ─────────────────────────────────────────────────────────────────────────────

async function processJob(job: Job<CampaignJobPayload>): Promise<void> {
  const { campaignId, clientId } = job.data;

  // 1. Fetch campaign with its template
  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .select("*, templates(*)")
    .eq("id", campaignId)
    .single();

  if (campaignErr || !campaign) {
    throw new Error(`Campaign ${campaignId} not found: ${campaignErr?.message}`);
  }

  // 2. Fetch client
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientErr || !client) {
    throw new Error(`Client ${clientId} not found: ${clientErr?.message}`);
  }

  // 3. Skip paused or deleted clients without marking as failed
  if (client.is_deleted || client.status === "paused") {
    console.log(`[worker] Skipping client ${clientId} (status: ${client.status})`);
    return;
  }

  // 4. Render template
  const template = (campaign as unknown as { templates: { body: string } }).templates;
  const renderedMessage = renderTemplate(template.body, client as unknown as Client);

  // 5. Send via Baileys
  await sendTextMessage(client.group_jid, renderedMessage);

  // 6. Log success
  await supabase.from("message_logs").insert({
    bullmq_job_id: job.id ?? null,
    client_id: clientId,
    campaign_id: campaignId,
    group_jid: client.group_jid,
    rendered_message: renderedMessage,
    status: "sent",
    error_message: null,
  });

  console.log(`[worker] Sent to client ${clientId} (${client.name}) ✓`);

  // 7. Human-paced delay before the next job is picked up
  const delay = randomBetween(8_000, 15_000);
  await sleep(delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────────

export const campaignWorker = new Worker<CampaignJobPayload>(
  "campaigns",
  async (job) => {
    try {
      await processJob(job);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const maxAttempts = job.opts.attempts ?? 3;
      const isFinalAttempt = job.attemptsMade >= maxAttempts;

      if (isFinalAttempt) {
        // Write failure log only after all retry attempts are exhausted
        await supabase.from("message_logs").insert({
          bullmq_job_id: job.id ?? null,
          client_id: job.data.clientId,
          campaign_id: job.data.campaignId,
          group_jid: "",
          rendered_message: "",
          status: "failed",
          error_message: error.message,
        });

        console.error(
          `[worker] Job ${job.id} failed permanently for client ${job.data.clientId}:`,
          error.message
        );
      }

      throw error; // Let BullMQ handle retry backoff
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

campaignWorker.on("failed", (job, err) => {
  if (job) {
    console.error(`[worker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message);
  }
});
