import { createClient } from ‘@supabase/supabase-js’;

const LANG_LABELS = {
python: ‘Python’, javascript: ‘JavaScript’, sql: ‘SQL’,
html: ‘HTML/CSS’, regex: ‘Regex’, bash: ‘Bash’
};

const CODE_TOPICS = {
python: [
‘validates an email address format’,
‘counts word frequency in a string’,
‘converts celsius to fahrenheit with edge cases’,
‘finds and removes duplicates from a list’,
‘generates a random password of given length’,
‘reads a list of numbers and returns basic statistics’,
‘checks if a string is a palindrome’,
‘flattens a nested list of arbitrary depth’,
‘retries a function call up to N times on failure’,
‘sorts a list of dictionaries by a specified key’,
],
javascript: [
‘debounces a function call by a given delay’,
‘deep clones a nested object’,
‘formats a number as currency’,
‘truncates a string to a max length with ellipsis’,
‘groups an array of objects by a property’,
‘converts a query string to a key-value object’,
‘checks if two arrays contain the same values’,
‘throttles a scroll event handler’,
‘validates a credit card number format’,
‘flattens a nested array to a single level’,
],
sql: [
‘finds the top 5 customers by total order value’,
‘calculates monthly revenue totals for the past year’,
‘finds users who registered but never made a purchase’,
‘gets the most recent order for each customer’,
‘counts orders grouped by status’,
‘finds products with zero sales in the last 30 days’,
‘calculates a running total of daily sales’,
‘finds duplicate email addresses in a users table’,
],
html: [
‘a pricing card with a featured plan highlight’,
‘a notification badge on a bell icon’,
‘a progress bar showing 65% completion’,
‘a simple toggle switch component’,
‘a star rating display out of five’,
‘a skeleton loading placeholder card’,
‘a tooltip that appears on hover’,
‘a responsive two-column layout’,
],
regex: [
‘validates a standard email address’,
‘matches a US phone number in multiple formats’,
‘extracts all URLs from a block of text’,
‘validates a strong password (8+ chars, uppercase, number, symbol)’,
‘matches an IPv4 address’,
‘detects consecutive duplicate words’,
‘validates a date in MM/DD/YYYY format’,
‘strips all HTML tags from a string’,
],
bash: [
‘backs up a directory with a timestamp in the name’,
‘finds and lists files older than 30 days’,
‘renames all files in a folder to lowercase’,
‘counts total lines across all .log files in a directory’,
‘extracts unique IP addresses from an access log’,
‘monitors disk usage and prints a warning if over 80%’,
]
};

function randomFrom(arr) {
return arr[Math.floor(Math.random() * arr.length)];
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

const token = req.headers.authorization?.replace(’Bearer ’, ‘’);
if (!token) return res.status(401).json({ error: ‘Not logged in.’ });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
global: { headers: { Authorization: `Bearer ${token}` } }
});

const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return res.status(401).json({ error: ‘Invalid session.’ });

const { data: profile } = await supabase
.from(‘users’).select(‘plan’).eq(‘id’, user.id).single();

if (profile?.plan !== ‘pro’) {
return res.status(403).json({ error: ‘Pro plan required.’ });
}

const { code_language } = req.body;
if (!code_language) return res.status(400).json({ error: ‘Missing code_language.’ });

const langLabel = LANG_LABELS[code_language] || code_language;
const topics    = CODE_TOPICS[code_language] || CODE_TOPICS.python;
const topic     = randomFrom(topics);

// Randomize which bad code patterns to use
const BAD_PATTERNS = [
‘no error handling or input validation’,
‘overly verbose variable names that repeat context’,
‘redundant intermediate variables that add no clarity’,
‘no comments or documentation’,
‘inefficient logic that could be simplified’,
‘magic numbers with no explanation’,
‘repeated code that could be extracted to a helper’,
‘inconsistent naming conventions’,
‘doing multiple things in one function (violates single responsibility)’,
‘no type hints or type safety considerations’,
];
const shuffled = […BAD_PATTERNS].sort(() => Math.random() - 0.5);
const patterns = shuffled.slice(0, 3);

try {
const apiRes = await fetch(‘https://api.anthropic.com/v1/messages’, {
method: ‘POST’,
headers: {
‘content-type’: ‘application/json’,
‘x-api-key’: process.env.ANTHROPIC_API_KEY,
‘anthropic-version’: ‘2023-06-01’
},
body: JSON.stringify({
model: ‘claude-sonnet-4-5’,
max_tokens: 800,
system: `You generate intentionally bad but functional ${langLabel} code for a code optimization training exercise.
Return ONLY valid JSON with no markdown or preamble:
{
“description”: “<one sentence describing what this code is supposed to do>”,
“bad_code”: “<the bad but functional code>”,
“ideal_code”: “<the clean, optimized version>”,
“issues”: [”<issue 1>”, “<issue 2>”, “<issue 3>”]
}

The bad code MUST:

- Be functional (it works, just poorly written)
- Include these specific problems: ${patterns.join(’; ’)}
- Be 15-35 lines maximum
- Feel like something written hastily by a junior developer

The ideal code MUST:

- Solve the exact same problem
- Be clean, readable, and well-structured
- Be noticeably better but not dramatically different in length
- Maximum 25 lines

The task is: ${langLabel} code that ${topic}`,
messages: [{ role: ‘user’, content: ‘Generate the code challenge now.’ }]
})
});

```
if (!apiRes.ok) throw new Error('API error ' + apiRes.status);
const data    = await apiRes.json();
const raw     = (data.content || []).map(c => c.text || '').join('').trim();
const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
const parsed  = JSON.parse(cleaned);

return res.status(200).json({
  code_language,
  lang_label: langLabel,
  topic,
  description:  parsed.description,
  bad_code:     parsed.bad_code,
  ideal_code:   parsed.ideal_code,
  issues:       parsed.issues || []
});
```

} catch(err) {
return res.status(500).json({ error: err.message });
}
}
