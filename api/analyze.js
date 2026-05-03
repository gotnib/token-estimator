export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
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
  free: { daily: 5,    monthly: null, chars: 1500 },
  plus: { daily: null, monthly: 120,  chars: 5000 },
  pro:  { daily: null, monthly: 600,  chars: 7500 }
};

const BASE_STRUCTURE = `Return ONLY valid JSON, no markdown, no preamble:
{
  "estimated_tokens": <integer>,
  "breakdown": [{ "category": "<label>", "tokens": <integer>, "detail": "<brief explanation>" }],
  "cost_estimate_usd": <5 decimal places>,
  "efficient_prompt": "<rewritten prompt>",
  "savings_percent": <integer 0-100>,
  "efficient_tokens": <integer>,
  "scores": { "clarity": <1-10>, "conciseness": <1-10>, "structure": <1-10>, "specificity": <1-10> },
  "score_notes": { "clarity": "<10 words max>", "conciseness": "<10 words max>", "structure": "<10 words max>", "specificity": "<10 words max — if low, explain what is vague>" },
  "reasons": [{ "change": "<what changed>", "principle": "<principle name only, 5 words max>", "lesson": "<one actionable sentence>" }],
  "missing_context": ["<specific thing that would make this prompt more precise>"]
}

missing_context: 1-3 things the user could ADD to make the prompt significantly more effective. Examples: missing language or framework, no output format specified, no constraints given, no examples provided, ambiguous scope. Only include genuinely missing items. If already highly specific return empty array.
Scores: clarity=unambiguous instruction, conciseness=free of waste, structure=logical flow, specificity=output defined. If specificity below 7, score_notes.specificity must explain what is vague.
Categories: Core instruction, Background context, System framing, Examples, Constraints, Output format spec, Redundancy/filler, Politeness overhead.
Pricing: $3.00 per 1M input tokens (claude-sonnet-4-5). Max 3 breakdown items. Max 3 reasons. Max 3 missing_context items.`;

const SYSTEM_PROMPTS = {
  fast: `You are a prompt efficiency expert performing a FAST surface-level trim. ${BASE_STRUCTURE}

FAST rules — follow strictly:
- ONLY remove words that add zero meaning: please, could you, I was wondering, feel free to, as an AI, thank you, I hope this helps, etc.
- ONLY remove obvious duplicate phrases that say the same thing twice
- Do NOT restructure any sentences
- Do NOT reorder any content
- Do NOT change the vocabulary or writing style
- Do NOT combine separate instructions into one
- The output should look almost identical to the input — just shorter
- Target: 10-20% token reduction maximum
- If the prompt is already clean, savings_percent should be 0-5%`,

  balanced: `You are a prompt efficiency expert performing a BALANCED rewrite. ${BASE_STRUCTURE}

BALANCED rules — follow strictly:
- Remove all filler words and politeness overhead
- Consolidate redundant ideas that appear more than once
- Tighten verbose phrasing into direct language
- You MAY lightly restructure sentences for clarity
- You MAY reorder content if it improves logical flow
- Preserve all unique instructions and constraints — do not lose meaning
- The output should be noticeably shorter and cleaner but recognisably similar to the original
- Target: 30-50% token reduction
- Rewrite should feel like the same prompt, edited by a professional`,

  deep: `You are an expert code optimizer. The user has pasted code that they want improved.

Return ONLY valid JSON, no markdown, no preamble:
{
  "estimated_tokens": <integer — token count of the original code>,
  "breakdown": [{ "category": "<label>", "tokens": <integer>, "detail": "<brief explanation>" }],
  "cost_estimate_usd": <5 decimal places — cost to send this code as context at $3/1M tokens>,
  "efficient_prompt": "<the optimized, cleaned-up version of the code>",
  "savings_percent": <integer — token reduction from original to optimized>,
  "efficient_tokens": <integer>,
  "scores": { "clarity": <1-10>, "conciseness": <1-10>, "structure": <1-10>, "specificity": <1-10> },
  "score_notes": { "clarity": "<10 words — how readable is the code>", "conciseness": "<10 words — unnecessary verbosity>", "structure": "<10 words — organization and flow>", "specificity": "<10 words — type safety, naming precision>" },
  "reasons": [{ "change": "<what was changed>", "principle": "<clean code principle, 5 words max>", "lesson": "<one actionable sentence the user can apply>" }],
  "missing_context": []
}

Code optimization rules:
- Fix naming — variables and functions should be descriptive but concise
- Remove redundant comments that restate what the code obviously does
- Simplify logic — eliminate unnecessary intermediate variables
- Add error handling if obviously missing
- Improve structure — extract repeated logic, improve readability
- Do NOT change what the code does — only how it does it
- Do NOT add features that weren't asked for
- Preserve the original language and style conventions
- breakdown categories: Logic, Variable declarations, Comments, Error handling, Structure/formatting
- Pricing: $3.00 per 1M input tokens. Max 3 breakdown items. Max 3 reasons.`
};

function getSystemPrompt(level, plan, modelCfg) {
  const model = modelCfg || { label: 'Claude Sonnet', price: 3.00 };
  // Inject model-specific pricing into the prompt
  const pricingNote = `Pricing: $${model.price.toFixed(2)} per 1M input tokens (${model.label}). Be precise.`;
  const promptWithPricing = (p) => p.replace(
    /Pricing: \$[\d.]+ per 1M input tokens \([^)]+\)\. (Be precise|Max 3 breakdown items)[^`]*/,
    pricingNote + ' Max 3 breakdown items. Max 3 reasons. Max 3 missing_context items.'
  );

  if (plan === 'free') return promptWithPricing(SYSTEM_PROMPTS.fast);
  if (plan === 'plus') return promptWithPricing(level === 'balanced' ? SYSTEM_PROMPTS.balanced : SYSTEM_PROMPTS.fast);
  return promptWithPricing(SYSTEM_PROMPTS[level] || SYSTEM_PROMPTS.balanced);
}

async function analyzePrompt(prompt, apiKey, systemPrompt) {
  // Scale max_tokens with prompt length — longer prompts need more output tokens
  const promptLen = prompt.length;
  const maxTok = promptLen < 500 ? 1000 : promptLen < 1500 ? 1400 : 1800;

  // 25 second timeout — Vercel functions cut off at 30s
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTok,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Analyze this prompt:\n\n' + prompt }]
      })
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Anthropic API error ' + res.status);
    }

    const data    = await res.json();
    const raw     = (data.content || []).map(c => c.text || '').join('');
    const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  } catch(err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Analysis timed out. Try a shorter prompt or use Fast optimization level.');
    throw err;
  }
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

export const config = { maxDuration: 30 };

// Simple in-memory IP rate limit for demo — 1 per hour
const demoIpCache = new Map();
function isDemoRateLimited(ip) {
  const now = Date.now();
  const entry = demoIpCache.get(ip);
  if (entry && now - entry < 3600000) return true;
  demoIpCache.set(ip, now);
  if (demoIpCache.size > 10000) {
    for (const [k, v] of demoIpCache) {
      if (now - v > 3600000) demoIpCache.delete(k);
    }
  }
  return false;
}

const DEMO_SYSTEM = `You are a prompt efficiency expert. Analyze the given prompt and return ONLY valid JSON:
{
  "estimated_tokens": <integer>,
  "efficient_prompt": "<optimized version — remove filler, hedging, politeness overhead, redundancy. Use single quotes only in code.>",
  "savings_percent": <integer 0-100>,
  "efficient_tokens": <integer>
}
Return ONLY the JSON object, no markdown, no explanation.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Demo path — no auth required ──────────────────
  if (req.body?.demo === true) {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || 'unknown');

    if (isDemoRateLimited(ip)) {
      return res.status(429).json({ error: 'One demo per hour. Sign up free for unlimited access.' });
    }

    const prompt = (req.body.prompt || '').trim().slice(0, 500);
    if (prompt.length < 10) return res.status(400).json({ error: 'Prompt too short' });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 500, system: DEMO_SYSTEM, messages: [{ role: 'user', content: `Analyze:\n\n${prompt}` }] })
      });
      clearTimeout(timeout);
      if (!apiRes.ok) throw new Error('API error');
      const data = await apiRes.json();
      const raw  = (data.content || []).map(c => c.text || '').join('');
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let result;
      try { result = JSON.parse(cleaned); }
      catch(e) { const m = cleaned.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : null; }
      if (!result) throw new Error('Parse failed');
      return res.status(200).json({ result });
    } catch(err) {
      if (err.name === 'AbortError') return res.status(504).json({ error: 'Timed out — try a shorter prompt' });
      return res.status(500).json({ error: 'Analysis failed' });
    }
  }

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
    const rawModel = req.body.model || 'claude';
    const MODEL_PRICES = {
      claude: { label: 'Claude Sonnet', price: 3.00 },
      gpt4o:  { label: 'GPT-4o',        price: 2.50 },
      gemini: { label: 'Gemini Pro',    price: 1.25 },
      llama:  { label: 'Llama 70B',     price: 0.59 },
    };
    const modelCfg   = MODEL_PRICES[rawModel] || MODEL_PRICES.claude;
    const allowedLevels = plan === 'free' ? ['fast']
      : plan === 'plus' ? ['fast', 'balanced']
      : ['fast', 'balanced', 'deep'];
    const level      = allowedLevels.includes(rawLevel) ? rawLevel : allowedLevels[allowedLevels.length - 1];
    const systemPrompt = getSystemPrompt(level, plan, modelCfg);

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

      // Enforce 100 entry cap — delete oldest entries beyond the limit
      const { data: oldest } = await supabase
        .from('prompt_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('saved', false)
        .order('created_at', { ascending: true })
        .limit(1000);

      if (oldest && oldest.length > 100) {
        const toDelete = oldest.slice(0, oldest.length - 100).map(r => r.id);
        await supabase.from('prompt_history').delete().in('id', toDelete).eq('user_id', user.id);
      }
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
      return { ...r, priority: plan === 'pro' };
    });

    // Single prompt returns object, batch returns array
    const responseData = batchSize === 1 ? processedResults[0] : processedResults;
    return res.status(200).json({ results: responseData, usage, batch: batchSize > 1, level });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }
}
