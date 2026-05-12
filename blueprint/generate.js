// Generate a blueprint from a saved chat log
// Calls Claude to extract workflow, variables, setup steps
// Gated: Free = blocked, Plus = 10/month, Pro = unlimited
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 }; // Blueprint generation can take longer on large chats

const BLUEPRINT_LIMITS = {
  free: 0,
  plus: 10,
  pro:  Infinity,
};

function checkRollingWindow(usedCount, startAt, windowDays) {
  const now            = new Date();
  const start          = startAt ? new Date(startAt) : null;
  const daysSinceStart = start ? (now - start) / (1000 * 60 * 60 * 24) : 999;
  const isExpired      = daysSinceStart >= windowDays;
  return { currentUsed: isExpired ? 0 : (usedCount || 0), isExpired };
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

const BLUEPRINT_SYSTEM = `You are an expert workflow architect. Your job is to analyze a chat conversation log and extract a reusable, templated workflow blueprint.

Return ONLY valid JSON, no markdown, no preamble:
{
  "title": "<concise descriptive title for this workflow, max 60 chars>",
  "summary": "<1-2 sentence description of what this workflow accomplishes>",
  "variables": {
    "<VARIABLE_NAME>": "<description of what this variable represents>"
  },
  "setup_steps": [
    {
      "service": "<service name e.g. Supabase, Vercel, Stripe, GitHub, or General>",
      "instruction": "<specific actionable setup instruction extracted from the chat>"
    }
  ],
  "blueprint_steps": [
    {
      "step": <integer>,
      "instruction": "<the prompt or instruction to send to the AI, with variable slots like [COMPANY_NAME] inline>",
      "note": "<optional: any context about why this step matters or what to watch for>"
    }
  ],
  "detected_stack": ["<technology or service name>"],
  "category": "<one of: Development, Design, Marketing, Writing, Analysis, Research, Business, Other>"
}

Rules:
- VARIABLES: Identify every specific value that would change between uses — project names, company names, URLs, tech choices, color specs, design decisions, domain names, etc. Use ALL_CAPS_WITH_UNDERSCORES. Only extract genuinely variable elements, not universal constants.
- SETUP_STEPS: Extract only concrete setup steps that were discussed or implied in the chat — things a user must do BEFORE starting. Group by service. Skip if no setup was needed.
- BLUEPRINT_STEPS: Extract only the USER'S prompt instructions, not the AI's responses. Remove all conversational filler, clarifications, and back-and-forth. Distill to the core sequence of instructions. Insert [VARIABLE_NAME] slots inline where specific values appeared. Number sequentially.
- DO NOT include AI responses in blueprint_steps — only the prompts/instructions the user gave.
- DO NOT fabricate steps that weren't in the original chat.
- Max 20 blueprint steps. Max 15 variables. Max 10 setup steps.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.body) return res.status(400).json({ error: 'Empty request body.' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!supabaseUrl || !supabaseKey || !anthropicKey) return res.status(500).json({ error: 'Server misconfiguration.' });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const supabaseService = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY || supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile } = await supabase
    .from('users')
    .select('plan, deactivated, blueprints_this_period, blueprint_period_start_at')
    .eq('id', user.id)
    .single();

  if (profile?.deactivated) return res.status(403).json({ error: 'Account deactivated.' });

  const plan = profile?.plan || 'free';

  // ── Plan gating ───────────────────────────────────────────────────────
  if (plan === 'free') {
    return res.status(403).json({
      error: 'blueprint_upgrade_required',
      plan,
      message: 'Blueprint generation is a Plus/Pro feature. Upgrade to generate blueprints from your saved chats.',
      upgrade_prompt: 'Free accounts can save chat logs. Upgrade to Plus for 10 blueprints/month or Pro for unlimited.'
    });
  }

  if (plan === 'plus') {
    const { currentUsed, isExpired } = checkRollingWindow(
      profile.blueprints_this_period,
      profile.blueprint_period_start_at,
      30
    );
    if (currentUsed >= BLUEPRINT_LIMITS.plus) {
      return res.status(403).json({
        error: 'blueprint_limit_reached',
        plan,
        used: currentUsed,
        limit: BLUEPRINT_LIMITS.plus,
        resets_in: resetIn(profile.blueprint_period_start_at, 30),
        message: `You've used all ${BLUEPRINT_LIMITS.plus} blueprint generations this month. Upgrade to Pro for unlimited blueprints.`
      });
    }
  }

  const { chat_log_id } = req.body;
  if (!chat_log_id) return res.status(400).json({ error: 'chat_log_id is required.' });

  // ── Fetch chat log — must belong to this user ─────────────────────────
  const { data: chatLog, error: chatError } = await supabase
    .from('chat_logs')
    .select('id, raw_text, platform, token_count, title')
    .eq('id', chat_log_id)
    .eq('user_id', user.id)
    .single();

  if (chatError || !chatLog) return res.status(404).json({ error: 'Chat log not found.' });

  // ── Call Claude to generate blueprint ────────────────────────────────
  try {
    const chatText = chatLog.raw_text.slice(0, 80000); // ~20k tokens max input
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: BLUEPRINT_SYSTEM,
        messages: [{ role: 'user', content: `Analyze this chat log and extract a reusable blueprint:\n\n${chatText}` }]
      })
    });

    clearTimeout(timeout);

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      console.error('Blueprint Claude error:', err);
      throw new Error('Blueprint generation failed. Please try again.');
    }

    const apiData = await apiRes.json();
    const raw     = (apiData.content || []).map(c => c.text || '').join('');
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let blueprintJson;
    try { blueprintJson = JSON.parse(cleaned); }
    catch(e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { blueprintJson = JSON.parse(match[0]); }
        catch(e2) { throw new Error('Could not parse blueprint response.'); }
      } else {
        throw new Error('Could not parse blueprint response.');
      }
    }

    // ── Save blueprint to Supabase ────────────────────────────────────
    const { data: savedBlueprint, error: saveError } = await supabaseService
      .from('blueprints')
      .insert({
        user_id:         user.id,
        chat_log_id:     chatLog.id,
        title:           blueprintJson.title || chatLog.title || 'Untitled Blueprint',
        platform:        chatLog.platform,
        token_count:     chatLog.token_count,
        variables:       blueprintJson.variables || {},
        setup_steps:     blueprintJson.setup_steps || [],
        blueprint_steps: blueprintJson.blueprint_steps || [],
        raw_json:        blueprintJson,
        is_public:       false,
      })
      .select('id, title, created_at')
      .single();

    if (saveError) throw saveError;

    // ── Update blueprint usage counter ────────────────────────────────
    if (plan === 'plus') {
      const { currentUsed, isExpired } = checkRollingWindow(
        profile.blueprints_this_period,
        profile.blueprint_period_start_at,
        30
      );
      const now = new Date();
      await supabaseService.from('users').update({
        blueprints_this_period: currentUsed + 1,
        blueprint_period_start_at: isExpired || !profile.blueprint_period_start_at
          ? now.toISOString()
          : profile.blueprint_period_start_at
      }).eq('id', user.id);
    }

    return res.status(200).json({
      ok: true,
      blueprint_id: savedBlueprint.id,
      blueprint: { ...blueprintJson, id: savedBlueprint.id, created_at: savedBlueprint.created_at }
    });

  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Blueprint generation timed out. Try with a shorter chat log.' });
    console.error('Blueprint generate error:', err.message);
    return res.status(500).json({ error: err.message || 'Blueprint generation failed.' });
  }
}
