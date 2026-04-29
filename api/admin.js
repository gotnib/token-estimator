import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  // Use service key to bypass RLS
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // ── Total users by plan ──────────────────────────
    const { data: users } = await supabase
      .from('users')
      .select('plan, created_at, last_analysis_at, analyses_today, analyses_this_period, pro_analyses_this_period, deactivated');

    const now     = new Date();
    const total   = users?.length || 0;
    const active  = users?.filter(u => !u.deactivated).length || 0;
    const deactivated = users?.filter(u => u.deactivated).length || 0;

    const byPlan = {
      free: users?.filter(u => (u.plan || 'free') === 'free' && !u.deactivated).length || 0,
      plus: users?.filter(u => u.plan === 'plus' && !u.deactivated).length || 0,
      pro:  users?.filter(u => u.plan === 'pro'  && !u.deactivated).length || 0,
    };

    // ── MRR ─────────────────────────────────────────
    const mrr = (byPlan.plus * 9) + (byPlan.pro * 29);

    // ── Signups over last 30 days ────────────────────
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
    const signupsByDay  = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = d.toISOString().split('T')[0];
      signupsByDay[key] = 0;
    }
    users?.forEach(u => {
      const day = u.created_at?.split('T')[0];
      if (day && day >= thirtyDaysAgo.split('T')[0]) {
        signupsByDay[day] = (signupsByDay[day] || 0) + 1;
      }
    });

    // ── Active today (had an analysis in last 24hrs) ─
    const activeToday = users?.filter(u => {
      if (!u.last_analysis_at) return false;
      const hrs = (now - new Date(u.last_analysis_at)) / 3600000;
      return hrs < 24;
    }).length || 0;

    // ── Active this week ─────────────────────────────
    const activeWeek = users?.filter(u => {
      if (!u.last_analysis_at) return false;
      const days = (now - new Date(u.last_analysis_at)) / 86400000;
      return days < 7;
    }).length || 0;

    // ── Total analyses today across all users ────────
    const analysesToday = users?.reduce((sum, u) => {
      const lastAt = u.last_analysis_at ? new Date(u.last_analysis_at) : null;
      const hrs    = lastAt ? (now - lastAt) / 3600000 : 999;
      if (hrs < 24) {
        if (u.plan === 'pro')  return sum + (u.pro_analyses_this_period || 0);
        if (u.plan === 'plus') return sum + (u.analyses_this_period || 0);
        return sum + (u.analyses_today || 0);
      }
      return sum;
    }, 0);

    // ── New signups today ────────────────────────────
    const todayStr     = now.toISOString().split('T')[0];
    const newToday     = users?.filter(u => u.created_at?.startsWith(todayStr)).length || 0;
    const newThisWeek  = users?.filter(u => {
      const days = (now - new Date(u.created_at)) / 86400000;
      return days < 7;
    }).length || 0;
    const newThisMonth = users?.filter(u => {
      const days = (now - new Date(u.created_at)) / 86400000;
      return days < 30;
    }).length || 0;

    // ── Recent signups list ──────────────────────────
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 500 });
    const emailMap = {};
    authUsers?.users?.forEach(u => { emailMap[u.id] = u.email; });

    const recentSignups = users
      ?.filter(u => u.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
      .map(u => ({
        email: emailMap[u.id] || 'unknown',
        plan:  u.plan || 'free',
        created_at: u.created_at,
        last_active: u.last_analysis_at
      })) || [];

    return res.status(200).json({
      stats: {
        total, active, deactivated,
        byPlan, mrr,
        activeToday, activeWeek,
        analysesToday,
        newToday, newThisWeek, newThisMonth
      },
      signupsByDay,
      recentSignups
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
