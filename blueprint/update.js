// CRUD operations: toggle public, delete chat log, delete blueprint, fork blueprint
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!req.body) return res.status(400).json({ error: 'Empty request body.' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server misconfiguration.' });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const supabaseService = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY || supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { action, id, type } = req.body;

  // ── DELETE chat log or blueprint ──────────────────────────────────────
  if (action === 'delete') {
    if (!id || !type) return res.status(400).json({ error: 'id and type required.' });
    if (!['chat_log', 'blueprint'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });
    const table = type === 'chat_log' ? 'chat_logs' : 'blueprints';
    try {
      const { error } = await supabaseService.from(table).delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Blueprint delete error:', err.message);
      return res.status(500).json({ error: 'Delete failed.' });
    }
  }

  // ── TOGGLE public/private ─────────────────────────────────────────────
  if (action === 'toggle_public') {
    if (!id) return res.status(400).json({ error: 'id required.' });
    try {
      const { data: current } = await supabase.from('blueprints').select('is_public').eq('id', id).eq('user_id', user.id).single();
      if (!current) return res.status(404).json({ error: 'Blueprint not found.' });
      const { error } = await supabaseService.from('blueprints').update({ is_public: !current.is_public }).eq('id', id).eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ ok: true, is_public: !current.is_public });
    } catch (err) {
      console.error('Toggle public error:', err.message);
      return res.status(500).json({ error: 'Update failed.' });
    }
  }

  // ── FORK blueprint — create a copy owned by the requesting user ───────
  if (action === 'fork') {
    if (!id) return res.status(400).json({ error: 'id required.' });
    try {
      // Source can be any public blueprint or the user's own
      const { data: source } = await supabase
        .from('blueprints')
        .select('*')
        .eq('id', id)
        .single();
      if (!source) return res.status(404).json({ error: 'Blueprint not found.' });
      if (!source.is_public && source.user_id !== user.id) return res.status(403).json({ error: 'Blueprint is private.' });

      const { data: forked, error: forkError } = await supabaseService
        .from('blueprints')
        .insert({
          user_id:         user.id,
          chat_log_id:     null, // fork has no original chat log
          title:           `${source.title} (fork)`,
          platform:        source.platform,
          token_count:     source.token_count,
          variables:       source.variables,
          setup_steps:     source.setup_steps,
          blueprint_steps: source.blueprint_steps,
          raw_json:        source.raw_json,
          is_public:       false,
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

  // ── FETCH single blueprint (for public share page) ────────────────────
  if (action === 'get') {
    if (!id) return res.status(400).json({ error: 'id required.' });
    try {
      const { data } = await supabase
        .from('blueprints')
        .select('id, title, platform, token_count, variables, setup_steps, blueprint_steps, raw_json, is_public, created_at')
        .eq('id', id)
        .single();
      if (!data) return res.status(404).json({ error: 'Blueprint not found.' });
      if (!data.is_public && data.user_id !== user.id) return res.status(403).json({ error: 'Blueprint is private.' });
      return res.status(200).json({ blueprint: data });
    } catch (err) {
      console.error('Get blueprint error:', err.message);
      return res.status(500).json({ error: 'Failed to fetch blueprint.' });
    }
  }

  return res.status(400).json({ error: 'Unknown action.' });
}
