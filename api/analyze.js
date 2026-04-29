import { createClient } from '@supabase/supabase-js';

// ── Upstash rate limit helper ──────────────────────
// Uses REST API directly — no SDK needed
async function checkRateLimit(userId, plan) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true }; // skip if not configured

  // Per-plan limits: requests per minute
  const rpm = plan === 'pro' ? 30 : plan === 'plus' ? 20 : 10;
  const key = `ratelimit:${userId}`;
  const now  = Math.floor(Date.now() / 1000);
  const win  = 60; // 60 second window

  try {
    // Increment counter with 60s expiry
    const incrRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, win]
      ])
    });
    const [incrData] = await incrRes.json();
    const count = incrData?.result ?? 1;

    if (count > rpm) {
      return { allowed: false, limit: rpm, current: count, retryAfter: win };
    }
    return { allowed: true, limit: rpm, current: count };
  } catch(e) {
    // If Upstash is down, fail open — don't block users
    console.error('Upstash error:', e.message);
    return { allowed: true };
  }
}

const LIMITS = {
  free: { daily: 3,    monthly: null, chars: 1500 },
  plus: { daily: null, monthly: 120,  chars: 5000 },
  pro:  { daily: null, monthly: 600,  chars: 7500 }
};

const BASE_STRUCTURE = `Return ONLY a valid JSON object — no markdown, no code fences, no preamble. Use exactly this structure:
{
  "estimated_tokens": <integer>,
  "breakdown": [
    { "category": "<label>", "tokens": <integer>, "detail": "<one-line explanation>" }
  ],
  "cost_estimate_usd": <number with 5 decimal places>,
  "efficient_prompt": "<rewritten prompt>",
  "savings_percent": <integer 0-100>,
  "efficient_tokens": <integer>,
  "scores": {
    "clarity": <integer 1-10>,
    "conciseness": <integer 1-10>,
    "structure": <integer 1-10>,
    "specificity": <integer 1-10>
  },
  "score_notes": {
    "clarity": "<one sentence explaining the clarity score>",
    "conciseness": "<one sentence explaining the conciseness score>",
    "structure": "<one sentence explaining the structure score>",
    "specificity": "<one sentence explaining the specificity score>"
  },
  "reasons": [
    {
      "change": "<what specifically changed>",
      "principle": "<the prompt engineering principle behind this change>",
      "lesson": "<one actionable sentence the user can apply to future prompts>"
    }
  ]
}

Score definitions:
- clarity (1-10): How unambiguous and precise is the instruction? 10 = crystal clear, 1 = vague and confusing
- conciseness (1-10): How free of waste is it? 10 = no filler at all, 1 = extremely bloated
- structure (1-10): How logically organized is it? 10 = perfect flow, 1 = disorganized
- specificity (1-10): How well-defined is the expected output? 10 = exact format specified, 1 = no output guidance

Breakdown categories (only include relevant ones):
- "Core instruction" — the main task being asked
- "Background context" — explanatory context provided
- "System framing / role-setting" — persona or preamble
- "Examples / few-shot" — examples given
- "Constraints / rules" — do/don't rules
- "Output format spec" — formatting instructions
- "Redundancy / filler" — words that add no meaning
- "Politeness overhead" — courteous language with no semantic value

Pricing: $3 per 1,000,000 input tokens (claude-sonnet-4-5). Be precise.`;

const SYSTEM_PROMPTS = {
  fast: `You are a prompt efficiency expert. Perform a FAST, lightweight analysis — focus only on obvious waste. ${BASE_STRUCTURE}

For the efficient_prompt: make only surface-level edits — remove clear filler words, politeness overhead, and obvious redundancy. Do NOT restructure sentences or change the prompt's style. Aim for 10-25% token reduction. Keep changes minimal and safe.`,

  balanced: `You are a prompt efficiency expert. Perform a BALANCED analysis — trim waste and improve clarity without over-engineering. ${BASE_STRUCTURE}

For the efficient_prompt: remove filler, tighten phrasing, and consolidate redundant instructions. You may lightly restructure sentences for clarity but preserve the original intent and tone. Aim for 25-45% token reduction.`,

  deep: `You are a prompt efficiency expert. Perform a DEEP, thorough optimization — maximize token efficiency while preserving full semantic meaning. ${BASE_STRUCTURE}

For the efficient_prompt: completely restructure if needed. Eliminate all redundancy, merge overlapping instructions, convert verbose phrasing to precise directives, and strip any implicit assumptions that Claude already handles by default. Prioritize maximum compression without any loss of instruction quality. Aim for 45-70% token reduction. Provide detailed reasons explaining every significant change made.`
};

function getSystemPrompt(level, plan) {
  // Gate levels by plan
  if (plan === 'free') return SYSTEM_PROMPTS.fast;
  if (plan === 'plus') return level === 'balanced' ? SYSTEM_PROMPTS.balanced : SYSTEM_PROMPTS.fast;
  // Pro gets all three
  return SYSTEM_PROMPTS[level] || SYSTEM_PROMPTS.balanced;
}

async function analyzePrompt(prompt, apiKey, systemPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Analyze this prompt:\n\n' + prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Anthropic API error ' + res.status);
  }

  const data    = await res.json();
  const raw     = (data.content || []).map(c => c.text || '').join('');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

function checkRollingWindow(usedCount, startAt, windowDays) {
  const now            = new Date();
  const start          = startAt ? new Date(startAt) : null;
  const daysSinceStart = start ? (now - start) / (1000 * 60 * 60 * 24) : 999;
  const isExpired      = daysSinceStart >= windowDays;
  const currentUsed    = isExpired ? 0 : (usedCount || 0);
  return { currentUsed, isExpired, now };
}

function resetIn(startAt, windowDays) {
  const resetsAt  = new Date(new Date(startAt).getTime() + windowDays * 24 * 60 * 60 * 1000);
  const msUntil   = resetsAt - new Date();
  const days      = Math.floor(msUntil / (1000 * 60 * 60 * 24));
  const hours     = Math.floor((msUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins      = Math.ceil((msUntil % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_ANON_KEY;
  if (!anthropicKey || !supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server misconfiguration.' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session. Please log in again.' });

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('plan, analyses_today, last_analysis_at, analyses_this_period, period_start_at, pro_analyses_this_period, pro_period_start_at, deactivated')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) return res.status(500).json({ error: 'Could not load user profile.' });

  if (profile.deactivated) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  const plan    = profile.plan || 'free';

  // ── Upstash rate limit check ───────────────────────────────
  const rl = await checkRateLimit(user.id, plan);
  if (!rl.allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      message: `Too many requests. You can make up to ${rl.limit} analyses per minute. Please wait a moment and try again.`,
      retry_after: rl.retryAfter
    });
  }
  const prompts = req.body.prompts || (req.body.prompt ? [req.body.prompt] : []);

  if (!prompts.length) return res.status(400).json({ error: 'No prompt provided.' });
  if (plan !== 'pro' && prompts.length > 1) return res.status(403).json({ error: 'Batch analysis is a Pro feature.' });
  if (prompts.length > 15) return res.status(400).json({ error: 'Maximum 15 prompts per batch.' });

  for (const p of prompts) {
    if (!p || typeof p !== 'string' || p.trim().length === 0) return res.status(400).json({ error: 'One or more prompts are empty.' });
    const charLimit = LIMITS[plan]?.chars || 1500;
    if (p.length > charLimit) {
      return res.status(400).json({ error: `Prompts must be under ${charLimit.toLocaleString()} characters on your ${plan} plan.` });
    }
  }

  const batchSize = prompts.length;

  // ── FREE: rolling 24hr ─────────────────────────────────────
  if (plan === 'free') {
    const lastAt         = profile.last_analysis_at ? new Date(profile.last_analysis_at) : null;
    const hoursSinceLast = lastAt ? (new Date() - lastAt) / (1000 * 60 * 60) : 999;
    const usedToday      = hoursSinceLast >= 24 ? 0 : (profile.analyses_today || 0);

    if (usedToday >= LIMITS.free.daily) {
      const resetsAt = new Date(lastAt.getTime() + 24 * 60 * 60 * 1000);
      const mins     = Math.ceil((resetsAt - new Date()) / (1000 * 60));
      const h        = Math.floor(mins / 60);
      const m        = mins % 60;
      return res.status(403).json({ error: 'limit_reached', plan, used: usedToday, limit: LIMITS.free.daily, resets_in: h > 0 ? `${h}h ${m}m` : `${m}m` });
    }
  }

  // ── PLUS: rolling 30 days ──────────────────────────────────
  if (plan === 'plus') {
    const { currentUsed, isExpired } = checkRollingWindow(profile.analyses_this_period, profile.period_start_at, 30);
    if (currentUsed >= LIMITS.plus.monthly) {
      return res.status(403).json({ error: 'limit_reached', plan, used: currentUsed, limit: LIMITS.plus.monthly, resets_in: resetIn(profile.period_start_at, 30) });
    }
  }

  // ── PRO: rolling 30 days, fair use ~600 ───────────────────
  if (plan === 'pro') {
    const { currentUsed, isExpired } = checkRollingWindow(profile.pro_analyses_this_period, profile.pro_period_start_at, 30);
    if (currentUsed + batchSize > LIMITS.pro.monthly) {
      const remaining = Math.max(0, LIMITS.pro.monthly - currentUsed);
      return res.status(403).json({
        error: 'limit_reached', plan,
        used: currentUsed, limit: LIMITS.pro.monthly,
        remaining,
        resets_in: resetIn(profile.pro_period_start_at, 30)
      });
    }
  }

  // ── Run analysis (parallel for batch) ─────────────────────
  try {
    // Get optimization level from request — gate by plan
    const rawLevel = req.body.level || 'balanced';
    const allowedLevels = plan === 'free' ? ['fast']
      : plan === 'plus' ? ['fast', 'balanced']
      : ['fast', 'balanced', 'deep'];
    const level      = allowedLevels.includes(rawLevel) ? rawLevel : allowedLevels[allowedLevels.length - 1];
    const systemPrompt = getSystemPrompt(level, plan);

    const results = await Promise.all(prompts.map(p => analyzePrompt(p, anthropicKey, systemPrompt)));
    const now     = new Date();

    // ── Update usage counters ──────────────────────────────
    let updatePayload = {};

    if (plan === 'free') {
      const lastAt         = profile.last_analysis_at ? new Date(profile.last_analysis_at) : null;
      const hoursSinceLast = lastAt ? (now - lastAt) / (1000 * 60 * 60) : 999;
      const prevUsed       = hoursSinceLast >= 24 ? 0 : (profile.analyses_today || 0);
      updatePayload = { analyses_today: prevUsed + 1, last_analysis_at: now.toISOString() };
    }

    if (plan === 'plus') {
      const { currentUsed, isExpired } = checkRollingWindow(profile.analyses_this_period, profile.period_start_at, 30);
      updatePayload = {
        analyses_this_period: currentUsed + 1,
        period_start_at:      isExpired || !profile.period_start_at ? now.toISOString() : profile.period_start_at,
        last_analysis_at:     now.toISOString()
      };
    }

    if (plan === 'pro') {
      const { currentUsed, isExpired } = checkRollingWindow(profile.pro_analyses_this_period, profile.pro_period_start_at, 30);
      updatePayload = {
        pro_analyses_this_period: currentUsed + batchSize,
        pro_period_start_at:      isExpired || !profile.pro_period_start_at ? now.toISOString() : profile.pro_period_start_at,
        last_analysis_at:         now.toISOString()
      };
    }

    await supabase.from('users').update(updatePayload).eq('id', user.id);

    // ── Save to history for pro users ──────────────────────
    if (plan === 'pro') {
      const historyRows = results.map((r, i) => ({
        user_id:          user.id,
        prompt:           prompts[i],
        estimated_tokens: r.estimated_tokens,
        efficient_tokens: r.efficient_tokens,
        savings_percent:  r.savings_percent,
        efficient_prompt: r.efficient_prompt,
        cost_estimate_usd: r.cost_estimate_usd,
        saved:            false
      }));
      await supabase.from('prompt_history').insert(historyRows);
    }

    // ── Build usage summary ────────────────────────────────
    let usage = { plan };
    if (plan === 'free') {
      const newUsed = (updatePayload.analyses_today);
      usage = { plan, used: newUsed, limit: LIMITS.free.daily, remaining: Math.max(0, LIMITS.free.daily - newUsed), period: 'day' };
    }
    if (plan === 'plus') {
      const newUsed = updatePayload.analyses_this_period;
      usage = { plan, used: newUsed, limit: LIMITS.plus.monthly, remaining: Math.max(0, LIMITS.plus.monthly - newUsed), period: 'month' };
    }
    if (plan === 'pro') {
      const newUsed = updatePayload.pro_analyses_this_period;
      usage = { plan, used: newUsed, limit: LIMITS.pro.monthly, remaining: Math.max(0, LIMITS.pro.monthly - newUsed), period: 'month' };
    }

    // ── Restrict output by plan ────────────────────────────
    const processedResults = results.map((r, i) => {
      if (plan === 'free') {
        const firstSentence = (r.efficient_prompt || '').split(/(?<=[.!?])\s+/)[0] || (r.efficient_prompt || '').substring(0, 120);
        return { ...r, efficient_prompt: null, efficient_prompt_teaser: firstSentence, optimization_locked: true };
      }
      return { ...r, priority: plan === 'pro' };
    });

    // Single prompt returns object, batch returns array
    const responseData = batchSize === 1 ? processedResults[0] : processedResults;
    return res.status(200).json({ results: responseData, usage, batch: batchSize > 1, level });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
}
