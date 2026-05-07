// auth_bridge.js — runs on tokenlens.live
// Reads the Supabase session from localStorage and saves it to chrome.storage
// so the widget on other sites can use it for authenticated API calls.

(function syncToken() {
  function extractToken() {
    const key = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!key) return null;
    try {
      const session = JSON.parse(localStorage.getItem(key));
      return session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  function saveToken(token) {
    if (token) {
      chrome.storage.local.set({ tokenlens_token: token, tokenlens_token_at: Date.now() });
    } else {
      chrome.storage.local.remove(['tokenlens_token', 'tokenlens_token_at']);
    }
  }

  // Sync immediately on page load
  saveToken(extractToken());

  // Also watch for storage changes (login/logout events)
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith('sb-') && e.key?.endsWith('-auth-token')) {
      try {
        const session = e.newValue ? JSON.parse(e.newValue) : null;
        saveToken(session?.access_token ?? null);
      } catch {
        saveToken(null);
      }
    }
  });
})();
