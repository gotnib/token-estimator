// /api/blueprint.js
// Single merged Blueprint API endpoint
// Replaces:
//   /api/blueprint/save
//   /api/blueprint/list
//   /api/blueprint/generate
//   /api/blueprint/update

import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const BLUEPRINT_LIMITS = {
  free: 0,
  plus: 10,
  pro: Infinity,
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer ', '');
}

function checkRollingWindow(usedCount, startAt, windowDays) {
  const now = new Date();
  const start = startAt ? new Date(startAt) : null;
  const daysSinceStart = start ? (now - start) / (1000 * 60 * 60 * 24) : 999;
  const isExpired = daysSinceStart >= windowDays;
  return {
    currentUsed: isExpired ? 0 : usedCount || 0,
    isExpired,
  };
}

function resetIn(startAt, windowDays) {
  const resetsAt = new Date(new Date(startAt).getTime() + windowDays * 24 * 60 * 60 * 1000);
  const msUntil = resetsAt - new Date();
  const days = Math.floor(msUntil / (1000 * 60 * 60 * 24));
  const hours = Math.floor((msUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.ceil((msUntil % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

async function getAuthedClients(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: { status: 401, body: { error: 'Not logged in.' } } };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { error: { status: 500, body: { error: 'Server misconfiguration.' } } };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const supabaseService = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY || supabaseKey
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { error: { status: 401, body: { error: 'Invalid session.' } } };
  }

  return { supabase, supabaseService, user };
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

async function listLibrary(req, res, ctx) {
  const { supabase, user } = ctx;

  try {
    const [chatLogsResult, blueprintsResult, profileResult] = await Promise.all([
      supabase
        .from('chat_logs')
        .select('id, platform, title, token_count, created_at, raw_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),

      supabase
        .from('blueprints')
        .select('id, chat_log_id, title, platform, token_count, variables, setup_steps, blueprint_steps, raw_json, is_public, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),

      supabase
        .from('users')
        .select('plan, blueprints_this_period, blueprint_period_start_at')
        .eq('id', user.id)
        .single(),
    ]);

    const blueprints = blueprintsResult.data || [];
    const chatLogs = (chatLogsResult.data || []).map(log => ({
      ...log,
      preview: log.raw_text?.slice(0, 300) || '',
      raw_text: undefined,
      has_blueprint: blueprints.some(b => b.chat_log_id === log.id),
    }));

    const plan = profileResult.data?.plan || 'free';
    const blueprintsUsed = profileResult.data?.blueprints_this_period || 0;
    const blueprintLimit = plan === 'plus' ? 10 : plan === 'pro' ? null : 0;

    return res.status(200).json({
      chat_logs: chatLogs,
      blueprints,
      plan,
      blueprints_used: blueprintsUsed,
      blueprint_limit: blueprintLimit,
    });
  } catch (err) {
    console.error('Blueprint list error:', err.message);
    return res.status(500).json({ error: 'Failed to load library.' });
  }
}

async function saveChatLog(req, res, ctx) {
  const { supabase, supabaseService, user } = ctx;

  const { data: profile } = await supabase
    .from('users')
    .select('plan, deactivated')
    .eq('id', user.id)
    .single();

  if (profile?.deactivated) {
    return res.status(403).json({ error: 'Account deactivated.' });
  }

  const { raw_text, platform, token_count, title } = req.body;

  if (!raw_text || typeof raw_text !== 'string' || raw_text.trim().length < 10) {
    return res.status(400).json({ error: 'Chat log is empty or too short.' });
  }

  if (raw_text.length > 500000) {
    return res.status(400).json({ error: 'Chat log too large (max 500k characters).' });
  }

  const autoTitle = title?.trim()
    || raw_text.trim().split('\n').find(l => l.trim().length > 10)?.slice(0, 80)
    || 'Untitled chat';

  try {
    const { data, error } = await supabaseService
      .from('chat_logs')
      .insert({
        user_id: user.id,
        platform: platform || 'Unknown',
        title: autoTitle,
        raw_text: raw_text.trim(),
        token_count: token_count || 0,
      })
      .select('id, title, platform, token_count, created_at')
      .single();

    if (error) throw error;
    return res.status(200).json({ ok: true, chat_log: data });
  } catch (err) {
    console.error('Blueprint save error:', err.message);
    return res.status(500).json({ error: 'Failed to save chat log.' });
  }
}

async function generateBlueprint(req, res, ctx) {
  const { supabase, supabaseService, user } = ctx;

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('plan, deactivated, blueprints_this_period, blueprint_period_start_at')
    .eq('id', user.id)
    .single();

  if (profile?.deactivated) {
    return res.status(403).json({ error: 'Account deactivated.' });
  }

  const plan = profile?.plan || 'free';

  if (plan === 'free') {
    return res.status(403).json({
      error: 'blueprint_upgrade_required',
      plan,
      message: 'Blueprint generation is a Plus/Pro feature. Upgrade to generate blueprints from your saved chats.',
      upgrade_prompt: 'Free accounts can save chat logs. Upgrade to Plus for 10 blueprints/month or Pro for unlimited.',
    });
  }

  if (plan === 'plus') {
    const { currentUsed } = checkRollingWindow(
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
        message: `You've used all ${BLUEPRINT_LIMITS.plus} blueprint generations this month. Upgrade to Pro for unlimited blueprints.`,
      });
    }
  }

  const { chat_log_id } = req.body;
  if (!chat_log_id) {
    return res.status(400).json({ error: 'chat_log_id is required.' });
  }

  const { data: chatLog, error: chatError } = await supabase
    .from('chat_logs')
    .select('id, raw_text, platform, token_count, title')
    .eq('id', chat_log_id)
    .eq('user_id', user.id)
    .single();

  if (chatError || !chatLog) {
    return res.status(404).json({ error: 'Chat log not found.' });
  }

  try {
    const chatText = chatLog.raw_text.slice(0, 80000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: BLUEPRINT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Analyze this chat log and extract a reusable blueprint:\n\n${chatText}`,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({}));
      console.error('Blueprint Claude error:', err);
      throw new Error('Blueprint generation failed. Please try again.');
    }

    const apiData = await apiRes.json();
    const raw = (apiData.content || []).map(c => c.text || '').join('');
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let blueprintJson;
    try {
      blueprintJson = JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse blueprint response.');
      try {
        blueprintJson = JSON.parse(match[0]);
      } catch (e2) {
        throw new Error('Could not parse blueprint response.');
      }
    }

    const { data: savedBlueprint, error: saveError } = await supabaseService
      .from('blueprints')
      .insert({
        user_id: user.id,
        chat_log_id: chatLog.id,
        title: blueprintJson.title || chatLog.title || 'Untitled Blueprint',
        platform: chatLog.platform,
        token_count: chatLog.token_count,
        variables: blueprintJson.variables || {},
        setup_steps: blueprintJson.setup_steps || [],
        blueprint_steps: blueprintJson.blueprint_steps || [],
        raw_json: blueprintJson,
        is_public: false,
      })
      .select('id, title, created_at')
      .single();

    if (saveError) throw saveError;

    if (plan === 'plus') {
      const { currentUsed, isExpired } = checkRollingWindow(
        profile.blueprints_this_period,
        profile.blueprint_period_start_at,
        30
      );
      const now = new Date();
      await supabaseService
        .from('users')
        .update({
          blueprints_this_period: currentUsed + 1,
          blueprint_period_start_at: isExpired || !profile.blueprint_period_start_at
            ? now.toISOString()
            : profile.blueprint_period_start_at,
        })
        .eq('id', user.id);
    }

    return res.status(200).json({
      ok: true,
      blueprint_id: savedBlueprint.id,
      blueprint: {
        ...blueprintJson,
        id: savedBlueprint.id,
        created_at: savedBlueprint.created_at,
      },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Blueprint generation timed out. Try with a shorter chat log.' });
    }
    console.error('Blueprint generate error:', err.message);
    return res.status(500).json({ error: err.message || 'Blueprint generation failed.' });
  }
}

async function deleteItem(req, res, ctx) {
  const { supabaseService, user } = ctx;
  const { id, type } = req.body;

  if (!id || !type) return res.status(400).json({ error: 'id and type required.' });
  if (!['chat_log', 'blueprint'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });

  const table = type === 'chat_log' ? 'chat_logs' : 'blueprints';

  try {
    const { error } = await supabaseService
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Blueprint delete error:', err.message);
    return res.status(500).json({ error: 'Delete failed.' });
  }
}

async function togglePublic(req, res, ctx) {
  const { supabase, supabaseService, user } = ctx;
  const { id } = req.body;

  if (!id) return res.status(400).json({ error: 'id required.' });

  try {
    const { data: current } = await supabase
      .from('blueprints')
      .select('is_public')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!current) return res.status(404).json({ error: 'Blueprint not found.' });

    const nextIsPublic = !current.is_public;

    const { error } = await supabaseService
      .from('blueprints')
      .update({ is_public: nextIsPublic })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return res.status(200).json({ ok: true, is_public: nextIsPublic });
  } catch (err) {
    console.error('Toggle public error:', err.message);
    return res.status(500).json({ error: 'Update failed.' });
  }
}

async function forkBlueprint(req, res, ctx) {
  const { supabase, supabaseService, user } = ctx;
  const { id } = req.body;

  if (!id) return res.status(400).json({ error: 'id required.' });

  try {
    const { data: source } = await supabase
      .from('blueprints')
      .select('*')
      .eq('id', id)
      .single();

    if (!source) return res.status(404).json({ error: 'Blueprint not found.' });
    if (!source.is_public && source.user_id !== user.id) {
      return res.status(403).json({ error: 'Blueprint is private.' });
    }

    const { data: forked, error: forkError } = await supabaseService
      .from('blueprints')
      .insert({
        user_id: user.id,
        chat_log_id: null,
        title: `${source.title} (fork)`,
        platform: source.platform,
        token_count: source.token_count,
        variables: source.variables,
        setup_steps: source.setup_steps,
        blueprint_steps: source.blueprint_steps,
        raw_json: source.raw_json,
        is_public: false,
      })
      .select('id, title, created_at')
      .single();

    if (forkError) throw forkError;
    return res.status(200).json({ ok: true, blueprint_id: forked.id, title: forked.title });
  } catch (err) {
    console.error('Fork error:', err.message);
    return res.status(500).json({ error: 'Fork failed.' });
  }
}

async function getBlueprint(req, res, ctx) {
  const { supabase, user } = ctx;
  const id = req.body?.id || req.query?.id;

  if (!id) return res.status(400).json({ error: 'id required.' });

  try {
    const { data } = await supabase
      .from('blueprints')
      .select('id, user_id, title, platform, token_count, variables, setup_steps, blueprint_steps, raw_json, is_public, created_at')
      .eq('id', id)
      .single();

    if (!data) return res.status(404).json({ error: 'Blueprint not found.' });
    if (!data.is_public && data.user_id !== user.id) {
      return res.status(403).json({ error: 'Blueprint is private.' });
    }

    const { user_id, ...safeBlueprint } = data;
    return res.status(200).json({ blueprint: safeBlueprint });
  } catch (err) {
    console.error('Get blueprint error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch blueprint.' });
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await getAuthedClients(req);
  if (ctx.error) {
    return res.status(ctx.error.status).json(ctx.error.body);
  }

  if (req.method === 'GET') {
    const action = req.query?.action || 'list';
    if (action === 'list') return listLibrary(req, res, ctx);
    if (action === 'get') return getBlueprint(req, res, ctx);
    return res.status(400).json({ error: 'Unknown action.' });
  }

  if (!req.body) {
    return res.status(400).json({ error: 'Empty request body.' });
  }

  const action = req.body.action;

  if (req.method === 'DELETE') {
    return deleteItem(req, res, ctx);
  }

  if (action === 'save') return saveChatLog(req, res, ctx);
  if (action === 'list') return listLibrary(req, res, ctx);
  if (action === 'generate') return generateBlueprint(req, res, ctx);
  if (action === 'delete') return deleteItem(req, res, ctx);
  if (action === 'toggle_public') return togglePublic(req, res, ctx);
  if (action === 'fork') return forkBlueprint(req, res, ctx);
  if (action === 'get') return getBlueprint(req, res, ctx);

  return res.status(400).json({ error: 'Unknown action.' });
}
