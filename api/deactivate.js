import Stripe from 'stripe';
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

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_subscription_id, plan')
    .eq('id', user.id)
    .single();

  try {
    // Cancel any active Stripe subscription immediately
    if (profile?.stripe_subscription_id && profile?.plan !== 'free') {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      await stripe.subscriptions.cancel(profile.stripe_subscription_id);
    }

    // Deactivate account — keeps data, blocks access
    await supabase.from('users').update({
      deactivated: true,
      plan: 'free',
      stripe_subscription_id: null,
      subscription_status: 'cancelled'
    }).eq('id', user.id);

    // Sign out the user
    await supabase.auth.signOut();

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
