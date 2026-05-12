// Fetch user's library: chat logs + blueprints
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server misconfiguration.' });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  try {
    const [chatLogsResult, blueprintsResult, profileResult] = await Promise.all([
      // Chat logs — newest first, preview of first 300 chars
      supabase
        .from('chat_logs')
        .select('id, platform, title, token_count, created_at, raw_text')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),

      // Blueprints — newest first, full data for rendering
      supabase
        .from('blueprints')
        .select('id, chat_log_id, title, platform, token_count, variables, setup_steps, blueprint_steps, raw_json, is_public, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),

      // Profile for plan/limit info
      supabase
        .from('users')
        .select('plan, blueprints_this_period, blueprint_period_start_at')
        .eq('id', user.id)
        .single()
    ]);

    // Trim raw_text to preview only — don't send full chat log on list
    const chatLogs = (chatLogsResult.data || []).map(log => ({
      ...log,
      preview: log.raw_text?.slice(0, 300) || '',
      raw_text: undefined, // strip full text from list response
      has_blueprint: (blueprintsResult.data || []).some(b => b.chat_log_id === log.id)
    }));

    const plan = profileResult.data?.plan || 'free';
    const blueprintsUsed = profileResult.data?.blueprints_this_period || 0;
    const blueprintLimit = plan === 'plus' ? 10 : plan === 'pro' ? null : 0;

    return res.status(200).json({
      chat_logs:       chatLogs,
      blueprints:      blueprintsResult.data || [],
      plan,
      blueprints_used: blueprintsUsed,
      blueprint_limit: blueprintLimit,
    });

  } catch (err) {
    console.error('Blueprint list error:', err.message);
    return res.status(500).json({ error: 'Failed to load library.' });
  }
}
