import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe      = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  const { data: profile } = await supabase
    .from('users')
    .select('plan, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', user.id)
    .single();

  const { plan: requestedPlan } = req.body;
  if (!['plus', 'pro'].includes(requestedPlan)) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  if (profile?.plan === requestedPlan && profile?.subscription_status === 'active') {
    return res.status(400).json({ error: 'You are already on this plan.' });
  }

  const priceId = requestedPlan === 'plus'
    ? process.env.STRIPE_PLUS_PRICE_ID
    : process.env.STRIPE_PRO_PRICE_ID;

  const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    const subId  = profile?.stripe_subscription_id;
    const status = profile?.subscription_status;

    // Existing subscriber — swap plan immediately
    if (subId && (status === 'active' || status === 'cancelling')) {
      const subscription = await stripe.subscriptions.retrieve(subId);
      const itemId       = subscription.items.data[0]?.id;
      if (!itemId) throw new Error('Could not find subscription item.');

      const updated = await stripe.subscriptions.update(subId, {
        cancel_at_period_end: false,
        proration_behavior: 'create_prorations',
        items: [{ id: itemId, price: priceId }],
        metadata: { supabase_user_id: user.id, plan: requestedPlan }
      });

      const expiresAt = new Date(updated.current_period_end * 1000).toISOString();

      await supabase.from('users').update({
        plan: requestedPlan,
        subscription_status: 'active',
        plan_expires_at: expiresAt
      }).eq('id', user.id);

      return res.status(200).json({ upgraded: true, plan: requestedPlan });
    }

    // New subscriber — create customer if needed then checkout
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      });
      customerId = customer.id;
      await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?upgraded=true`,
      cancel_url:  `${appUrl}/account`,
      metadata: { supabase_user_id: user.id, plan: requestedPlan },
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan: requestedPlan }
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
