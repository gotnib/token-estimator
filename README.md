# Prompt Token Estimator

A public-facing web app that analyzes prompts for token usage, cost, and efficiency — powered by Claude (Anthropic). Your API key lives securely on the server; users never see it.

---

## Project structure

```
token-estimator/
├── api/
│   └── analyze.js        ← Serverless function (your API key lives here, secretly)
├── public/
│   └── index.html        ← The frontend users see
├── vercel.json           ← Routing config
└── README.md
```

---

## Deploy to Vercel (free, ~5 minutes)

### Step 1 — Create a free Vercel account
Go to https://vercel.com and sign up (free tier is plenty for this).

### Step 2 — Install the Vercel CLI
Open your terminal and run:
```bash
npm install -g vercel
```

### Step 3 — Deploy
In your terminal, navigate to this folder and run:
```bash
cd token-estimator
vercel
```

Follow the prompts:
- "Set up and deploy?" → **Y**
- "Which scope?" → your username
- "Link to existing project?" → **N**
- "Project name?" → `token-estimator` (or anything you like)
- "In which directory is your code?" → `.` (just press Enter)
- "Want to override settings?" → **N**

Vercel will give you a live URL like `https://token-estimator-xyz.vercel.app`.

### Step 4 — Add your API key (the important part)
This is how your key stays secret. In the Vercel dashboard:

1. Go to https://vercel.com/dashboard
2. Click your project
3. Go to **Settings → Environment Variables**
4. Click **Add**
5. Set:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** your key starting with `sk-ant-...`
   - **Environment:** check Production, Preview, and Development
6. Click **Save**

### Step 5 — Redeploy to pick up the key
Back in your terminal:
```bash
vercel --prod
```

Your app is now live and public. The API key is stored in Vercel's encrypted environment — it never appears in your code or in the browser.

---

## How it works (the safe part explained)

```
User's browser
      │
      │  POST /api/analyze  { prompt: "..." }
      ▼
Vercel serverless function (api/analyze.js)
      │  — reads ANTHROPIC_API_KEY from environment (secret, server-only)
      │  — forwards request to Anthropic
      ▼
Anthropic API
      │
      ▼
Vercel function returns analysis JSON
      │
      ▼
User's browser renders the results
```

Users only ever talk to YOUR server. Your API key never leaves the server.

---

## Protecting yourself at scale

If your app goes viral, you could rack up API costs fast. Recommended steps:

1. **Set a spending limit** in the Anthropic Console:
   https://console.anthropic.com/settings/limits

2. **Add rate limiting** — the simplest option is Vercel's built-in Edge rate limiting
   (available on Pro plan), or use Upstash Redis for free-tier rate limiting:
   https://upstash.com

3. **Monitor usage** at https://console.anthropic.com/usage

---

## Updating the app
Make changes to your files, then run:
```bash
vercel --prod
```
That's it — live in seconds.
