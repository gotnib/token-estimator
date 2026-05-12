// Save raw chat log — no analysis, pure capture
// Called by the extension's "Save Chat as Blueprint" button
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 10 };

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
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server misconfiguration.' });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const supabaseService = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY || supabaseKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session.' });

  const { data: profile } = await supabase.from('users').select('plan, deactivated').eq('id', user.id).single();
  if (profile?.deactivated) return res.status(403).json({ error: 'Account deactivated.' });

  const { raw_text, platform, token_count, title } = req.body;
  if (!raw_text || typeof raw_text !== 'string' || raw_text.trim().length < 10) {
    return res.status(400).json({ error: 'Chat log is empty or too short.' });
  }
  if (raw_text.length > 500000) {
    return res.status(400).json({ error: 'Chat log too large (max 500k characters).' });
  }

  // Auto-generate title from first line if not provided
  const autoTitle = title?.trim() ||
    raw_text.trim().split('\n').find(l => l.trim().length > 10)?.slice(0, 80) ||
    'Untitled chat';

  try {
    const { data, error } = await supabaseService
      .from('chat_logs')
      .insert({
        user_id:     user.id,
        platform:    platform || 'Unknown',
        title:       autoTitle,
        raw_text:    raw_text.trim(),
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
