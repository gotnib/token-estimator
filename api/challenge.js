import { createClient } from '@supabase/supabase-js';

const CHALLENGE_LIMIT_PLUS = 5;

// ── Generate a bad prompt for the challenge ────────
async function generateChallenge(apiKey, category) {
  const categories = [
    'technical documentation request',
    'code review or debugging task',
    'creative writing or brainstorming',
    'data analysis or summarization',
    'email or professional communication',
    'research or fact-finding',
    'step-by-step instructions',
    'comparison or decision making'
  ];

  const cat = category || categories[Math.floor(Math.random() * categories.length)];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 600,
      system: `You generate intentionally inefficient AI prompts for a prompt engineering training exercise. Return ONLY valid JSON with no markdown or preamble:
{
  "category": "<the category>",
  "bad_prompt": "<a realistic but inefficient prompt with common mistakes>",
  "hint": "<a single vague hint about what type of inefficiency to look for, without giving it away>",
  "issues": ["<issue 1>", "<issue 2>", "<issue 3>"],
  "ideal_prompt": "<the optimized version>",
  "max_score": 100
}

The bad prompt should feel like something a real person would write. Include 2-4 of these common mistakes:
- Excessive politeness and filler ("I was wondering if you could please...")
- Vague instructions without clear output format
- Redundant context that Claude already knows
- Asking multiple unrelated things in one prompt
- Over-explaining the task instead of stating it directly
- Unnecessary role-setting preamble
- Hedging language ("if possible", "maybe", "sort of")

Make the bad prompt 80-200 words. Make the ideal prompt 20-60 words. The hint should point toward the type of problem without naming it explicitly.`,
      messages: [{ role: 'user', content: `Generate a challenge prompt in the category: ${cat}` }]
    })
  });

  if (!res.ok) throw new Error('Failed to generate challenge');
  const data    = await res.json();
  const raw     = (data.content || []).map(c => c.text || '').join('');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Score a user's attempt ─────────────────────────
async function scoreAttempt(apiKey, badPrompt, userAttempt, idealPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: `You are a prompt engineering instructor scoring a student's optimization attempt. Return ONLY valid JSON with no markdown or preamble:
{
  "score": <integer 0-100>,
  "token_reduction": <integer percentage 0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<2 sentences praising what they got right and noting what they missed>",
  "what_you_got_right": ["<specific thing 1>", "<specific thing 2>"],
  "what_you_missed": ["<specific thing 1>", "<specific thing 2>"],
  "comparison": "<one sentence comparing their attempt to the ideal version>"
}

Scoring criteria:
- 90-100 (A): Caught all major issues, clear and precise, comparable to ideal
- 75-89 (B): Caught most issues, minor inefficiencies remain
- 60-74 (C): Caught some issues but missed significant ones
- 40-59 (D): Made improvements but prompt still has major problems
- 0-39 (F): Little to no meaningful improvement

Be encouraging but honest. The goal is learning.`,
      messages: [{
        role: 'user',
        content: `Original bad prompt:\n${badPrompt}\n\nStudent's optimized version:\n${userAttempt}\n\nIdeal optimized version:\n${idealPrompt}`
      }]
    })
  });

  if (!res.ok) throw new Error('Failed to score attempt');
  const data    = await res.json();
  const raw     = (data.content || []).map(c => c.text || '').join('');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey      = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile } = await supabase
    .from('users')
    .select('plan, challenges_today, last_challenge_at, deactivated')
    .eq('id', user.id)
    .single();

  if (profile?.deactivated) return res.status(403).json({ error: 'Account deactivated.' });

  const plan = profile?.plan || 'free';

  // Free users can't access challenge mode
  if (plan === 'free') {
    return res.status(403).json({
      error: 'upgrade_required',
      message: 'Challenge mode is available on Plus and Pro plans.'
    });
  }

  // ── GET: generate a new challenge ─────────────────
  if (req.method === 'GET') {
    // Check daily limit for Plus users
    if (plan === 'plus') {
      const lastAt = profile?.last_challenge_at ? new Date(profile.last_challenge_at) : null;
      const hrs    = lastAt ? (new Date() - lastAt) / 3600000 : 999;
      const used   = hrs >= 24 ? 0 : (profile?.challenges_today || 0);

      if (used >= CHALLENGE_LIMIT_PLUS) {
        const resetsAt = new Date(lastAt.getTime() + 24 * 3600000);
        const mins     = Math.ceil((resetsAt - new Date()) / 60000);
        const h = Math.floor(mins / 60), m = mins % 60;
        return res.status(403).json({
          error: 'limit_reached',
          used,
          limit: CHALLENGE_LIMIT_PLUS,
          resets_in: h > 0 ? `${h}h ${m}m` : `${m}m`
        });
      }

      // Increment counter
      const now    = new Date();
      const prevUsed = hrs >= 24 ? 0 : (profile?.challenges_today || 0);
      await supabase.from('users').update({
        challenges_today:  prevUsed + 1,
        last_challenge_at: now.toISOString()
      }).eq('id', user.id);
    }

    try {
      const category  = req.query.category || null;
      const challenge = await generateChallenge(apiKey, category);
      return res.status(200).json({ challenge, plan });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: score a user's attempt ──────────────────
  if (req.method === 'POST') {
    const { bad_prompt, user_attempt, ideal_prompt } = req.body;
    if (!bad_prompt || !user_attempt || !ideal_prompt) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
      const result = await scoreAttempt(apiKey, bad_prompt, user_attempt, ideal_prompt);
      return res.status(200).json({ result });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
