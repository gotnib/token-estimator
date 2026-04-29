import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Disable body parsing — Stripe needs the raw body to verify signature
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);

  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    console.log('Webhook event received:', event.type);

    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        let userId    = session.metadata?.supabase_user_id;
        const plan    = session.metadata?.plan;
        const subId   = session.subscription;
        const custId  = session.customer;

        console.log('checkout.session.completed:', { userId, plan, subId, custId, metadata: session.metadata });

        // Fallback — look up user by Stripe customer ID if metadata is missing
        if (!userId && custId) {
          const { data: found, error: findError } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', custId)
            .single();
          console.log('Customer lookup:', { found, findError, custId });
          if (found) userId = found.id;
        }

        if (!userId || !plan) {
          console.error('Webhook: missing userId or plan', { userId, plan, custId });
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subId);
        const expiresAt    = new Date(subscription.current_period_end * 1000).toISOString();

        const { error: updateError } = await supabase.from('users').update({
          plan,
          stripe_subscription_id: subId,
          subscription_status: 'active',
          plan_expires_at: expiresAt
        }).eq('id', userId);

        if (updateError) console.error('Webhook: update failed', updateError);
        else console.log(`✓ Upgraded user ${userId} to ${plan}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        let userId         = subscription.metadata?.supabase_user_id;
        const plan         = subscription.metadata?.plan;
        const custId       = subscription.customer;

        // Fallback — look up user by Stripe customer ID
        if (!userId && custId) {
          const { data: found } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', custId)
            .single();
          if (found) userId = found.id;
        }

        if (!userId) break;

        const status    = subscription.status;
        const expiresAt = new Date(subscription.current_period_end * 1000).toISOString();

        // If subscription is active or trialing, keep plan
        // If cancel_at_period_end is set, keep plan but mark status
        const dbStatus = subscription.cancel_at_period_end ? 'cancelling' : status;

        const update = {
          stripe_subscription_id: subscription.id,
          subscription_status: dbStatus,
          plan_expires_at: expiresAt
        };

        // Only update plan if subscription is active
        if (plan && (status === 'active' || status === 'trialing')) {
          update.plan = plan;
        }

        await supabase.from('users').update(update).eq('id', userId);
        console.log(`✓ Subscription updated for user ${userId}: ${dbStatus}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        let userId         = subscription.metadata?.supabase_user_id;
        const custId       = subscription.customer;

        if (!userId && custId) {
          const { data: found } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', custId)
            .single();
          if (found) userId = found.id;
        }

        if (!userId) break;

        // Downgrade to free
        await supabase.from('users').update({
          plan: 'free',
          stripe_subscription_id: null,
          subscription_status: 'cancelled',
          plan_expires_at: null
        }).eq('id', userId);

        console.log(`✓ Downgraded user ${userId} to free`);
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}
