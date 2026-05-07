import { createClient } from '@supabase/supabase-js';

// ── Upstash rate limit helper ──────────────────────────────
async function checkRateLimit(userId, plan) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true };

  const rpm = plan === 'pro' ? 30 : plan === 'plus' ? 20 : 10;
  const key = `ratelimit:${userId}`;
  const win = 60;

  try {
    const incrRes = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, win]])
    });
    const [incrData] = await incrRes.json();
    const count = incrData?.result ?? 1;
    if (count > rpm) return { allowed: false, limit: rpm, current: count, retryAfter: win };
    return { allowed: true, limit: rpm, current: count };
  } catch(e) {
    console.error('Upstash rate limit error:', e.message);
    return { allowed: true };
  }
}

// ── Fix #3: Demo rate limit via Upstash (not in-memory) ───
async function checkDemoRateLimit(ip) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true }; // fail open if not configured

  const key = `demo:${ip}`;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3600]])
    });
    const [incrData] = await res.json();
    const count = incrData?.result ?? 1;
    return count > 1 ? { allowed: false } : { allowed: true };
  } catch(e) {
    console.error('Demo rate limit error:', e.message);
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
- Do NOT remove any specific requirements, constraints, or details — even if they seem redundant
- The output should look almost identical to the input — just shorter
- Target: 5-15% token reduction maximum. If the prompt has minimal filler, savings_percent should be 0-5%
- When in doubt about whether something is waste or content — keep it`,

  balanced: `You are a prompt efficiency expert performing a BALANCED rewrite. ${BASE_STRUCTURE}

BALANCED rules — follow strictly:
- Remove filler words and politeness overhead (please, could you, I was wondering, as an AI, etc.)
- Consolidate redundant ideas that appear more than once
- Tighten verbose phrasing into direct language
- You MAY lightly restructure sentences for clarity
- You MAY reorder content if it improves logical flow
- CRITICAL: Preserve ALL unique instructions, constraints, requirements, and specific details — never drop meaningful content to hit a token target
- CRITICAL: A well-written detailed prompt should only be trimmed of waste — do not compress it into a vague summary
- The output must be capable of producing the same result as the original when sent to an AI model
- Target: remove waste only. If the prompt has little waste, savings_percent may be 5-15%. Only reach 30-50% if there is genuine redundancy at that scale
- Rewrite should feel like the same prompt, edited by a professional — not a shorter version with less information`,

  deep: `You are a senior software engineer and code quality expert. Analyze the submitted code and return a structured quality report with an optimized version.

FIRST: Detect the programming language from syntax. Then apply language-specific best practices.

Return ONLY valid JSON, no markdown, no preamble:
{
  "language": "<detected language: Python, JavaScript, TypeScript, SQL, Bash, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin, or Other>",
  "estimated_tokens": <integer>,
  "efficient_tokens": <integer>,
  "savings_percent": <integer>,
  "cost_estimate_usd": <5 decimal places>,
  "complexity_before": <1-10>,
  "complexity_after": <1-10>,
  "breakdown": [{ "category": "<Naming|Dead code|Redundancy|Complexity|Error handling|Style|Comments|Structure>", "tokens": <integer>, "detail": "<specific issue in this code>", "severity": "<high|medium|low>" }],
  "scores": { "readability": <1-10>, "maintainability": <1-10>, "robustness": <1-10>, "efficiency": <1-10> },
  "score_notes": { "readability": "<10 words>", "maintainability": "<10 words>", "robustness": "<10 words>", "efficiency": "<10 words>" },
  "efficient_prompt": "<fully optimized code — exact same behavior — single quotes in strings>",
  "diff_summary": [{ "line_ref": "<function or line range>", "type": "<renamed|removed|simplified|restructured|added_guard|extracted|inlined>", "before": "<original snippet max 60 chars>", "after": "<optimized snippet max 60 chars>" }],
  "reasons": [{ "change": "<precise what changed and where>", "principle": "<named pattern: DRY|YAGNI|SRP|early-return|guard clause|extract method|etc>", "lesson": "<one actionable sentence specific to this language>" }],
  "behavior_warnings": ["<any change that could alter edge-case behavior. Empty array if none.>"],
  "missing_context": ["<genuinely useful: missing type hints, unhandled null, no input validation, unclear return contract, missing docstring on public API>"]
}

Language-specific rules:
- Python: PEP 8, type hints on public functions, comprehensions over loops where clearer, f-strings, context managers, early returns
- JavaScript/TypeScript: const over let/var, async/await over callbacks, optional chaining, nullish coalescing, destructuring
- SQL: explicit columns not SELECT *, proper JOIN selection, index-friendly WHERE clauses
- Bash: quote variables, use [[ ]] not [ ], local vars in functions, set -e/-u where appropriate
- Go: error wrapping with context, defer for cleanup, idiomatic range
- Java/C#: streams/LINQ over imperative loops, proper resource management, meaningful exception types

Universal rules:
- Naming: variables and functions must reveal intent
- Dead code: remove commented-out code, unused variables, unreachable branches
- Redundancy: extract duplicate logic to functions
- Complexity: flatten nested conditionals with early returns and guard clauses
- Error handling: add guards for null/undefined inputs if obviously missing — do NOT add speculative handling
- Comments: remove comments that restate the code; keep comments explaining WHY
- CRITICAL: Do NOT change what the code does — only how it does it
- CRITICAL: Do NOT add features, dependencies, or behavior not in the original
- CRITICAL: If a change could alter behavior in any edge case, add it to behavior_warnings
- Max 5 breakdown items. Max 4 reasons. Max 3 diff_summary entries. Max 3 missing_context items.`
};

function getSystemPrompt(level, plan, modelCfg) {
  const model = modelCfg || { label: 'Claude Sonnet', price: 3.00 };
  const pricingNote = `Pricing: $${model.price.toFixed(2)} per 1M input tokens (${model.label}). Be precise.`;
  const promptWithPricing = (p) => p.replace(
    /Pricing: \$[\d.]+ per 1M input tokens \([^)]+\)\. (Be precise|Max 3 breakdown items)[^`]*/,
    pricingNote + ' Max 3 breakdown items. Max 3 reasons. Max 3 missing_context items.'
  );
  if (plan === 'free') return promptWithPricing(SYSTEM_PROMPTS.fast);
  if (plan === 'plus') return promptWithPricing(level === 'balanced' ? SYSTEM_PROMPTS.balanced : SYSTEM_PROMPTS.fast);
  return promptWithPricing(SYSTEM_PROMPTS[level] || SYSTEM_PROMPTS.balanced);
}

// ── Fix #2: Sanitize input before sending to Claude ───────
function sanitizePrompt(input) {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '') // strip control chars
    .replace(/<script[\s\S]*?<\/script>/gi, '')                              // strip script tags
    .trim();
}

async function analyzePrompt(prompt, apiKey, systemPrompt) {
  const promptLen = prompt.length;
  const maxTok = promptLen < 500 ? 1000 : promptLen < 1500 ? 1400 : 1800;

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
      // Fix #9: Don't expose raw API error messages to client
      console.error('Anthropic API error:', err);
      throw new Error('Analysis service error. Please try again.');
    }

    const data    = await res.json();
    const raw     = (data.content || []).map(c => c.text || '').join('');
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try { return JSON.parse(cleaned); } catch(e) {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch(e) {}
      try {
        const sanitized = match[0]
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
          .replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
        return JSON.parse(sanitized);
      } catch(e) {}
    }
    throw new Error('Could not parse analysis response');
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
  const resetsAt = new Date(new Date(startAt).getTime() + windowDays * 24 * 60 * 60 * 1000);
  const msUntil  = resetsAt - new Date();
  const days  = Math.floor(msUntil / (1000 * 60 * 60 * 24));
  const hours = Math.floor((msUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins  = Math.ceil((msUntil % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0)  return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export const config = { maxDuration: 30 };

const DEMO_SYSTEM = `You are a prompt efficiency expert. Analyze the given prompt and return ONLY valid JSON:
{
  "estimated_tokens": <integer>,
  "efficient_prompt": "<optimized version — remove filler, hedging, politeness overhead, redundancy. Use single quotes only in code.>",
  "savings_percent": <integer 0-100>,
  "efficient_tokens": <integer>
}
Return ONLY the JSON object, no markdown, no explanation.`;

export default async function handler(req, res) {
  // ── CORS headers — required for browser extension access ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Fix #8: Guard against empty body
  if (!req.body) return res.status(400).json({ error: 'Empty request body.' });

  // ── Demo path — no auth required ──────────────────────────
  if (req.body?.demo === true) {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || 'unknown');

    // Fix #3: Use Upstash for demo rate limiting instead of in-memory
    const demoRl = await checkDemoRateLimit(ip);
    if (!demoRl.allowed) {
      return res.status(429).json({ error: 'One demo per hour. Sign up free for unlimited access.' });
    }

    // Fix #2: Sanitize demo input
    const raw    = (req.body.prompt || '').slice(0, 500);
    const prompt = sanitizePrompt(raw);
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
      const rawText = (data.content || []).map(c => c.text || '').join('');
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let result;
      try { result = JSON.parse(cleaned); }
      catch(e) { const m = cleaned.match(/\{[\s\S]*\}/); result = m ? JSON.parse(m[0]) : null; }
      if (!result) throw new Error('Parse failed');
      return res.status(200).json({ result });
    } catch(err) {
      if (err.name === 'AbortError') return res.status(504).json({ error: 'Timed out — try a shorter prompt' });
      // Fix #9: Don't expose internal errors
      console.error('Demo analysis error:', err.message);
      return res.status(500).json({ error: 'Analysis failed. Please try again.' });
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

  // Fix #1: Use service key for atomic counter updates to avoid race conditions
  const supabaseService = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY || supabaseKey);

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('plan, analyses_today, last_analysis_at, analyses_this_period, period_start_at, pro_analyses_this_period, pro_period_start_at, deactivated')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) return res.status(500).json({ error: 'Could not load user profile.' });

  if (profile.deactivated) return res.status(403).json({ error: 'This account has been deactivated.' });

  const plan = profile.plan || 'free';

  const rl = await checkRateLimit(user.id, plan);
  if (!rl.allowed) {
    return res.status(429).json({
      error: 'rate_limited',
      message: `Too many requests. You can make up to ${rl.limit} analyses per minute. Please wait a moment and try again.`,
      retry_after: rl.retryAfter
    });
  }

  // Fix #8: Guard prompts access safely
  const prompts = req.body.prompts || (req.body.prompt ? [req.body.prompt] : []);

  if (!prompts.length) return res.status(400).json({ error: 'No prompt provided.' });
  if (plan !== 'pro' && prompts.length > 1) return res.status(403).json({ error: 'Batch analysis is a Pro feature.' });
  if (prompts.length > 15) return res.status(400).json({ error: 'Maximum 15 prompts per batch.' });

  // Fix #2: Sanitize all prompts
  const sanitizedPrompts = [];
  for (const p of prompts) {
    if (!p || typeof p !== 'string' || p.trim().length === 0) return res.status(400).json({ error: 'One or more prompts are empty.' });
    const charLimit = LIMITS[plan]?.chars || 1500;
    if (p.length > charLimit) return res.status(400).json({ error: `Prompts must be under ${charLimit.toLocaleString()} characters on your ${plan} plan.` });
    sanitizedPrompts.push(sanitizePrompt(p));
  }

  const batchSize = sanitizedPrompts.length;

  // ── Fix #1: Atomic usage check using Upstash to prevent race conditions ──
  // Use Upstash as a distributed lock/counter for the critical check-and-increment
  const usageKey = `usage:${user.id}:${plan}`;
  const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (plan === 'free') {
    const lastAt         = profile.last_analysis_at ? new Date(profile.last_analysis_at) : null;
    const hoursSinceLast = lastAt ? (new Date() - lastAt) / (1000 * 60 * 60) : 999;
    const usedToday      = hoursSinceLast >= 24 ? 0 : (profile.analyses_today || 0);

    if (usedToday >= LIMITS.free.daily) {
      const resetsAt = new Date(lastAt.getTime() + 24 * 60 * 60 * 1000);
      const mins     = Math.ceil((resetsAt - new Date()) / (1000 * 60));
      const h = Math.floor(mins / 60), m = mins % 60;
      return res.status(403).json({ error: 'limit_reached', plan, used: usedToday, limit: LIMITS.free.daily, resets_in: h > 0 ? `${h}h ${m}m` : `${m}m` });
    }

    // Fix #1: Atomic increment via Upstash to prevent race condition
    if (upstashUrl && upstashToken) {
      const atomicKey = `atomic:free:${user.id}`;
      try {
        const r = await fetch(`${upstashUrl}/pipeline`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${upstashToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([['INCR', atomicKey], ['EXPIRE', atomicKey, 86400]])
        });
        const [incrData] = await r.json();
        const atomicCount = incrData?.result ?? 1;
        if (atomicCount > LIMITS.free.daily) {
          await fetch(`${upstashUrl}/decr/${atomicKey}`, { headers: { 'Authorization': `Bearer ${upstashToken}` } });
          return res.status(403).json({ error: 'limit_reached', plan, used: LIMITS.free.daily, limit: LIMITS.free.daily, resets_in: '24h' });
        }
      } catch(e) {
        console.error('Atomic check error:', e.message); // fail open
      }
    }
  }

  if (plan === 'plus') {
    const { currentUsed } = checkRollingWindow(profile.analyses_this_period, profile.period_start_at, 30);
    if (currentUsed >= LIMITS.plus.monthly) {
      return res.status(403).json({ error: 'limit_reached', plan, used: currentUsed, limit: LIMITS.plus.monthly, resets_in: resetIn(profile.period_start_at, 30) });
    }
  }

  if (plan === 'pro') {
    const { currentUsed } = checkRollingWindow(profile.pro_analyses_this_period, profile.pro_period_start_at, 30);
    if (currentUsed + batchSize > LIMITS.pro.monthly) {
      const remaining = Math.max(0, LIMITS.pro.monthly - currentUsed);
      return res.status(403).json({ error: 'limit_reached', plan, used: currentUsed, limit: LIMITS.pro.monthly, remaining, resets_in: resetIn(profile.pro_period_start_at, 30) });
    }
  }

  try {
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
    const level = allowedLevels.includes(rawLevel) ? rawLevel : allowedLevels[allowedLevels.length - 1];
    const systemPrompt = getSystemPrompt(level, plan, modelCfg);

    // Fix #5: Use allSettled so one failure doesn't kill the whole batch
    const settled = await Promise.allSettled(sanitizedPrompts.map(p => analyzePrompt(p, anthropicKey, systemPrompt)));
    const results = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      console.error(`Prompt ${i} failed:`, s.reason?.message);
      return { error: s.reason?.message || 'Analysis failed for this prompt', prompt_index: i };
    });

    const successCount = results.filter(r => !r.error).length;
    if (successCount === 0) throw new Error('All analyses failed. Please try again.');

    const now = new Date();
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
        analyses_this_period: currentUsed + batchSize, // Fix #12: use batchSize for future-proofing
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

    // Fix #1: Use service key for counter update to bypass RLS race window
    await supabaseService.from('users').update(updatePayload).eq('id', user.id);

    // Fix #4: Efficient history cleanup — count first, delete only what's needed
    if (plan === 'pro') {
      const successResults = results.filter(r => !r.error);
      if (successResults.length > 0) {
        const historyRows = successResults.map((r, i) => ({
          user_id:           user.id,
          prompt:            sanitizedPrompts[i],
          estimated_tokens:  r.estimated_tokens,
          efficient_tokens:  r.efficient_tokens,
          savings_percent:   r.savings_percent,
          efficient_prompt:  r.efficient_prompt,
          cost_estimate_usd: r.cost_estimate_usd,
          saved:             false
        }));
        await supabaseService.from('prompt_history').insert(historyRows);

        // Fix #4: Count first, then delete only the excess
        const { count } = await supabaseService
          .from('prompt_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('saved', false);

        if (count > 100) {
          const excess = count - 100;
          const { data: oldest } = await supabaseService
            .from('prompt_history')
            .select('id')
            .eq('user_id', user.id)
            .eq('saved', false)
            .order('created_at', { ascending: true })
            .limit(excess);
          if (oldest?.length) {
            await supabaseService.from('prompt_history').delete().in('id', oldest.map(r => r.id));
          }
        }
      }
    }

    let usage = { plan };
    if (plan === 'free') {
      const newUsed = updatePayload.analyses_today;
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

    const processedResults = results.map(r => ({ ...r, priority: plan === 'pro' }));
    const responseData = batchSize === 1 ? processedResults[0] : processedResults;
    return res.status(200).json({ results: responseData, usage, batch: batchSize > 1, level });

  } catch (err) {
    // Fix #9: Log internally, return generic message externally
    console.error('Analysis handler error:', err.message);
    return res.status(500).json({ error: err.message?.includes('failed') ? err.message : 'Unexpected server error. Please try again.' });
  }
}
