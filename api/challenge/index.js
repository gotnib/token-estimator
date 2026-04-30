import { createClient } from ‘@supabase/supabase-js’;

const CHALLENGE_LIMIT_PLUS = 5;

// ── Topic pools for randomization ─────────────────
const GENERAL_TOPICS = [
‘writing a villain origin story’, ‘brainstorming names for a coffee shop’,
‘writing a product launch announcement’, ‘creating a children bedtime story’,
‘writing a movie pitch’, ‘brainstorming team building activities’,
‘writing a wedding toast speech’, ‘creating a travel blog post’,
‘brainstorming startup ideas’, ‘writing a horror story opening’,
‘researching cryptocurrency history’, ‘finding information about intermittent fasting’,
‘researching electric vehicle trends’, ‘finding the best project management frameworks’,
‘researching remote work productivity’, ‘finding information about ADHD in adults’,
‘emailing a client about a missed deadline’, ‘writing a cold outreach email’,
‘sending a follow-up after a job interview’, ‘writing a performance review’,
‘emailing a vendor about pricing’, ‘writing a project status update’,
‘explaining how to make sourdough bread’, ‘giving advice on learning guitar’,
‘explaining how to start running’, ‘giving tips for better sleep’,
‘comparing two project management tools’, ‘deciding between two job offers’,
‘recommending books on personal finance’, ‘explaining the pros and cons of remote work’,
‘summarizing recent AI news’, ‘explaining climate change for a teenager’,
‘giving advice on public speaking anxiety’, ‘explaining how to negotiate a salary’,
];

const TECHNICAL_TOPICS = [
‘reviewing a function that handles user authentication’,
‘debugging a slow database query’,
‘reviewing an async function with poor error handling’,
‘debugging a memory leak in a loop’,
‘reviewing a REST API endpoint for security issues’,
‘explaining how promises work in JavaScript’,
‘explaining the difference between SQL joins’,
‘explaining what Docker containers do’,
‘explaining how HTTP caching works’,
‘explaining recursion with a simple example’,
‘writing technical docs for an internal API’,
‘documenting a complex function’,
‘writing a README for an open source project’,
‘analyzing CSV data for sales trends’,
‘designing a simple REST API for a todo app’,
];

const MISTAKE_POOLS = {
general: [
‘excessive politeness and hedging (“I was wondering if maybe you could possibly…”)’,
‘vague output format with no structure specified’,
‘asking multiple unrelated things in one prompt’,
‘over-explaining obvious context the AI already knows’,
‘unnecessary role-setting preamble (“You are an expert in…”)’,
‘hedging every request (“if possible”, “sort of”, “kind of”)’,
‘apologizing for asking (“sorry to bother you but…”)’,
‘repeating the same requirement three different ways’,
‘using passive voice and indirect language throughout’,
‘requesting things the user should decide themselves (“make it good”)’,
],
technical: [
‘not specifying the programming language or framework’,
‘vague requirements without clear inputs and outputs’,
‘no mention of error handling or edge cases’,
‘requesting explanation AND code without separating concerns’,
‘no performance or complexity requirements stated’,
‘contradictory requirements in the same prompt’,
‘asking for a review without specifying what to look for’,
‘no context about the codebase or existing patterns’,
]
};

function randomFrom(arr) {
return arr[Math.floor(Math.random() * arr.length)];
}

// ── Generate bad prompt challenge ──────────────────
async function generateChallenge(apiKey, category) {
const isTechnical = category && (
category.includes(‘code’) || category.includes(‘debug’) ||
category.includes(‘technical’) || category.includes(‘documentation’) ||
category.includes(‘API’) || category.includes(‘SQL’) || category.includes(‘data’)
);

const topic      = isTechnical ? randomFrom(TECHNICAL_TOPICS) : randomFrom(GENERAL_TOPICS);
const mistakeKey = isTechnical ? ‘technical’ : ‘general’;
const pool       = […MISTAKE_POOLS[mistakeKey]].sort(() => Math.random() - 0.5);
const mistakes   = pool.slice(0, 2 + Math.floor(Math.random() * 2));

const res = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘content-type’: ‘application/json’,
‘x-api-key’: apiKey,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify({
model: ‘claude-sonnet-4-5’,
max_tokens: 700,
system: `You generate intentionally inefficient AI prompts for a prompt engineering training exercise.
Return ONLY valid JSON with no markdown or preamble:
{
“category”: “<specific topic being addressed>”,
“bad_prompt”: “<an inefficient prompt about: ${topic}>”,
“hint”: “<vague hint about the inefficiency type, do not name it explicitly>”,
“ideal_prompt”: “<the tight, precise optimized version>”
}

The bad prompt MUST include these specific mistakes: ${mistakes.join(’; ’)}.
The bad prompt should be 80-200 words — realistic, like something a real person would write.
The ideal prompt should be 15-50 words — precise and direct.
Make it feel completely different from generic examples. The topic is specifically: ${topic}.`,
messages: [{ role: ‘user’, content: ‘Generate the challenge now.’ }]
})
});

if (!res.ok) throw new Error(‘Failed to generate challenge’);
const data    = await res.json();
const raw     = (data.content || []).map(c => c.text || ‘’).join(’’);
const cleaned = raw.replace(/^`(?:json)?\s*/, '').replace(/\s*`$/, ‘’).trim();
return JSON.parse(cleaned);
}

// ── Score prompt attempt ───────────────────────────
async function scoreAttempt(apiKey, badPrompt, userAttempt, idealPrompt) {
const res = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘content-type’: ‘application/json’,
‘x-api-key’: apiKey,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify({
model: ‘claude-sonnet-4-5’,
max_tokens: 800,
system: `You are a prompt engineering instructor scoring a student’s optimization attempt. Return ONLY valid JSON with no markdown or preamble:
{
“score”: <integer 0-100>,
“grade”: “<A/B/C/D/F>”,
“summary”: “<2 sentences praising what they got right and noting what they missed>”,
“what_you_got_right”: [”<specific thing 1>”, “<specific thing 2>”],
“what_you_missed”: [”<specific thing 1>”, “<specific thing 2>”],
“comparison”: “<one sentence comparing their attempt to the ideal version>”
}

Scoring:

- 90-100 (A): Caught all major issues, clear and precise, comparable to ideal
- 75-89 (B): Caught most issues, minor inefficiencies remain
- 60-74 (C): Caught some issues but missed significant ones
- 40-59 (D): Made improvements but prompt still has major problems
- 0-39 (F): Little to no meaningful improvement

Be encouraging but honest.`, messages: [{ role: 'user', content: `Original bad prompt:\n${badPrompt}\n\nStudent’s optimized version:\n${userAttempt}\n\nIdeal optimized version:\n${idealPrompt}`
}]
})
});

if (!res.ok) throw new Error(‘Failed to score attempt’);
const data    = await res.json();
const raw     = (data.content || []).map(c => c.text || ‘’).join(’’);
const cleaned = raw.replace(/^`(?:json)?\s*/, '').replace(/\s*`$/, ‘’).trim();
return JSON.parse(cleaned);
}

// ── Main handler ───────────────────────────────────
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
if (![‘POST’, ‘GET’].includes(req.method)) {
return res.status(405).json({ error: ‘Method not allowed’ });
}

const apiKey   = process.env.ANTHROPIC_API_KEY;
const token    = req.headers.authorization?.replace(’Bearer ’, ‘’);
if (!token) return res.status(401).json({ error: ‘Not logged in.’ });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
global: { headers: { Authorization: `Bearer ${token}` } }
});

const { data: { user }, error: authError } = await supabase.auth.getUser(token);
if (authError || !user) return res.status(401).json({ error: ‘Invalid session.’ });

const { data: profile } = await supabase
.from(‘users’)
.select(‘plan, challenges_today, last_challenge_at, deactivated’)
.eq(‘id’, user.id).single();

if (profile?.deactivated) return res.status(403).json({ error: ‘Account deactivated.’ });

const plan = profile?.plan || ‘free’;
if (plan === ‘free’) {
return res.status(403).json({ error: ‘upgrade_required’, message: ‘Challenge mode is available on Plus and Pro plans.’ });
}

// ── GET: generate prompt challenge ─────────────────
if (req.method === ‘GET’) {
// Plus daily limit
if (plan === ‘plus’) {
const lastAt   = profile?.last_challenge_at ? new Date(profile.last_challenge_at) : null;
const hrs      = lastAt ? (new Date() - lastAt) / 3600000 : 999;
const used     = hrs >= 24 ? 0 : (profile?.challenges_today || 0);

```
  if (used >= CHALLENGE_LIMIT_PLUS) {
    const resetsAt = new Date(lastAt.getTime() + 24 * 3600000);
    const mins     = Math.ceil((resetsAt - new Date()) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return res.status(403).json({
      error: 'limit_reached', used, limit: CHALLENGE_LIMIT_PLUS,
      resets_in: h > 0 ? `${h}h ${m}m` : `${m}m`
    });
  }

  const prevUsed = hrs >= 24 ? 0 : (profile?.challenges_today || 0);
  await supabase.from('users').update({
    challenges_today:  prevUsed + 1,
    last_challenge_at: new Date().toISOString()
  }).eq('id', user.id);
}

try {
  const challenge = await generateChallenge(apiKey, req.query.category || null);
  return res.status(200).json({ challenge, plan });
} catch(err) {
  return res.status(500).json({ error: err.message });
}
```

}

// ── POST: score prompt attempt ─────────────────────
if (req.method === ‘POST’) {
const { bad_prompt, user_attempt, ideal_prompt } = req.body;
if (!bad_prompt || !user_attempt || !ideal_prompt) {
return res.status(400).json({ error: ‘Missing required fields.’ });
}

```
try {
  const result = await scoreAttempt(apiKey, bad_prompt, user_attempt, ideal_prompt);
  return res.status(200).json({ result });
} catch(err) {
  return res.status(500).json({ error: err.message });
}
```

}
}
