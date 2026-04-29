import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    .select('plan, stripe_subscription_id, plan_expires_at')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found.' });
  }

  try {
    // Cancel at period end — user keeps access until expiry
    const subscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

    await supabase.from('users').update({
      subscription_status: 'cancelling'
    }).eq('id', user.id);

    return res.status(200).json({
      ok: true,
      expires_at: expiresAt,
      message: `Your plan will remain active until ${new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
