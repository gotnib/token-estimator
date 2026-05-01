export const config = { maxDuration: 30 };

const DEMO_SYSTEM = `You are a prompt efficiency expert. Analyze the given prompt and return ONLY valid JSON:
{
  "estimated_tokens": <integer>,
  "efficient_prompt": "<optimized version — remove filler, hedging, politeness overhead, redundancy>",
  "savings_percent": <integer 0-100>,
  "efficient_tokens": <integer>
}

Rules:
- Remove politeness overhead, hedging, filler words
- Tighten phrasing into direct language
- Preserve all genuine requirements
- efficient_prompt must use single quotes only, no special characters
- Return ONLY the JSON object, no markdown, no explanation`;

// Simple in-memory IP rate limiting — 1 demo per IP per hour
const ipCache = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = ipCache.get(ip);
  if (entry && now - entry < 3600000) return true;
  ipCache.set(ip, now);
  // Clean old entries occasionally
  if (ipCache.size > 10000) {
    for (const [k, v] of ipCache) {
      if (now - v > 3600000) ipCache.delete(k);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Get client IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'One demo per hour. Sign up free for unlimited access.' });
  }

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  // Hard limit — demo only for short prompts
  const trimmed = prompt.trim().slice(0, 500);
  if (trimmed.length < 10) {
    return res.status(400).json({ error: 'Prompt too short' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        system: DEMO_SYSTEM,
        messages: [{ role: 'user', content: `Analyze this prompt:\n\n${trimmed}` }]
      })
    });

    clearTimeout(timeout);

    if (!apiRes.ok) throw new Error('API error ' + apiRes.status);

    const data    = await apiRes.json();
    const raw     = (data.content || []).map(c => c.text || '').join('');
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch(e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Could not parse response');
    }

    return res.status(200).json({ result });
  } catch(err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Analysis timed out — try a shorter prompt' });
    }
    console.error('Demo error:', err.message);
    return res.status(500).json({ error: 'Analysis failed — please try again' });
  }
}
