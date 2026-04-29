import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile } = await supabase.from('users').select('plan').eq('id', user.id).single();
  if (profile?.plan !== 'pro') return res.status(403).json({ error: 'Library is a Pro feature.' });

  // GET — fetch history
  if (req.method === 'GET') {
    const savedOnly = req.query.saved === 'true';
    let query = supabase
      .from('prompt_history')
      .select('id, prompt, estimated_tokens, efficient_tokens, savings_percent, efficient_prompt, cost_estimate_usd, saved, label, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (savedOnly) query = query.eq('saved', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ history: data });
  }

  // PATCH — toggle saved or update label
  if (req.method === 'PATCH') {
    const { id, saved, label } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id.' });

    const updates = {};
    if (typeof saved === 'boolean') updates.saved = saved;
    if (typeof label === 'string') updates.label = label;

    const { error } = await supabase.from('prompt_history').update(updates).eq('id', id).eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  // DELETE — remove a history item
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    const { error } = await supabase.from('prompt_history').delete().eq('id', id).eq('user_id', user.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
