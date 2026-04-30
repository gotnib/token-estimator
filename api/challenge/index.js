import { createClient } from '@supabase/supabase-js';

const CHALLENGE_LIMIT_PLUS = 5;

// ── Randomization pools ────────────────────────────
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
  'reviewing a function that handles user authentication', 'debugging a slow database query',
  'reviewing an async function with poor error handling', 'debugging a memory leak in a loop',
  'reviewing a REST API endpoint for security issues', 'debugging a race condition',
  'explaining how promises work in JavaScript', 'explaining the difference between SQL joins',
  'explaining what Docker containers do', 'explaining how HTTP caching works',
  'explaining recursion with a simple example', 'explaining what a webhook is',
  'writing technical docs for an internal API', 'documenting a complex function',
  'writing a README for an open source project', 'creating a troubleshooting guide',
  'analyzing CSV data for sales trends', 'summarizing a dataset of user feedback',
  'designing a simple REST API for a todo app', 'designing a database schema for a blog',
];

const CODE_LANGUAGES = {
  python: {
    label: 'Python',
    topics: [
      'a function that validates an email address',
      'a function that counts word frequency in a string',
      'a function that converts celsius to fahrenheit',
      'a function that finds duplicates in a list',
      'a function that flattens a nested list',
      'a function that generates a random password',
      'a script that reads a CSV and prints a summary',
      'a function that checks if a string is a palindrome',
      'a function that calculates the fibonacci sequence',
      'a function that removes stopwords from text',
      'a function that sorts a list of dictionaries by a key',
      'a function that retries a failed API call',
    ]
  },
  javascript: {
    label: 'JavaScript',
    topics: [
      'a function that debounces a search input',
      'a function that deep clones an object',
      'a function that throttles scroll events',
      'a function that formats a phone number',
      'a function that truncates text with ellipsis',
      'a function that validates a credit card format',
      'a fetch wrapper with timeout and retry',
      'a function that groups an array by a property',
      'a function that converts a query string to an object',
      'a function that checks if two arrays are equal',
    ]
  },
  sql: {
    label: 'SQL',
    topics: [
      'a query to find the top 5 customers by order count',
      'a query to calculate monthly revenue totals',
      'a query to find users who signed up but never ordered',
      'a query to get the most recent order per customer',
      'a query to find duplicate email addresses',
      'a query to calculate a running total of sales',
      'a query to find products with no sales in 30 days',
      'a query to count orders grouped by status',
    ]
  },
  html: {
    label: 'HTML/CSS',
    topics: [
      'a responsive navigation bar',
      'a pricing card with a highlighted featured plan',
      'a contact form with name, email, and message fields',
      'a notification badge on an icon',
      'a progress bar component',
      'a simple modal dialog',
      'a star rating component',
      'a toggle switch',
      'a skeleton loading placeholder',
      'a tooltip on hover',
    ]
  },
  regex: {
    label: 'Regex',
    topics: [
      'a pattern that validates an email address',
      'a pattern that matches a US phone number',
      'a pattern that extracts URLs from text',
      'a pattern that validates a strong password',
      'a pattern that matches an IP address',
      'a pattern that finds duplicate words',
      'a pattern that validates a date in MM/DD/YYYY format',
      'a pattern that strips HTML tags from a string',
    ]
  },
  bash: {
    label: 'Bash',
    topics: [
      'a script that backs up a directory with a timestamp',
      'a script that finds and deletes files older than 30 days',
      'a script that monitors disk usage and alerts if over 80%',
      'a script that renames all files in a folder to lowercase',
      'a script that counts lines in all .log files',
      'a script that extracts unique IP addresses from a log file',
    ]
  }
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Bad prompt mistakes pool ───────────────────────
const MISTAKE_POOLS = {
  general: [
    'excessive politeness and hedging ("I was wondering if maybe you could possibly...")',
    'vague output format with no structure specified',
    'asking multiple unrelated things in one prompt',
    'over-explaining obvious context Claude already knows',
    'unnecessary role-setting preamble ("You are an expert in...")',
    'hedging every request ("if possible", "sort of", "kind of")',
    'apologizing for asking ("sorry to bother you but...")',
    'requesting things the user should decide themselves ("make it good")',
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
  ],
  code: [
    'not specifying the exact language and version',
    'no input/output types or examples given',
    'no error handling requirements mentioned',
    'vague scope ("make it efficient" without defining how)',
    'asking for both implementation and explanation in one go',
    'no constraints on code length or complexity',
    'missing context about how the function will be used',
    'no edge cases or failure modes mentioned',
  ]
};

// ── Generate bad prompt ────────────────────────────
async function generateChallenge(apiKey, category, codeLanguage) {
  const isCode = !!codeLanguage;
  const langConfig = isCode ? CODE_LANGUAGES[codeLanguage] : null;

  let topic, mistakeType;

  if (isCode) {
    topic = randomFrom(langConfig.topics);
    mistakeType = 'code';
  } else {
    const isTechnical = category && (
      category.includes('code') || category.includes('debug') ||
      category.includes('technical') || category.includes('documentation') ||
      category.includes('API') || category.includes('SQL') || category.includes('data')
    );
    topic = isTechnical
      ? randomFrom(TECHNICAL_TOPICS)
      : randomFrom(GENERAL_TOPICS);
    mistakeType = isTechnical ? 'technical' : 'general';
  }

  // Pick 2-3 random mistakes from the pool
  const pool = [...MISTAKE_POOLS[mistakeType]];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const mistakes = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));

  const systemPrompt = isCode
    ? `You generate intentionally inefficient ${langConfig.label} coding prompts for a prompt engineering training exercise.
Return ONLY valid JSON with no markdown or preamble:
{
  "category": "${langConfig.label} — ${topic}",
  "bad_prompt": "<an inefficient prompt asking for ${langConfig.label} code to accomplish: ${topic}>",
  "hint": "<vague hint about the inefficiency type, do not name it explicitly>",
  "ideal_prompt": "<the tight, precise optimized version>",
  "code_language": "${codeLanguage}"
}

The bad prompt MUST include these specific mistakes: ${mistakes.join('; ')}.
The bad prompt should be 60-150 words — realistic, like something a real developer would write hastily.
The ideal prompt should be 15-40 words — precise, specifying language, inputs, outputs, and constraints only.
IMPORTANT: Do NOT generate any actual code. Only generate the prompts.`
    : `You generate intentionally inefficient AI prompts for a prompt engineering training exercise.
Return ONLY valid JSON with no markdown or preamble:
{
  "category": "<specific topic being addressed>",
  "bad_prompt": "<an inefficient prompt about: ${topic}>",
  "hint": "<vague hint about the inefficiency type, do not name it explicitly>",
  "ideal_prompt": "<the tight, precise optimized version>"
}

The bad prompt MUST include these specific mistakes: ${mistakes.join('; ')}.
The bad prompt should be 80-200 words — realistic, like something a real person would write.
The ideal prompt should be 15-50 words — precise and direct.
Make it feel completely different from generic examples. The topic is specifically: ${topic}.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 700,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the challenge now.' }]
    })
  });

  if (!res.ok) throw new Error('Failed to generate challenge');
  const data    = await res.json();
  const raw     = (data.content || []).map(c => c.text || '').join('');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  const parsed  = JSON.parse(cleaned);
  parsed.is_code_challenge = isCode;
  parsed.code_language     = codeLanguage || null;
  return parsed;
}

// ── Generate code from prompt (Pro only) ──────────
async function generateCode(apiKey, prompt, codeLanguage) {
  const langConfig = CODE_LANGUAGES[codeLanguage];
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
      system: `You are a ${langConfig.label} developer. Execute the prompt exactly as given — do not improve or fix it. 
Return ONLY the code, no explanation, no markdown fences.
Keep output under 40 lines. If the prompt is vague produce vague code that reflects its ambiguity.
This is a training exercise showing how prompt quality affects code quality.`,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error('Failed to generate code');
  const data = await res.json();
  return (data.content || []).map(c => c.text || '').join('').trim();
}

// ── Score attempt ──────────────────────────────────
async function scoreAttempt(apiKey, badPrompt, userAttempt, idealPrompt, isCode, codeLanguage) {
  let codeComparison = '';

  if (isCode && codeLanguage) {
    // Run both prompts in parallel to get code output
    const [badCode, goodCode] = await Promise.all([
      generateCode(apiKey, badPrompt, codeLanguage),
      generateCode(apiKey, userAttempt, codeLanguage)
    ]);
    codeComparison = `\n\nCode from original bad prompt:\n${badCode}\n\nCode from student's optimized prompt:\n${goodCode}`;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 900,
      system: `You are a prompt engineering instructor scoring a student's optimization attempt. Return ONLY valid JSON with no markdown or preamble:
{
  "score": <integer 0-100>,
  "grade": "<A/B/C/D/F>",
  "summary": "<2 sentences praising what they got right and noting what they missed>",
  "what_you_got_right": ["<specific thing 1>", "<specific thing 2>"],
  "what_you_missed": ["<specific thing 1>", "<specific thing 2>"],
  "comparison": "<one sentence comparing their attempt to the ideal version>"${isCode ? `,
  "code_impact": "<one sentence describing how their prompt improvement changed the code output>"` : ''}
}

Scoring:
- 90-100 (A): Caught all major issues, clear and precise, comparable to ideal
- 75-89 (B): Caught most issues, minor inefficiencies remain
- 60-74 (C): Caught some issues but missed significant ones
- 40-59 (D): Made improvements but prompt still has major problems
- 0-39 (F): Little to no meaningful improvement

Be encouraging but honest.`,
      messages: [{
        role: 'user',
        content: `Original bad prompt:\n${badPrompt}\n\nStudent's optimized version:\n${userAttempt}\n\nIdeal optimized version:\n${idealPrompt}${codeComparison}`
      }]
    })
  });

  if (!res.ok) throw new Error('Failed to score attempt');
  const data    = await res.json();
  const raw     = (data.content || []).map(c => c.text || '').join('');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Main handler ───────────────────────────────────
export default async function handler(req, res) {
  if (!['POST', 'GET'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${req.headers.authorization?.replace('Bearer ', '')}` } }
  });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not logged in.' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile } = await supabase
    .from('users')
    .select('plan, challenges_today, last_challenge_at, deactivated')
    .eq('id', user.id)
    .single();

  if (profile?.deactivated) return res.status(403).json({ error: 'Account deactivated.' });

  const plan = profile?.plan || 'free';

  if (plan === 'free') {
    return res.status(403).json({ error: 'upgrade_required', message: 'Challenge mode is available on Plus and Pro plans.' });
  }

  // ── GET: generate challenge ────────────────────────
  if (req.method === 'GET') {
    const codeLanguage = req.query.code_language || null;
    const isCode       = !!codeLanguage;

    // Code challenges are Pro only
    if (isCode && plan !== 'pro') {
      return res.status(403).json({ error: 'upgrade_required', message: 'Code challenges are available on Pro plan only.' });
    }

    // Plus daily limit
    if (plan === 'plus') {
      const lastAt = profile?.last_challenge_at ? new Date(profile.last_challenge_at) : null;
      const hrs    = lastAt ? (new Date() - lastAt) / 3600000 : 999;
      const used   = hrs >= 24 ? 0 : (profile?.challenges_today || 0);

      if (used >= CHALLENGE_LIMIT_PLUS) {
        const resetsAt = new Date(lastAt.getTime() + 24 * 3600000);
        const mins     = Math.ceil((resetsAt - new Date()) / 60000);
        const h = Math.floor(mins / 60), m = mins % 60;
        return res.status(403).json({
          error: 'limit_reached', used, limit: CHALLENGE_LIMIT_PLUS,
          resets_in: h > 0 ? `${h}h ${m}m` : `${m}m`
        });
      }

      const hrs2   = (profile?.last_challenge_at ? (new Date() - new Date(profile.last_challenge_at)) / 3600000 : 999);
      const prevUsed = hrs2 >= 24 ? 0 : (profile?.challenges_today || 0);
      await supabase.from('users').update({
        challenges_today:  prevUsed + 1,
        last_challenge_at: new Date().toISOString()
      }).eq('id', user.id);
    }

    try {
      const category  = req.query.category || null;
      const challenge = await generateChallenge(apiKey, category, codeLanguage);
      return res.status(200).json({ challenge, plan });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: score attempt ────────────────────────────
  if (req.method === 'POST') {
    const { bad_prompt, user_attempt, ideal_prompt, is_code_challenge, code_language } = req.body;
    if (!bad_prompt || !user_attempt || !ideal_prompt) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
      const result = await scoreAttempt(apiKey, bad_prompt, user_attempt, ideal_prompt, is_code_challenge, code_language);
      return res.status(200).json({ result });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
