# VPS Setup Guide — Hostinger KVM4 (PM2 + Caddy)

Backend: `api.whatsapp.techdr.in` → port `3001`

---

## Prerequisites

- SSH access to VPS as `root`
- Domain DNS managed (Hostinger or external)
- Git repository access

---

## Step 1 — Point DNS

In your DNS provider, add an **A record**:

| Name | Type | Value |
|---|---|---|
| `api.whatsapp.techdr.in` | A | `<VPS IP>` |

> Do this first. Caddy needs DNS to resolve before it can provision the SSL cert.

---

## Step 2 — Install Node 20 via nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
node -v  # should print v20.x.x
```

---

## Step 3 — Install PM2

```bash
npm install -g pm2
```

---

## Step 4 — Clone the Repository

```bash
cd /root
git clone <your-repo-url> whatsapp_bot_techDr
cd whatsapp_bot_techDr/backend
```

---

## Step 5 — Set Up Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in all production values:

```
PORT=3001
SUPABASE_URL=https://xmahhubtlnlmwhsgoahr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your_key>
WA_SESSION_BUCKET=whatsapp-sessions
FRONTEND_URL=https://whatsapp-bot-tech-dr.vercel.app
REDIS_URL=redis://default:<password>@shuttle.proxy.rlwy.net:59844
```

---

## Step 6 — Build the Backend

```bash
npm ci
npm run build
```

---

## Step 7 — Start with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

> Run the command printed by `pm2 startup` to enable auto-start on reboot.

Verify it's running:

```bash
pm2 status
pm2 logs whatsapp-bot-backend --lines 50
```

---

## Step 8 — Add Caddy Reverse Proxy

Append the contents of `Caddyfile.snippet` to the existing Caddyfile:

```bash
cat /root/whatsapp_bot_techDr/backend/Caddyfile.snippet >> /etc/caddy/Caddyfile
```

Validate and reload Caddy:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy will automatically provision an SSL cert for `api.whatsapp.techdr.in`.

Verify SSL is working:

```bash
curl -I https://api.whatsapp.techdr.in/health
```

---

## Step 9 — Update Frontend

In the **Vercel dashboard** for your frontend project:

1. Go to Settings → Environment Variables
2. Update `NEXT_PUBLIC_API_BASE_URL` to `https://api.whatsapp.techdr.in`
3. Redeploy the frontend

---

## Future Deploys

For subsequent code updates, just run:

```bash
cd /root/whatsapp_bot_techDr/backend
chmod +x deploy.sh   # first time only
./deploy.sh
```

---

## Useful Commands

```bash
# Check backend status
pm2 status

# View logs
pm2 logs whatsapp-bot-backend

# Restart manually
pm2 restart whatsapp-bot-backend

# Check Caddy status
systemctl status caddy

# View Caddy logs
journalctl -u caddy -n 50

# Check port 3001 is listening
ss -tlnp | grep 3001
```
