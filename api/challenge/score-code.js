import { createClient } from ‘@supabase/supabase-js’;

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

const { bad_code, user_code, ideal_code, code_language, description } = req.body;
if (!bad_code || !user_code || !ideal_code) {
return res.status(400).json({ error: ‘Missing required fields.’ });
}

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
system: `You are a senior ${code_language} developer scoring a student’s code optimization attempt. Return ONLY valid JSON with no markdown or preamble:
{
“score”: <integer 0-100>,
“grade”: “<A/B/C/D/F>”,
“summary”: “<2 sentences praising what they improved and noting what they missed>”,
“what_you_improved”: [”<specific improvement 1>”, “<specific improvement 2>”],
“what_you_missed”: [”<specific issue 1>”, “<specific issue 2>”],
“comparison”: “<one sentence comparing their code to the ideal version>”
}

Scoring:

- 90-100 (A): Fixed all major issues, clean and readable, comparable to ideal
- 75-89 (B): Fixed most issues, minor problems remain
- 60-74 (C): Fixed some issues but missed significant ones
- 40-59 (D): Made improvements but code still has major problems
- 0-39 (F): Little to no meaningful improvement

Be encouraging but honest. Focus on code quality, not just correctness.`, messages: [{ role: 'user', content: `Task: ${description}\n\nOriginal bad code:\n${bad_code}\n\nStudent’s rewritten code:\n${user_code}\n\nIdeal version:\n${ideal_code}`
}]
})
});

```
if (!apiRes.ok) throw new Error('API error ' + apiRes.status);
const data    = await apiRes.json();
const raw     = (data.content || []).map(c => c.text || '').join('').trim();
const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
return res.status(200).json({ result: JSON.parse(cleaned) });
```

} catch(err) {
return res.status(500).json({ error: err.message });
}
}
