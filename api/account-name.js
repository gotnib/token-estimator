import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in.' });
  const token = authHeader.replace('Bearer ', '');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const username = String(req.body?.username || '').trim().replace(/\s+/g, ' ');
  if (username.length < 2 || username.length > 40) {
    return res.status(400).json({ error: 'Display name must be between 2 and 40 characters.' });
  }

  let saved = false;
  let dbError = null;
  for (const col of ['username', 'display_name', 'full_name', 'name']) {
    const { error } = await supabase.from('users').update({ [col]: username }).eq('id', user.id);
    if (!error) {
      saved = true;
      break;
    }
    dbError = error;
  }

  const { error: metaError } = await supabase.auth.updateUser({ data: { display_name: username } });
  if (metaError && !saved) {
    return res.status(500).json({ error: dbError?.message || metaError.message });
  }

  return res.status(200).json({ ok: true, username, saved_to_users: saved });
}
