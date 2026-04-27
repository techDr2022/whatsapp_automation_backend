# WhatsApp Marketing Automation Platform

### Product Requirements Document — v2.0.0 | April 2026 | Status: Draft

---

## Tech Stack

| Layer           | Technology               | Purpose                                       |
| --------------- | ------------------------ | --------------------------------------------- |
| Frontend        | Next.js 14 (App Router)  | Dashboard UI                                  |
| Backend         | Node.js + Express        | API server, WA bot process                    |
| Database        | Supabase (PostgreSQL)    | All persistent data + auth                    |
| Queue / Jobs    | BullMQ + Redis           | Campaign scheduling, job retry, rate limiting |
| WA Integration  | Baileys (@whiskeysocket) | WhatsApp Web protocol                         |
| Session Storage | Supabase Storage         | Baileys auth session persistence              |

---

## 1. Overview

### 1.1 Problem Statement

Marketing agencies managing multiple client WhatsApp groups currently send monthly messages manually — copy-pasting into each group one by one. This is time-consuming, error-prone, and does not scale beyond a handful of clients.

### 1.2 Solution

A centralised automation platform where the agency connects a single WhatsApp account via Baileys, links each client to their group, builds message templates, and schedules monthly campaigns. BullMQ manages all job scheduling and retry logic in Redis, ensuring reliable, rate-limited delivery with full logging in Supabase.

### 1.3 Goals

- Automate monthly WhatsApp group messaging to all active clients
- Use BullMQ + Redis for reliable, retryable, rate-limited job scheduling
- Use Supabase as the data layer for clients, templates, campaigns, and logs
- Provide a clean dashboard to manage clients, templates, and campaigns
- Minimise WhatsApp ban risk with human-paced, delayed delivery
- Support agency growth from 5 to 100+ clients without re-architecture

### 1.4 Non-Goals (v1)

- Two-way conversation handling or chatbot replies
- Multi-WhatsApp-account support
- Client-facing portal (agency-internal only)
- SMS or email fallback channels

---

## 2. User Stories

| ID    | As a...        | I want to...                                     | So that...                                      |
| ----- | -------------- | ------------------------------------------------ | ----------------------------------------------- |
| US-01 | Agency manager | Connect my WhatsApp via QR scan                  | The bot can send messages on my behalf          |
| US-02 | Agency manager | Add a client and link their WA group             | Messages go to the right group                  |
| US-03 | Agency manager | Create message templates with variables          | I can personalise messages per client type      |
| US-04 | Agency manager | Schedule a campaign to run monthly               | Messages send automatically without manual work |
| US-05 | Agency manager | See delivery logs per client                     | I know which sends succeeded or failed          |
| US-06 | Agency manager | Retry a failed message                           | No client is missed                             |
| US-07 | Agency manager | Pause a client                                   | Inactive clients do not receive messages        |
| US-08 | Agency manager | Preview a template with sample data              | I verify the message before scheduling          |
| US-09 | Agency manager | See the BullMQ job queue status on the dashboard | I can confirm upcoming sends are queued         |

---

## 3. Functional Requirements

### 3.1 WhatsApp Connection

- **FR-01** Bot connects via Baileys using WhatsApp Web QR scan
- **FR-02** Session persisted in Supabase Storage so reconnect does not require re-scan
- **FR-03** Connection status (connected / disconnected / reconnecting) exposed via API and shown in dashboard
- **FR-04** Auto-reconnect with exponential backoff on disconnect
- **FR-05** Baileys `group-participants.update` event caught — bot removal marks client as `needs_attention` in Supabase

### 3.2 Client Management

- **FR-06** CRUD operations for clients stored in Supabase `clients` table
- **FR-07** Each client stores: name, business name, business type, phone, group_jid, timezone, status (active/paused/needs_attention)
- **FR-08** Fetch all joined WA groups from Baileys via `groupFetchAllParticipating()` to populate group picker
- **FR-09** Prevent linking the same group JID to more than one client (`UNIQUE` constraint on `group_jid`)
- **FR-10** Soft-delete clients (`is_deleted` flag) to preserve logs
- **FR-11** Adding or pausing a client triggers a BullMQ job sync to add or remove that client's repeatable jobs from Redis

### 3.3 Template Management

- **FR-12** CRUD for message templates with a name, body text, and optional variable list
- **FR-13** Supported variables: `{client_name}`, `{business_name}`, `{month}`, `{custom_1}` through `{custom_3}`
- **FR-14** Template preview renders variables with sample data before save
- **FR-15** Templates are reusable across multiple campaigns

### 3.4 Campaign Management

- **FR-16** A campaign links one template to one or more clients
- **FR-17** Configurable schedule: `send_day` (1–28), `send_time` (HH:MM IST), `frequency` (monthly)
- **FR-18** Client-level overrides for `send_day` and `send_time` stored in `campaign_clients` junction table
- **FR-19** Campaign status: `active` / `paused` / `draft`
- **FR-20** Creating or updating a campaign calls `POST /api/campaigns/sync-jobs` which rebuilds all BullMQ repeatable jobs for that campaign
- **FR-21** Campaigns can be previewed showing which clients will receive messages and when

### 3.5 BullMQ Scheduler & Message Dispatch

- **FR-22** On server startup, `scheduler.js` reads all active campaigns from Supabase and registers one BullMQ repeatable job per client per campaign using a monthly cron pattern
- **FR-23** BullMQ repeatable jobs use the pattern: `minute hour day * *` (e.g. `0 9 1 * *` for 9 AM on the 1st)
- **FR-24** Each job payload contains: `campaignId`, `clientId` — worker resolves all other data from Supabase at run time
- **FR-25** BullMQ worker (`campaign.worker.js`) processes one job at a time using `concurrency: 1` to enforce sequential sends
- **FR-26** Between each job, a randomised delay of 4–8 seconds is applied via BullMQ's rate limiter to mimic human pacing
- **FR-27** Failed jobs are retried up to 3 times with exponential backoff (5s → 25s → 125s) before moving to the failed queue
- **FR-28** Messages sent via Baileys `sock.sendMessage(group_jid, { text: renderedMessage })`
- **FR-29** Each send result written to Supabase `message_logs` including the BullMQ job ID for traceability

### 3.6 Logging & Monitoring

- **FR-30** `message_logs` records: client, campaign, group_jid, rendered message, status, sent_at, error, bullmq_job_id
- **FR-31** Dashboard shows recent activity feed, failed-send alert banners, and BullMQ queue depth
- **FR-32** Manual retry action for failed sends triggers a new BullMQ job via `POST /api/logs/:id/retry`
- **FR-33** Stats on dashboard: active clients, messages sent this month, next batch date, failure count, jobs in queue

---

## 4. Supabase Database Schema

### 4.1 Tables

#### `clients`

| Column        | Type        | Notes                               |
| ------------- | ----------- | ----------------------------------- |
| id            | uuid (PK)   | gen_random_uuid()                   |
| name          | text        | Client contact name                 |
| business_name | text        | Business or clinic name             |
| business_type | text        | e.g. Dental, Auto, Bakery           |
| phone         | text        | Contact number (reference only)     |
| group_jid     | text UNIQUE | WhatsApp group JID — @g.us suffix   |
| group_name    | text        | WA group display name (cached)      |
| timezone      | text        | Default: Asia/Kolkata               |
| status        | text        | active \| paused \| needs_attention |
| is_deleted    | boolean     | Soft delete flag                    |
| created_at    | timestamptz | Auto                                |

#### `templates`

| Column     | Type        | Notes                                     |
| ---------- | ----------- | ----------------------------------------- |
| id         | uuid (PK)   |                                           |
| name       | text        | Internal label e.g. Review Reminder       |
| body       | text        | Message text with {variable} placeholders |
| variables  | jsonb       | Array of variable names used              |
| created_at | timestamptz | Auto                                      |

#### `campaigns`

| Column      | Type        | Notes                                    |
| ----------- | ----------- | ---------------------------------------- |
| id          | uuid (PK)   |                                          |
| name        | text        | Campaign label                           |
| template_id | uuid (FK)   | References templates.id                  |
| send_day    | int2        | Day of month 1–28                        |
| send_time   | time        | HH:MM in IST (converted to UTC for cron) |
| frequency   | text        | monthly (only option in v1)              |
| status      | text        | active \| paused \| draft                |
| created_at  | timestamptz | Auto                                     |

#### `campaign_clients` (junction)

| Column             | Type      | Notes                                                 |
| ------------------ | --------- | ----------------------------------------------------- |
| id                 | uuid (PK) |                                                       |
| campaign_id        | uuid (FK) | References campaigns.id                               |
| client_id          | uuid (FK) | References clients.id                                 |
| send_day_override  | int2 NULL | Overrides campaign send_day for this client           |
| send_time_override | time NULL | Overrides campaign send_time for this client          |
| bullmq_job_id      | text NULL | Repeatable job key stored for removal on pause/delete |

#### `message_logs`

| Column           | Type        | Notes                                 |
| ---------------- | ----------- | ------------------------------------- |
| id               | uuid (PK)   |                                       |
| bullmq_job_id    | text        | BullMQ job ID for traceability        |
| client_id        | uuid (FK)   |                                       |
| campaign_id      | uuid (FK)   |                                       |
| group_jid        | text        | Snapshot of group JID at time of send |
| rendered_message | text        | Final message that was sent           |
| status           | text        | sent \| failed                        |
| error_message    | text NULL   | Baileys or BullMQ error if failed     |
| sent_at          | timestamptz | Actual send timestamp                 |

> **Note:** The `pending_sends` table used in v1 (pg_cron approach) has been removed. Redis / BullMQ owns the queue entirely. Supabase only stores final `message_logs` results.

### 4.2 Redis Data (BullMQ — not in Supabase)

| Key Pattern                  | Type       | Contents                                                     |
| ---------------------------- | ---------- | ------------------------------------------------------------ |
| `bull:campaigns:repeat:*`    | Sorted Set | BullMQ repeatable job registry (one per client per campaign) |
| `bull:campaigns:delayed:*`   | Sorted Set | Upcoming scheduled jobs pending execution                    |
| `bull:campaigns:active:*`    | List       | Jobs currently being processed by the worker                 |
| `bull:campaigns:failed:*`    | List       | Jobs that exhausted all retry attempts                       |
| `bull:campaigns:completed:*` | List       | Last 100 completed jobs (for dashboard stats)                |

---

## 5. BullMQ Architecture

### 5.1 Queue & Worker Design

| Component | File                        | Responsibility                                                                                             |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Queue     | `queues/campaign.queue.js`  | Defines the campaigns queue, default job options (3 attempts, exponential backoff)                         |
| Scheduler | `queues/scheduler.js`       | On startup: reads Supabase, registers repeatable BullMQ jobs. Called again on campaign create/update/pause |
| Worker    | `queues/campaign.worker.js` | Processes jobs one at a time (concurrency: 1), renders template, calls Baileys, writes to message_logs     |
| Redis     | `queues/redis.js`           | Shared IORedis connection used by queue, worker, and scheduler                                             |

### 5.2 Repeatable Job Cron Pattern

```
send_day=1,  send_time=09:00 IST (03:30 UTC)  =>  cron: '30 3 1 * *'
send_day=15, send_time=10:00 IST (04:30 UTC)  =>  cron: '30 4 15 * *'

JobId:          'campaign:{campaignId}:client:{clientId}'
Remove a job:   queue.removeRepeatableByKey(bullmq_job_id)
```

> Using a deterministic `jobId` ensures that re-registering the same job on restart is a no-op — no duplicates.

### 5.3 Job Lifecycle

| State     | Meaning                   | Action                                                             |
| --------- | ------------------------- | ------------------------------------------------------------------ |
| waiting   | Scheduled, not yet due    | Held in Redis delayed set                                          |
| active    | Being processed by worker | Template rendered, Baileys send called                             |
| completed | Send successful           | message_logs row written with status=sent                          |
| failed    | All 3 attempts exhausted  | message_logs row written with status=failed, dashboard alert shown |
| delayed   | Waiting for retry backoff | 5s / 25s / 125s before next attempt                                |

### 5.4 Rate Limiting

```js
// queues/campaign.worker.js
const worker = new Worker("campaigns", processor, {
  connection: redisConnection,
  concurrency: 1,
  limiter: {
    max: 1,
    duration: randomBetween(4000, 8000), // 4–8 seconds between sends
  },
});
```

### 5.5 Key Files

```js
// queues/campaign.queue.js
const campaignQueue = new Queue("campaigns", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// queues/scheduler.js — called on startup + after campaign changes
async function syncCampaignsToQueue() {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(
      "*, campaign_clients(client_id, send_day_override, send_time_override)",
    )
    .eq("status", "active");

  for (const campaign of campaigns) {
    for (const cc of campaign.campaign_clients) {
      const day = cc.send_day_override ?? campaign.send_day;
      const time = cc.send_time_override ?? campaign.send_time; // "09:00" IST
      const [hour, minute] = convertISTtoUTC(time).split(":");

      await campaignQueue.add(
        "send-message",
        { campaignId: campaign.id, clientId: cc.client_id },
        {
          repeat: { pattern: `${minute} ${hour} ${day} * *` },
          jobId: `campaign:${campaign.id}:client:${cc.client_id}`,
        },
      );
    }
  }
}
```

---

## 6. API Design

| Method | Endpoint                     | Description                                                   |
| ------ | ---------------------------- | ------------------------------------------------------------- |
| GET    | /api/whatsapp/status         | WA connection status + QR data URL if disconnected            |
| GET    | /api/whatsapp/groups         | All WA groups the bot has joined (live from Baileys)          |
| GET    | /api/clients                 | List all clients                                              |
| POST   | /api/clients                 | Create client, link group, register BullMQ jobs               |
| PATCH  | /api/clients/:id             | Update client or toggle status (pause removes BullMQ jobs)    |
| DELETE | /api/clients/:id             | Soft delete client, remove BullMQ jobs                        |
| GET    | /api/templates               | List all templates                                            |
| POST   | /api/templates               | Create template                                               |
| PUT    | /api/templates/:id           | Update template                                               |
| GET    | /api/campaigns               | List campaigns                                                |
| POST   | /api/campaigns               | Create campaign + assign clients + register BullMQ jobs       |
| PATCH  | /api/campaigns/:id           | Update schedule or status, resync BullMQ jobs                 |
| POST   | /api/campaigns/:id/sync-jobs | Rebuild all BullMQ repeatable jobs for a campaign             |
| GET    | /api/queue/status            | BullMQ queue depth: waiting, active, failed, completed counts |
| GET    | /api/logs                    | Message logs with filter (client / status / date)             |
| POST   | /api/logs/:id/retry          | Add a new BullMQ job to retry a specific failed send          |
| POST   | /api/campaigns/:id/send-now  | Immediately queue a one-off send to all campaign clients      |

---

## 7. Frontend Pages (Next.js 14)

| Route      | Page             | Key Components                                                            |
| ---------- | ---------------- | ------------------------------------------------------------------------- |
| /          | Dashboard        | Stat cards (incl. queue depth), activity feed, next campaign preview      |
| /clients   | Client List      | Expandable rows, Add Client modal (3-step), pause/resume                  |
| /templates | Template Library | Cards with preview, variable highlighting, CRUD                           |
| /campaigns | Campaign Manager | Campaign cards, client assignment, schedule config, sync-jobs button      |
| /logs      | Message Logs     | Filterable table, BullMQ job ID column, failed-send alerts, retry button  |
| /settings  | Settings         | WA connection QR, agency name, default send time, Redis connection status |

---

## 8. System Architecture

### 8.1 Folder Structure

```
backend/
  src/
    whatsapp/
      baileys.manager.js      — Connection, QR, reconnect, session load
      group.service.js        — groupFetchAllParticipating()
      message.service.js      — sendMessage() wrapper
    queues/                   ← BullMQ layer
      redis.js                — Shared IORedis connection
      campaign.queue.js       — Queue definition + default job options
      campaign.worker.js      — Worker: render template → send → log
      scheduler.js            — Register/remove repeatable jobs from Supabase
    api/
      clients.route.js
      campaigns.route.js
      templates.route.js
      logs.route.js
      queue.route.js          — Queue status endpoint
      whatsapp.route.js
    supabase.js               — Supabase client init
    index.js                  — Express app + startup job sync

frontend/
  app/
    dashboard/page.jsx
    clients/page.jsx
    templates/page.jsx
    campaigns/page.jsx
    logs/page.jsx
    settings/page.jsx
  components/
    AddClientModal.jsx        — 3-step wizard
    TemplatePreview.jsx
    WAStatusBadge.jsx
    QueueStatusCard.jsx       — BullMQ job counts
  lib/
    supabase.js               — Supabase browser client
    api.js                    — Backend API calls
```

### 8.2 Architecture Diagram

```
┌─────────────────────────────────────────────┐
│             Next.js Frontend                 │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│           Node.js + Express                  │
│                                              │
│  ┌─────────────┐    ┌──────────────────────┐ │
│  │   Baileys   │    │   BullMQ Scheduler   │ │
│  │  WA Manager │    │  campaign.queue.js   │ │
│  └──────┬──────┘    │  campaign.worker.js  │ │
│         │           │  scheduler.js        │ │
│         │           └──────────┬───────────┘ │
└─────────┼──────────────────────┼─────────────┘
          │                      │
          │              ┌───────▼────────┐
          │              │  Redis (BullMQ) │
          │              │  repeatable    │
          │              │  delayed       │
          │              │  active/failed │
          │              └────────────────┘
          │
┌─────────▼──────────────────────────────────┐
│            Supabase (PostgreSQL)            │
│  clients, templates, campaigns,             │
│  campaign_clients, message_logs             │
└─────────────────────────────────────────────┘
```

### 8.3 Message Dispatch Flow

| Step | Who                   | Action                                                                                         |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Node.js startup       | `scheduler.js` reads active campaigns from Supabase, registers repeatable BullMQ jobs in Redis |
| 2    | Redis (BullMQ)        | Holds repeatable jobs; promotes due jobs to the waiting queue at the scheduled cron time       |
| 3    | campaign.worker.js    | Picks up the job, fetches client + campaign data from Supabase                                 |
| 4    | message.service.js    | Renders template: replaces {variables} with client data                                        |
| 5    | Baileys               | `sock.sendMessage(group_jid, { text: renderedMessage })`                                       |
| 6    | campaign.worker.js    | BullMQ rate limiter waits random 4–8 seconds before next job                                   |
| 7    | campaign.worker.js    | Repeats for next client job in the queue                                                       |
| 8    | Supabase message_logs | Worker writes status, timestamp, bullmq_job_id, rendered message                               |
| 9    | BullMQ (on failure)   | Job moved to delayed queue for retry (up to 3 attempts with exponential backoff)               |
| 10   | Dashboard             | Fetches `/api/queue/status` + `/api/logs` to show live results                                 |

---

## 9. Risks & Mitigations

| Risk                                | Likelihood | Impact | Mitigation                                                                                                   |
| ----------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| WhatsApp bans the bot number        | Medium     | High   | 4–8s BullMQ rate limiter between sends, dedicated number, concurrency: 1                                     |
| Bot removed from a group            | Low        | Medium | Baileys group event caught, client flagged needs_attention, BullMQ job removed                               |
| Redis goes down / jobs lost         | Low        | High   | Use Redis persistence (AOF), or managed Redis (Upstash). On restart, scheduler.js resyncs jobs from Supabase |
| Duplicate jobs on restart           | Low        | Medium | BullMQ repeatable jobs use deterministic jobId — adding the same ID is a no-op                               |
| Session expires requiring re-scan   | Medium     | Low    | Baileys auth state stored in Supabase Storage, auto-reloaded on startup                                      |
| Group JID changes (group recreated) | Low        | Medium | Re-link flow in dashboard, bot removal event triggers needs_attention alert                                  |
| Message with broken variables sent  | Low        | High   | Template preview is a mandatory step in campaign creation UI                                                 |
| Worker crashes mid-send             | Low        | Medium | BullMQ marks job as failed, retries automatically up to 3 times                                              |

---

## 10. Development Milestones

| Phase                         | Duration | Deliverable                                                                      |
| ----------------------------- | -------- | -------------------------------------------------------------------------------- |
| Phase 1 — Foundation          | Week 1   | Supabase schema, Redis setup, Baileys connection, QR scan UI, group fetch API    |
| Phase 2 — Client & Templates  | Week 1–2 | Add Client 3-step modal, template builder, variable preview                      |
| Phase 3 — BullMQ Scheduler    | Week 2   | campaign.queue.js, campaign.worker.js, scheduler.js, repeatable job registration |
| Phase 4 — Campaign Management | Week 2   | Campaign CRUD, sync-jobs API, pause/resume job lifecycle, send-now               |
| Phase 5 — Dashboard & Logs    | Week 2–3 | All dashboard pages, queue status card, logs table, retry flow                   |
| Phase 6 — Hardening           | Week 3   | Redis persistence, reconnect logic, error alerts, idempotency checks, edge cases |

---

## 11. Success Metrics

- Message delivery rate >= 98% for active clients per monthly cycle
- Zero manual sends required after platform launch
- Time to add a new client under 3 minutes
- Zero WhatsApp bans in first 90 days of operation
- All failed BullMQ jobs retried and resolved within 10 minutes of failure
- Dashboard load time under 1.5 seconds
- Zero job loss on Node.js restart (verified by scheduler resync)

---

_— End of Document —_
