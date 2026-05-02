(() => {
  const STYLE_ID = 'tl-user-plan-style';
  const PLAN_LABELS = { free: 'FREE', plus: 'PLUS', pro: 'PRO' };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tl-user-plan-wrap {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }

      .tl-nav-username {
        font-size: 13px;
        font-weight: 600;
        color: var(--text, rgb(60,61,89));
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tl-plan-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        padding: 4px 10px;
        letter-spacing: 0.04em;
      }

      .tl-plan-pill.free {
        background: var(--surface2, rgb(235,234,226));
        color: var(--muted, rgb(100,101,120));
        border: 1px solid var(--border, rgb(215,213,203));
      }

      .tl-plan-pill.plus {
        background: var(--accent-light, rgba(123,166,146,0.12));
        color: var(--accent, rgb(123,166,146));
        border: 1px solid rgba(123,166,146,0.3);
      }

      .tl-plan-pill.pro {
        background: var(--gold-light, #fef3c7);
        color: var(--gold, #b45309);
        border: 1px solid #fcd34d;
      }

      .tl-mobile-user-plan-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 12px;
        font-size: 13px;
        color: var(--text, rgb(60,61,89));
      }

      .tl-mobile-user-plan-row .tl-nav-username {
        max-width: 190px;
      }

      @media (max-width: 640px) {
        nav .nav-right > .tl-user-plan-wrap {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizePlan(plan) {
    const value = String(plan || 'free').trim().toLowerCase();
    return PLAN_LABELS[value] ? value : 'free';
  }

  function getDisplayName(user) {
    const metadata = user?.user_metadata || {};
    return (
      metadata.display_name ||
      metadata.full_name ||
      metadata.name ||
      metadata.username ||
      (user?.email || '').split('@')[0] ||
      'Account'
    );
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function makeUserPlanWrap(username, plan) {
    const normalized = normalizePlan(plan);
    const wrap = document.createElement('div');
    wrap.className = 'tl-user-plan-wrap';
    wrap.dataset.tlNavInjected = 'true';
    wrap.innerHTML = `
      <span class="tl-nav-username" title="${escapeAttr(username)}">${escapeHtml(username)}</span>
      <span class="tl-plan-pill ${normalized}">${PLAN_LABELS[normalized]}</span>
    `;
    return wrap;
  }

  function cleanOldDesktopNav(navRight) {
    document.querySelectorAll('[data-tl-nav-injected="true"]').forEach(el => el.remove());

    const nav = document.querySelector('nav');

    if (nav) {
      nav.querySelectorAll('#nav-plan-pill, #nav-center').forEach(el => {
        el.style.display = 'none';
        el.innerHTML = '';
      });

      nav.querySelectorAll('.priority-badge').forEach(el => {
        el.style.display = 'none';
      });

      nav.querySelectorAll('.plan-pill').forEach(el => {
        if (!el.classList.contains('tl-plan-pill')) {
          el.style.display = 'none';
        }
      });

      nav.querySelectorAll('#nav-username, .nav-username').forEach(el => {
        if (!el.classList.contains('tl-nav-username')) {
          el.style.display = 'none';
        }
      });

      Array.from(nav.querySelectorAll('span, div')).forEach(el => {
        const text = (el.textContent || '').trim();
        const hasChildren = el.children.length > 0;
        const isLikelyOldPlanText = ['FREE', 'PLUS', 'PRO'].includes(text);
        if (!hasChildren && isLikelyOldPlanText && !el.classList.contains('tl-plan-pill')) {
          el.style.display = 'none';
        }
      });
    }

    if (navRight) {
      Array.from(navRight.childNodes).forEach(node => {
        if (node.nodeType !== Node.TEXT_NODE) return;
        if (!node.textContent.trim()) return;
        node.textContent = '';
      });
    }
  }

  function applyDesktopNav(username, plan) {
    const navRight = document.querySelector('nav .nav-right');
    if (!navRight) return;

    cleanOldDesktopNav(navRight);

    const wrap = makeUserPlanWrap(username, plan);

    const logoutButton = Array.from(navRight.querySelectorAll('button, a'))
      .find(el => /log out|logout/i.test(el.textContent || ''));

    const hamburger = navRight.querySelector('.hamburger');

    if (logoutButton) {
      navRight.insertBefore(wrap, logoutButton);
    } else if (hamburger) {
      navRight.insertBefore(wrap, hamburger);
    } else {
      navRight.prepend(wrap);
    }
  }

  function applyMobileMenu(username, plan) {
    const menu = document.getElementById('mobile-menu') || document.querySelector('.mobile-menu');
    if (!menu) return;

    menu.querySelectorAll('.tl-mobile-user-plan-row').forEach(el => el.remove());

    menu.querySelectorAll('.mobile-plan-row').forEach(el => {
      el.style.display = 'none';
      el.innerHTML = '';
    });

    menu.querySelectorAll('#mobile-plan-pill, #mobile-username-pill').forEach(el => {
      el.style.display = 'none';
      el.innerHTML = '';
    });

    const row = document.createElement('div');
    row.className = 'tl-mobile-user-plan-row';
    row.dataset.tlNavInjected = 'true';
    row.appendChild(makeUserPlanWrap(username, plan));

    const firstDivider = menu.querySelector('.mobile-menu-divider');
    if (firstDivider) {
      menu.insertBefore(row, firstDivider);
    } else {
      menu.prepend(row);
    }
  }

  function applyLibraryVisibility(plan) {
    const normalized = normalizePlan(plan);
    const display = normalized === 'pro' ? 'block' : 'none';
    ['nav-library', 'mobile-nav-library'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = display;
    });
  }

  function applyHomeGreeting(username) {
    const greeting = document.getElementById('greeting-name');
    if (greeting) greeting.textContent = 'Hey ' + username + ' 👋';
  }

  function applyAll(username, plan) {
    injectStyle();
    applyDesktopNav(username, plan);
    applyMobileMenu(username, plan);
    applyLibraryVisibility(plan);
    applyHomeGreeting(username);
  }

  async function getSupabaseClient() {
    if (!window.supabase?.createClient) return null;

    const cfgRes = await fetch('/api/config');
    if (!cfgRes.ok) return null;

    const { supabaseUrl, supabaseAnonKey } = await cfgRes.json();
    if (!supabaseUrl || !supabaseAnonKey) return null;

    return window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  }

  async function loadIdentity() {
    const client = await getSupabaseClient();
    if (!client) return null;

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) return null;

    let plan = 'free';

    try {
      const { data: profile } = await client
        .from('users')
        .select('plan')
        .eq('id', session.user.id)
        .single();

      plan = normalizePlan(profile?.plan);
    } catch (err) {
      plan = 'free';
    }

    return {
      username: getDisplayName(session.user),
      plan
    };
  }

  async function boot() {
    const identity = await loadIdentity();
    if (!identity) return;

    const run = () => applyAll(identity.username, identity.plan);

    run();
    setTimeout(run, 250);
    setTimeout(run, 1000);
    setTimeout(run, 2000);

    const observer = new MutationObserver(() => {
      window.clearTimeout(observer._tlTimer);
      observer._tlTimer = window.setTimeout(run, 75);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
