import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 30 };

const CHALLENGE_LIMIT_PLUS = 5;

// ── Topic pools ────────────────────────────────────
const GENERAL_TOPICS = [
  'writing a villain origin story', 'brainstorming names for a coffee shop',
  'writing a product launch announcement', 'creating a children bedtime story',
  'writing a movie pitch', 'brainstorming team building activities',
  'writing a wedding toast speech', 'creating a travel blog post',
  'brainstorming startup ideas', 'writing a horror story opening',
  'researching cryptocurrency history', 'finding information about intermittent fasting',
  'researching electric vehicle trends', 'finding the best project management frameworks',
  'researching remote work productivity', 'finding information about ADHD in adults',
  'emailing a client about a missed deadline', 'writing a cold outreach email',
  'sending a follow-up after a job interview', 'writing a performance review',
  'emailing a vendor about pricing', 'writing a project status update',
  'explaining how to make sourdough bread', 'giving advice on learning guitar',
  'explaining how to start running', 'giving tips for better sleep',
  'comparing two project management tools', 'deciding between two job offers',
  'recommending books on personal finance', 'explaining the pros and cons of remote work',
  'summarizing recent AI news', 'explaining climate change for a teenager',
  'giving advice on public speaking anxiety', 'explaining how to negotiate a salary',
];

const TECHNICAL_TOPICS = [
  'reviewing a function that handles user authentication',
  'debugging a slow database query',
  'reviewing an async function with poor error handling',
  'debugging a memory leak in a loop',
  'reviewing a REST API endpoint for security issues',
  'explaining how promises work in JavaScript',
  'explaining the difference between SQL joins',
  'explaining what Docker containers do',
  'explaining how HTTP caching works',
  'explaining recursion with a simple example',
  'writing technical docs for an internal API',
  'documenting a complex function',
  'writing a README for an open source project',
  'analyzing CSV data for sales trends',
  'designing a simple REST API for a todo app',
];

const MISTAKE_POOLS = {
  general: [
    'excessive politeness and hedging',
    'vague output format with no structure specified',
    'asking multiple unrelated things in one prompt',
    'over-explaining obvious context the AI already knows',
    'unnecessary role-setting preamble',
    'hedging every request with if possible or sort of',
    'apologizing for asking',
    'repeating the same requirement three different ways',
    'using passive voice and indirect language throughout',
  ],
  technical: [
    'not specifying the programming language or framework',
    'vague requirements without clear inputs and outputs',
    'no mention of error handling or edge cases',
    'requesting explanation AND code without separating concerns',
    'no performance or complexity requirements stated',
    'contradictory requirements in the same prompt',
    'asking for a review without specifying what to look for',
    'no context about the codebase or existing patterns',
  ]
};

const CODE_TOPICS = {
  python: [
    'validates an email address format',
    'counts word frequency in a string',
    'converts celsius to fahrenheit with edge cases',
    'finds and removes duplicates from a list',
    'generates a random password of given length',
    'checks if a string is a palindrome',
    'flattens a nested list of arbitrary depth',
    'retries a function call up to N times on failure',
    'sorts a list of dictionaries by a specified key',
  ],
  javascript: [
    'debounces a function call by a given delay',
    'deep clones a nested object',
    'formats a number as currency',
    'truncates a string to a max length with ellipsis',
    'groups an array of objects by a property',
    'converts a query string to a key-value object',
    'throttles a scroll event handler',
    'validates a credit card number format',
  ],
  sql: [
    'finds the top 5 customers by total order value',
    'calculates monthly revenue totals for the past year',
    'finds users who registered but never made a purchase',
    'gets the most recent order for each customer',
    'counts orders grouped by status',
    'finds products with zero sales in the last 30 days',
  ],
  html: [
    'a pricing card with a featured plan highlight',
    'a notification badge on a bell icon',
    'a progress bar showing 65% completion',
    'a simple toggle switch component',
    'a star rating display out of five',
    'a tooltip that appears on hover',
  ],
  regex: [
    'validates a standard email address',
    'matches a US phone number in multiple formats',
    'extracts all URLs from a block of text',
    'validates a strong password',
    'matches an IPv4 address',
    'validates a date in MM/DD/YYYY format',
  ],
  bash: [
    'backs up a directory with a timestamp in the name',
    'finds and lists files older than 30 days',
    'renames all files in a folder to lowercase',
    'counts total lines across all .log files in a directory',
    'extracts unique IP addresses from an access log',
  ]
};

const LANG_LABELS = {
  python: 'Python', javascript: 'JavaScript', sql: 'SQL',
  html: 'HTML/CSS', regex: 'Regex', bash: 'Bash'
};

const BAD_CODE_PATTERNS = [
  'no error handling or input validation',
  'overly verbose variable names that repeat context',
  'redundant intermediate variables that add no clarity',
  'no comments or documentation',
  'inefficient logic that could be simplified',
  'magic numbers with no explanation',
  'repeated code that could be extracted to a helper',
  'inconsistent naming conventions',
  'doing multiple things in one function',
  'no type hints or type safety considerations',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomMistakes(pool, count) {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

// ── Auth helper ────────────────────────────────────
async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return { error: 'Not logged in.' };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Invalid session.' };

  const { data: profile } = await supabase
    .from('users')
    .select('plan, challenges_today, last_challenge_at, deactivated')
    .eq('id', user.id).single();

  return { user, profile, supabase, token };
}

// ── Claude API call ────────────────────────────────
async function claude(apiKey, system, userMsg, maxTokens = 700) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  if (!res.ok) throw new Error('Claude API error ' + res.status);
  const data = await res.json();
  const raw  = (data.content || []).map(c => c.text || '').join('');
  return raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
}

// ── Generate prompt challenge ──────────────────────
async function generatePromptChallenge(apiKey, category) {
  const isTechnical = category && (
    category.includes('code') || category.includes('debug') ||
    category.includes('technical') || category.includes('documentation') ||
    category.includes('API') || category.includes('SQL') || category.includes('data')
  );
  const topic      = isTechnical ? randomFrom(TECHNICAL_TOPICS) : randomFrom(GENERAL_TOPICS);
  const mistakeKey = isTechnical ? 'technical' : 'general';
  const mistakes   = randomMistakes(MISTAKE_POOLS[mistakeKey], 2 + Math.floor(Math.random() * 2));

  const raw = await claude(apiKey,
    `You generate intentionally inefficient AI prompts for a prompt engineering training exercise.
Return ONLY valid JSON:
{
  "category": "<specific topic>",
  "bad_prompt": "<inefficient prompt about: ${topic}>",
  "hint": "<vague hint about the inefficiency, do not name it>",
  "ideal_prompt": "<tight, precise optimized version>"
}
Bad prompt MUST include: ${mistakes.join('; ')}.
Bad prompt: 80-200 words. Ideal prompt: 15-50 words. Topic: ${topic}.`,
    'Generate the challenge now.'
  );
  return JSON.parse(raw);
}

// ── Generate code challenge ────────────────────────
async function generateCodeChallenge(apiKey, codeLanguage) {
  const topics   = CODE_TOPICS[codeLanguage] || CODE_TOPICS.python;
  const topic    = randomFrom(topics);
  const langLabel = LANG_LABELS[codeLanguage] || codeLanguage;
  const patterns  = randomMistakes(BAD_CODE_PATTERNS, 3);

  const raw = await claude(apiKey,
    `You generate intentionally bad but functional ${langLabel} code for a code optimization training exercise.
Return ONLY valid JSON:
{
  "description": "<one sentence: what this code does>",
  "bad_code": "<bad but functional code>",
  "ideal_code": "<clean optimized version>",
  "issues": ["<issue 1>", "<issue 2>", "<issue 3>"]
}
Bad code MUST include: ${patterns.join('; ')}.
Bad code: functional, 15-35 lines max. Ideal code: clean, max 25 lines.
Task: ${langLabel} code that ${topic}.`,
    'Generate the code challenge now.',
    800
  );
  const parsed = JSON.parse(raw);
  return { ...parsed, code_language: codeLanguage, lang_label: langLabel, topic };
}

// ── Score prompt attempt ───────────────────────────
async function scorePromptAttempt(apiKey, badPrompt, userAttempt, idealPrompt) {
  const raw = await claude(apiKey,
    `You are a prompt engineering instructor scoring a student's optimization attempt. Return ONLY valid JSON:
{
  "score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<2 sentences>",
  "what_you_got_right": ["<thing 1>", "<thing 2>"],
  "what_you_missed": ["<thing 1>", "<thing 2>"],
  "comparison": "<one sentence vs ideal>"
}
A=90-100, B=75-89, C=60-74, D=40-59, F=0-39. Be encouraging but honest.`,
    `Original:\n${badPrompt}\n\nStudent:\n${userAttempt}\n\nIdeal:\n${idealPrompt}`,
    800
  );
  return JSON.parse(raw);
}

// ── Score code attempt ─────────────────────────────
async function scoreCodeAttempt(apiKey, badCode, userCode, idealCode, codeLanguage, description) {
  const langLabel = LANG_LABELS[codeLanguage] || codeLanguage;
  const raw = await claude(apiKey,
    `You are a senior ${langLabel} developer scoring a student's code optimization attempt. Return ONLY valid JSON:
{
  "score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<2 sentences>",
  "what_you_improved": ["<improvement 1>", "<improvement 2>"],
  "what_you_missed": ["<issue 1>", "<issue 2>"],
  "comparison": "<one sentence vs ideal>"
}
A=90-100, B=75-89, C=60-74, D=40-59, F=0-39. Be encouraging but honest.`,
    `Task: ${description}\n\nOriginal:\n${badCode}\n\nStudent:\n${userCode}\n\nIdeal:\n${idealCode}`,
    800
  );
  return JSON.parse(raw);
}

// ── Main handler ───────────────────────────────────
export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, profile, supabase, error } = await getUser(req);
  if (error) return res.status(401).json({ error });
  if (profile?.deactivated) return res.status(403).json({ error: 'Account deactivated.' });

  const plan    = profile?.plan || 'free';
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const action  = req.query.action || 'generate';

  if (plan === 'free') {
    return res.status(403).json({ error: 'upgrade_required', message: 'Challenge mode is available on Plus and Pro plans.' });
  }

  // Code challenges are Pro only
  const isCode = action === 'run-code' || !!req.query.code_language || !!req.body?.code_language;
  if (isCode && plan !== 'pro') {
    return res.status(403).json({ error: 'upgrade_required', message: 'Code challenges are available on Pro plan only.' });
  }

  // ── GET: generate challenge ────────────────────────
  if (req.method === 'GET') {
    // Plus daily limit (prompt challenges only)
    if (plan === 'plus') {
      const lastAt   = profile?.last_challenge_at ? new Date(profile.last_challenge_at) : null;
      const hrs      = lastAt ? (new Date() - lastAt) / 3600000 : 999;
      const used     = hrs >= 24 ? 0 : (profile?.challenges_today || 0);

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
      const codeLanguage = req.query.code_language || null;
      if (codeLanguage) {
        const challenge = await generateCodeChallenge(apiKey, codeLanguage);
        return res.status(200).json({ challenge, plan, is_code: true });
      } else {
        const challenge = await generatePromptChallenge(apiKey, req.query.category || null);
        return res.status(200).json({ challenge, plan, is_code: false });
      }
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: score attempt ────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;

    // Code scoring
    if (body.bad_code !== undefined) {
      const { bad_code, user_code, ideal_code, code_language, description } = body;
      if (!bad_code || !user_code || !ideal_code) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }
      try {
        const result = await scoreCodeAttempt(apiKey, bad_code, user_code, ideal_code, code_language, description);
        // Save score in background
        supabase.from('challenge_scores').insert({
          user_id: user.id, score: result.score, grade: result.grade, challenge_type: 'code'
        }).then(() => {});
        return res.status(200).json({ result });
      } catch(err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // Prompt scoring
    const { bad_prompt, user_attempt, ideal_prompt } = body;
    if (!bad_prompt || !user_attempt || !ideal_prompt) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    try {
      const result = await scorePromptAttempt(apiKey, bad_prompt, user_attempt, ideal_prompt);
      // Save score in background
      supabase.from('challenge_scores').insert({
        user_id: user.id, score: result.score, grade: result.grade, challenge_type: 'prompt'
      }).then(() => {});
      return res.status(200).json({ result });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
