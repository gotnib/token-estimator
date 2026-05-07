import { createClient } from '@supabase/supabase-js';

async function checkAdminRateLimit(ip) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return { allowed: true };
  const key = `adminrl:${ip}`;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 900]])
    });
    const [d] = await r.json();
    return (d?.result ?? 1) > 10 ? { allowed: false } : { allowed: true };
  } catch(e) { return { allowed: true }; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!req.body) return res.status(400).json({ error: 'Empty request body.' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || 'unknown';
  const rl = await checkAdminRateLimit(ip);
  if (!rl.allowed) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const now = new Date();

    // ── Users ─────────────────────────────────────────────────────────
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, plan, created_at, last_analysis_at, analyses_today, analyses_this_period, pro_analyses_this_period, deactivated, subscription_status, plan_expires_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (usersError) throw usersError;

    const total       = users?.length || 0;
    const active      = users?.filter(u => !u.deactivated).length || 0;
    const deactivated = users?.filter(u => u.deactivated).length || 0;

    const byPlan = {
      free: users?.filter(u => (u.plan || 'free') === 'free' && !u.deactivated).length || 0,
      plus: users?.filter(u => u.plan === 'plus' && !u.deactivated).length || 0,
      pro:  users?.filter(u => u.plan === 'pro'  && !u.deactivated).length || 0,
    };
    const mrr = (byPlan.plus * 9) + (byPlan.pro * 29);

    // ── Signups by day (30 days) ───────────────────────────────────────
    const signupsByDay = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      signupsByDay[d.toISOString().split('T')[0]] = 0;
    }
    users?.forEach(u => {
      const day = u.created_at?.split('T')[0];
      if (day && signupsByDay.hasOwnProperty(day)) signupsByDay[day]++;
    });

    // ── MRR trend (90 days) ────────────────────────────────────────────
    // FIX 3: Exclude churned/cancelled users from historical MRR counts
    // A user only contributed MRR on days they were an active paid subscriber
    const mrrByDay = {};
    for (let i = 89; i >= 0; i--) {
      const d      = new Date(now - i * 86400000);
      const day    = d.toISOString().split('T')[0];
      const plusCount = users?.filter(u => {
        if (u.plan !== 'plus') return false;
        if (u.created_at?.split('T')[0] > day) return false;
        // Exclude if they cancelled before this day
        if (['cancelled', 'cancelling'].includes(u.subscription_status) && u.plan_expires_at) {
          if (u.plan_expires_at.split('T')[0] < day) return false;
        }
        return true;
      }).length || 0;
      const proCount = users?.filter(u => {
        if (u.plan !== 'pro') return false;
        if (u.created_at?.split('T')[0] > day) return false;
        if (['cancelled', 'cancelling'].includes(u.subscription_status) && u.plan_expires_at) {
          if (u.plan_expires_at.split('T')[0] < day) return false;
        }
        return true;
      }).length || 0;
      mrrByDay[day] = (plusCount * 9) + (proCount * 29);
    }

    // ── Activity metrics ───────────────────────────────────────────────
    const todayStr    = now.toISOString().split('T')[0];
    const activeToday = users?.filter(u => u.last_analysis_at && (now - new Date(u.last_analysis_at)) / 3600000 < 24).length || 0;
    const activeWeek  = users?.filter(u => u.last_analysis_at && (now - new Date(u.last_analysis_at)) / 86400000 < 7).length || 0;

    // FIX 1: analysesToday — count users active in last 24h, not period totals
    // Plus/Pro don't have a per-day counter — the only reliable signal is last_analysis_at
    // So we count distinct users who had any analysis today, not total analyses
    // For free users we can use analyses_today (it IS a daily counter)
    // For plus/pro we count active users as a proxy — more honest than inflated period totals
    const freeAnalysesToday = users?.reduce((sum, u) => {
      if ((u.plan || 'free') !== 'free') return sum;
      const lastAt = u.last_analysis_at ? new Date(u.last_analysis_at) : null;
      if (!lastAt || (now - lastAt) / 3600000 >= 24) return sum;
      return sum + (u.analyses_today || 0);
    }, 0) || 0;
    // For plus/pro we count active users today as a lower-bound proxy
    const paidActiveToday = users?.filter(u =>
      (u.plan === 'plus' || u.plan === 'pro') &&
      u.last_analysis_at &&
      (now - new Date(u.last_analysis_at)) / 3600000 < 24
    ).length || 0;

    const newToday     = users?.filter(u => u.created_at?.startsWith(todayStr)).length || 0;
    const newThisWeek  = users?.filter(u => (now - new Date(u.created_at)) / 86400000 < 7).length || 0;
    const newThisMonth = users?.filter(u => (now - new Date(u.created_at)) / 86400000 < 30).length || 0;

    // ── Churn ──────────────────────────────────────────────────────────
    const churned      = users?.filter(u => ['cancelling', 'cancelled'].includes(u.subscription_status)).length || 0;
    const churnedMonth = users?.filter(u => {
      if (!['cancelling', 'cancelled'].includes(u.subscription_status)) return false;
      return u.plan_expires_at && (now - new Date(u.plan_expires_at)) / 86400000 < 30;
    }).length || 0;
    const totalEverPaid = users?.filter(u =>
      u.plan === 'plus' || u.plan === 'pro' ||
      ['cancelling','cancelled'].includes(u.subscription_status)
    ).length || 0;
    const churnRate = totalEverPaid > 0 ? Math.round((churned / totalEverPaid) * 100) : 0;

    // ── Limit-hit tracking ─────────────────────────────────────────────
    const freeAtLimit = users?.filter(u => {
      if ((u.plan || 'free') !== 'free' || u.deactivated) return false;
      const lastAt = u.last_analysis_at ? new Date(u.last_analysis_at) : null;
      const hoursSince = lastAt ? (now - lastAt) / 3600000 : 999;
      const usedToday = hoursSince < 24 ? (u.analyses_today || 0) : 0;
      return usedToday >= 5;
    }).length || 0;

    const plusNearLimit = users?.filter(u => {
      if (u.plan !== 'plus' || u.deactivated) return false;
      return (u.analyses_this_period || 0) >= 100;
    }).length || 0;

    // FIX 2: avgAnalysesPerActiveUser — use only free users (the only plan with reliable daily counter)
    // For plus/pro we show active user count instead — more honest
    const freeActiveWeek = users?.filter(u =>
      (u.plan || 'free') === 'free' &&
      u.last_analysis_at &&
      (now - new Date(u.last_analysis_at)) / 86400000 < 7
    ) || [];
    const totalFreeAnalysesWeek = freeActiveWeek.reduce((sum, u) => {
      const lastAt = u.last_analysis_at ? new Date(u.last_analysis_at) : null;
      const hoursSince = lastAt ? (now - lastAt) / 3600000 : 999;
      return sum + (hoursSince < 24 ? (u.analyses_today || 0) : 0);
    }, 0);
    const avgFreeAnalysesPerUser = freeActiveWeek.length > 0
      ? Math.round((totalFreeAnalysesWeek / freeActiveWeek.length) * 10) / 10
      : 0;

    // ── FIX 5: Token savings — clarify this is Pro-only data ──────────
    // prompt_history only stores Pro analyses — be explicit about this
    const { data: historyStats } = await supabase
      .from('prompt_history')
      .select('estimated_tokens, efficient_tokens');
    const totalTokensAnalyzed = historyStats?.reduce((s, r) => s + (r.estimated_tokens || 0), 0) || 0;
    const totalTokensSaved    = historyStats?.reduce((s, r) => s + Math.max(0, (r.estimated_tokens || 0) - (r.efficient_tokens || 0)), 0) || 0;
    const totalProAnalyses    = historyStats?.length || 0;
    const avgSavingsPct       = totalProAnalyses > 0 ? Math.round((totalTokensSaved / Math.max(totalTokensAnalyzed, 1)) * 100) : 0;

    // ── Recent signups ─────────────────────────────────────────────────
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 500 });
    const emailMap = {};
    authUsers?.users?.forEach(u => { emailMap[u.id] = u.email; });

    const recentSignups = users?.slice(0, 10).map(u => ({
      email:       emailMap[u.id] || 'unknown',
      plan:        u.plan || 'free',
      created_at:  u.created_at,
      last_active: u.last_analysis_at
    })) || [];

    return res.status(200).json({
      stats: {
        total, active, deactivated, byPlan, mrr,
        activeToday, activeWeek,
        // FIX 1: Split free daily analyses from paid active count
        freeAnalysesToday, paidActiveToday,
        // FIX 2: Avg only for free users where daily counter is reliable
        avgFreeAnalysesPerUser,
        newToday, newThisWeek, newThisMonth,
        churned, churnedMonth, churnRate,
        freeAtLimit, plusNearLimit,
        // FIX 5: Labelled as Pro-only
        totalTokensAnalyzed, totalTokensSaved, totalProAnalyses, avgSavingsPct,
      },
      signupsByDay,
      mrrByDay,  // FIX 3: Now excludes churned users from historical counts
      recentSignups
    });

  } catch (err) {
    console.error('Admin error:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
