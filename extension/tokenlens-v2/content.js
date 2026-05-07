(() => {
  'use strict';

  if (document.getElementById('tokenlens-root')) return;

  // ── Site adapters ─────────────────────────────────────────────────────
  const SITE_ADAPTERS = [
    {
      test: () => location.hostname.includes('chatgpt.com') || location.hostname.includes('openai.com'),
      getPrompt: () => {
        const el = document.querySelector('#prompt-textarea, div[contenteditable="true"][data-lexical-editor]');
        return el ? (el.value ?? el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('#prompt-textarea, div[contenteditable="true"][data-lexical-editor]');
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          nativeSetter.set.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        }
        return true;
      }
    },
    {
      test: () => location.hostname.includes('claude.ai'),
      getPrompt: () => {
        const el = document.querySelector('div[contenteditable="true"].ProseMirror, div.ProseMirror');
        return el ? (el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('div[contenteditable="true"].ProseMirror, div.ProseMirror');
        if (!el) return false;
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        return true;
      }
    },
    {
      test: () => location.hostname.includes('gemini.google.com'),
      getPrompt: () => {
        const el = document.querySelector('div.ql-editor, rich-textarea .ql-editor');
        return el ? (el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('div.ql-editor, rich-textarea .ql-editor');
        if (!el) return false;
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        return true;
      }
    },
    {
      test: () => location.hostname.includes('copilot.microsoft.com'),
      getPrompt: () => {
        const el = document.querySelector('textarea#userInput, [data-testid="composer-input"]');
        return el ? (el.value ?? el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('textarea#userInput, [data-testid="composer-input"]');
        if (!el) return false;
        el.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        nativeSetter.set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    },
    {
      test: () => location.hostname.includes('grok.com'),
      getPrompt: () => {
        const el = document.querySelector('textarea, div[contenteditable="true"]');
        return el ? (el.value ?? el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('textarea, div[contenteditable="true"]');
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          nativeSetter.set.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        }
        return true;
      }
    },
    {
      test: () => location.hostname.includes('poe.com'),
      getPrompt: () => {
        const el = document.querySelector('textarea[class*="GrowingTextArea"], textarea[placeholder]');
        return el ? el.value ?? '' : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('textarea[class*="GrowingTextArea"], textarea[placeholder]');
        if (!el) return false;
        el.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        nativeSetter.set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    },
    {
      test: () => location.hostname.includes('perplexity.ai'),
      getPrompt: () => {
        const el = document.querySelector('textarea[placeholder], div[contenteditable="true"]');
        return el ? (el.value ?? el.innerText ?? '') : '';
      },
      setPrompt: (text) => {
        const el = document.querySelector('textarea[placeholder], div[contenteditable="true"]');
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          nativeSetter.set.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        }
        return true;
      }
    },
    {
      test: () => location.hostname.includes('runable.com'),
      getPrompt: () => {
        const RUNABLE_SELECTORS = [
          'textarea[data-testid="chat-input"]',
          'textarea[placeholder*="What"]',
          'textarea[placeholder*="needs"]',
          'textarea[placeholder*="message"]',
          'textarea[placeholder*="Ask"]',
          'div[contenteditable="true"][class*="input"]',
          'div[contenteditable="true"][class*="chat"]',
          'div[contenteditable="true"][class*="prompt"]',
          'textarea'
        ];
        for (const sel of RUNABLE_SELECTORS) {
          const el = document.querySelector(sel);
          if (el) return el.value ?? el.innerText ?? '';
        }
        return '';
      },
      setPrompt: (text) => {
        const RUNABLE_SELECTORS = [
          'textarea[data-testid="chat-input"]',
          'textarea[placeholder*="What"]',
          'textarea[placeholder*="needs"]',
          'textarea[placeholder*="message"]',
          'textarea[placeholder*="Ask"]',
          'div[contenteditable="true"][class*="input"]',
          'div[contenteditable="true"][class*="chat"]',
          'div[contenteditable="true"][class*="prompt"]',
          'textarea'
        ];
        let el = null;
        for (const sel of RUNABLE_SELECTORS) {
          el = document.querySelector(sel);
          if (el) break;
        }
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          nativeSetter.set.call(el, text);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
        }
        return true;
      }
    }
  ];

  const adapter = SITE_ADAPTERS.find(a => a.test()) ?? null;
  const canInject = !!(adapter && adapter.setPrompt);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Code detection ────────────────────────────────────────────────────
  // Patterns that strongly suggest code input
  const CODE_PATTERNS = [
    /```[\s\S]{10,}/,                          // fenced code blocks
    /^\s*(function|def |class |const |let |var |import |export |public |private )/m,
    /^\s*(if|for|while|switch)\s*\(/m,
    /(=>|->)\s*[{(]/,                          // arrow functions / lambdas
    /\b(return|await|async|yield|throw|try|catch)\b/,
    /#include\s*[<"]/,                         // C/C++
    /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b/i, // SQL
    /<[a-zA-Z][^>]*>[\s\S]*<\/[a-zA-Z]+>/,   // HTML/JSX tags
    /^\s*@\w+\s*[\n\r]/m,                      // decorators
    /[{};]\s*\n.*[{};]/s,                      // multiple braced lines
  ];

  const CODE_THRESHOLD = 2; // need at least 2 pattern matches to auto-switch

  function detectCode(text) {
    if (!text || text.length < 30) return false;
    let matches = 0;
    for (const pattern of CODE_PATTERNS) {
      if (pattern.test(text)) {
        matches++;
        if (matches >= CODE_THRESHOLD) return true;
      }
    }
    return false;
  }

  // ── Session tracker ───────────────────────────────────────────────────
  const session = { tokens: 0, messages: 0 };

  function estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
  }

  function startSessionTracker() {
    if (!adapter) return;
    const MSG_SELECTORS = {
      'chatgpt.com':           '[data-message-author-role="user"] .whitespace-pre-wrap',
      'openai.com':            '[data-message-author-role="user"] .whitespace-pre-wrap',
      'claude.ai':             '[data-testid="user-message"]',
      'gemini.google.com':     '.user-query-bubble-with-background',
      'copilot.microsoft.com': '[data-testid="user-message"]',
      'grok.com':              '[class*="UserMessage"]',
      'poe.com':               '[class*="Message_humanMessageBubble"]',
      'perplexity.ai':         '[data-testid="user-message-content"]',
      'runable.com':           '[class*="UserMessage"], [class*="user-message"], [data-role="user"]',
    };
    const host = location.hostname.replace('www.', '');
    const selectorKey = Object.keys(MSG_SELECTORS).find(k => host.includes(k));
    if (!selectorKey) return;
    const selector = MSG_SELECTORS[selectorKey];
    const seen = new WeakSet();
    function scanMessages() {
      document.querySelectorAll(selector).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        session.tokens += estimateTokens(el.innerText || el.textContent || '');
        session.messages += 1;
        updateSessionUI();
      });
    }
    scanMessages();
    const observer = new MutationObserver(debounce(scanMessages, 300));
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function updateSessionUI() {
    const el = document.getElementById('tl-session-tokens');
    if (el) el.textContent = fmt(session.tokens);
    const msgs = document.getElementById('tl-session-msgs');
    if (msgs) msgs.textContent = session.messages + ' msg' + (session.messages !== 1 ? 's' : '');
  }

  // ── TL logo SVGs ──────────────────────────────────────────────────────
  const TL_SVG = '<svg class="tl-icon" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="12" height="4" fill="#6a9e88"/><rect x="7" y="4" width="4" height="20" fill="#6a9e88"/><rect x="16" y="10" width="4" height="14" fill="#6a9e88"/><rect x="16" y="20" width="8" height="4" fill="#6a9e88"/></svg>';
  const TL_SVG_SMALL = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px"><rect x="2" y="2" width="9" height="3" fill="#6a9e88"/><rect x="4.5" y="2" width="3" height="16" fill="#6a9e88"/><rect x="12" y="7" width="3" height="11" fill="#6a9e88"/><rect x="12" y="15" width="6" height="3" fill="#6a9e88"/></svg>';

  // ── Build DOM ─────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'tokenlens-root';

  const autoDisabled = adapter ? '' : 'disabled';
  const autoLabel = adapter ? 'Auto-detect prompt' : 'Auto-detect (unsupported here)';
  const injectBtnHTML = canInject
    ? '<button id="tl-inject-btn" title="Replace chat input with optimized prompt">' +
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8h10M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 4v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '<span id="tl-inject-label">Inject</span>' +
      '</button>'
    : '';

  const __html =
    '<div id="tokenlens-panel">' +

      // ── Fixed header ──
      '<div id="tokenlens-header">' +
        '<div class="tl-logo">' + TL_SVG_SMALL + '<span>Token<span class="tl-dot">Lens</span></span></div>' +
        '<button id="tokenlens-close" title="Close">\u2715</button>' +
      '</div>' +

      // ── Scrollable body ──
      '<div class="tl-panel-scroll">' +

        '<div id="tl-session-bar">' +
          '<div class="tl-session-item">' +
            '<span class="tl-session-label">SESSION</span>' +
            '<span class="tl-session-value"><span id="tl-session-tokens">0</span> tokens</span>' +
          '</div>' +
          '<div class="tl-session-divider"></div>' +
          '<div class="tl-session-item">' +
            '<span class="tl-session-label">MESSAGES</span>' +
            '<span class="tl-session-value" id="tl-session-msgs">0 msgs</span>' +
          '</div>' +
        '</div>' +

        '<div id="tokenlens-auth-gate">' +
          '<p><strong>Sign in to analyze</strong>TokenLens uses your account to track usage on your plan.</p>' +
          '<button id="tokenlens-signin-btn">SIGN IN TO TOKENLENS</button>' +
        '</div>' +

        '<div id="tokenlens-body">' +

          // Mode switcher
          '<div id="tl-mode-bar">' +
            '<span class="tl-mode-label">MODE</span>' +
            '<button class="tl-mode-pill active" id="tl-mode-prompt" data-mode="prompt">' +
              '<span class="tl-pill-dot"></span>Prompt' +
            '</button>' +
            '<button class="tl-mode-pill" id="tl-mode-code" data-mode="code">' +
              '<span class="tl-pill-dot"></span>Code' +
            '</button>' +
            '<span id="tl-auto-mode-indicator">auto</span>' +
          '</div>' +

          '<textarea id="tokenlens-textarea" placeholder="Paste your prompt here, or enable auto-detect below\u2026" spellcheck="false"></textarea>' +
          '<div id="tokenlens-autodetect">' +
            '<label><input type="checkbox" id="tokenlens-auto-checkbox" ' + autoDisabled + '>' + autoLabel + '</label>' +
          '</div>' +

          '<div id="tl-tracker-card">' +
            '<div class="tl-tracker-head">' +
              '<span>LIVE TRACKER</span>' +
              '<span id="tl-tracker-status">Off</span>' +
            '</div>' +
            '<div class="tl-tracker-grid">' +
              '<label>Provider<select id="tl-tracker-provider">' +
                '<option value="auto">Auto</option>' +
                '<option value="anthropic">Anthropic</option>' +
                '<option value="openai">OpenAI</option>' +
                '<option value="gemini">Gemini</option>' +
                '<option value="perplexity">Perplexity</option>' +
                '<option value="mistral">Mistral</option>' +
                '<option value="groq">Groq</option>' +
              '</select></label>' +
              '<label>Model<select id="tl-tracker-model">' +
                '<option value="auto">Auto</option>' +
                '<option value="claude-sonnet-4-20250514">Claude Sonnet</option>' +
                '<option value="gpt-4o">GPT-4o</option>' +
                '<option value="gemini-2.5-pro">Gemini Pro</option>' +
                '<option value="llama-3.3-70b-versatile">Llama 70B</option>' +
              '</select></label>' +
            '</div>' +
            '<input id="tl-tracker-key" type="password" autocomplete="off" placeholder="Provider API key" />' +
            '<button id="tl-tracker-btn">START TRACKER</button>' +
            '<div id="tl-tracker-result"></div>' +
          '</div>' +

          '<button id="tokenlens-analyze-btn">ANALYZE</button>' +
          '<div id="tokenlens-error"></div>' +

          '<div id="tl-higher-token-warning" style="display:none">' +
            '<div class="tl-warning-icon">\u26a0\ufe0f</div>' +
            '<div class="tl-warning-body">' +
              '<strong>Optimized prompt is longer</strong>' +
              '<p id="tl-warning-text"></p>' +
            '</div>' +
          '</div>' +

          '<div id="tokenlens-results">' +
            '<div class="tl-compare">' +
              '<div class="tl-compare-col">' +
                '<div class="tl-compare-label">BEFORE</div>' +
                '<div class="tl-compare-tokens" id="tl-tokens-before">\u2014</div>' +
                '<div class="tl-compare-cost" id="tl-cost-before">\u2014</div>' +
                '<div class="tl-compare-words" id="tl-words-before">\u2014</div>' +
              '</div>' +
              '<div class="tl-compare-arrow">' +
                '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="#6a9e88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
                '<div class="tl-savings-badge" id="tl-savings-badge"></div>' +
              '</div>' +
              '<div class="tl-compare-col tl-compare-col--after">' +
                '<div class="tl-compare-label">AFTER</div>' +
                '<div class="tl-compare-tokens" id="tl-tokens-after">\u2014</div>' +
                '<div class="tl-compare-cost" id="tl-cost-after">\u2014</div>' +
                '<div class="tl-compare-words" id="tl-words-after">\u2014</div>' +
              '</div>' +
            '</div>' +

            '<div id="tokenlens-optimized" style="display:none">' +
              '<div class="tl-optimized-header">' +
                '<span class="tl-optimized-label">OPTIMIZED PROMPT</span>' +
                '<div class="tl-optimized-actions">' +
                  injectBtnHTML +
                  '<button id="tl-copy-btn" title="Copy optimized prompt">' +
                    '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
                    '<span id="tl-copy-label">Copy</span>' +
                  '</button>' +
                '</div>' +
              '</div>' +
              '<div id="tokenlens-analysis"></div>' +
            '</div>' +
          '</div>' +

        '</div>' + // end tokenlens-body

      '</div>' + // end tl-panel-scroll

      // ── Fixed footer ──
      '<div id="tokenlens-footer">' +
        '<a href="https://tokenlens.live" target="_blank" rel="noopener">tokenlens.live</a>' +
      '</div>' +

    '</div>' +

    '<button id="tokenlens-fab" title="TokenLens">' +
      TL_SVG +
      '<span id="tokenlens-badge"></span>' +
    '</button>';

  const __parsed = new DOMParser().parseFromString(__html, 'text/html');
  while (__parsed.body.firstChild) root.appendChild(__parsed.body.firstChild);

  document.body.appendChild(root);

  // ── Refs ──────────────────────────────────────────────────────────────
  const panel           = document.getElementById('tokenlens-panel');
  const fab             = document.getElementById('tokenlens-fab');
  const closeBtn        = document.getElementById('tokenlens-close');
  const authGate        = document.getElementById('tokenlens-auth-gate');
  const body            = document.getElementById('tokenlens-body');
  const signinBtn       = document.getElementById('tokenlens-signin-btn');
  const textarea        = document.getElementById('tokenlens-textarea');
  const autoCheck       = document.getElementById('tokenlens-auto-checkbox');
  const trackerProvider = document.getElementById('tl-tracker-provider');
  const trackerModel    = document.getElementById('tl-tracker-model');
  const trackerKey      = document.getElementById('tl-tracker-key');
  const trackerBtn      = document.getElementById('tl-tracker-btn');
  const trackerStatus   = document.getElementById('tl-tracker-status');
  const trackerResult   = document.getElementById('tl-tracker-result');
  const analyzeBtn      = document.getElementById('tokenlens-analyze-btn');
  const results         = document.getElementById('tokenlens-results');
  const errorBox        = document.getElementById('tokenlens-error');
  const badge           = document.getElementById('tokenlens-badge');
  const copyBtn         = document.getElementById('tl-copy-btn');
  const copyLabel       = document.getElementById('tl-copy-label');
  const injectBtnEl     = document.getElementById('tl-inject-btn');
  const injectLabel     = document.getElementById('tl-inject-label');
  const warningEl       = document.getElementById('tl-higher-token-warning');
  const warningText     = document.getElementById('tl-warning-text');
  const modePromptBtn   = document.getElementById('tl-mode-prompt');
  const modeCodeBtn     = document.getElementById('tl-mode-code');
  const autoModeIndEl   = document.getElementById('tl-auto-mode-indicator');

  // ── Mode state ────────────────────────────────────────────────────────
  let currentMode = 'prompt'; // 'prompt' | 'code'
  let autoModeActive = false;

  function setMode(mode, auto = false) {
    currentMode = mode;
    autoModeActive = auto;

    modePromptBtn.classList.toggle('active', mode === 'prompt');
    modeCodeBtn.classList.toggle('active', mode === 'code');
    autoModeIndEl.classList.toggle('visible', auto);

    // Update textarea placeholder
    textarea.placeholder = mode === 'code'
      ? 'Paste your code here, or enable auto-detect below\u2026'
      : 'Paste your prompt here, or enable auto-detect below\u2026';

    // Update optimized label
    const optimizedLabel = document.querySelector('.tl-optimized-label');
    if (optimizedLabel) {
      optimizedLabel.textContent = mode === 'code' ? 'OPTIMIZED CODE' : 'OPTIMIZED PROMPT';
    }
  }

  modePromptBtn.addEventListener('click', () => setMode('prompt', false));
  modeCodeBtn.addEventListener('click', () => setMode('code', false));

  // ── Auth state ────────────────────────────────────────────────────────
  let authToken = null;

  function loadToken() {
    chrome.storage.local.get(['tokenlens_token'], (data) => {
      authToken = data.tokenlens_token ?? null;
      updateAuthUI();
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.tokenlens_token) {
      authToken = changes.tokenlens_token.newValue ?? null;
      updateAuthUI();
    }
  });

  function updateAuthUI() {
    if (authToken) {
      authGate.classList.remove('visible');
      body.style.display = 'block';
    } else {
      authGate.classList.add('visible');
      body.style.display = 'none';
    }
  }

  signinBtn.addEventListener('click', () => window.open('https://tokenlens.live', '_blank'));

  // ── Panel open / close ────────────────────────────────────────────────
  let panelOpen = false;

  function openPanel() {
    loadToken();
    panel.classList.add('open');
    panelOpen = true;
    if (authToken && autoCheck.checked) syncPrompt();
  }

  function closePanel() {
    panel.classList.remove('open');
    panelOpen = false;
  }

  fab.addEventListener('click', () => panelOpen ? closePanel() : openPanel());
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('click', (e) => {
    if (panelOpen && !root.contains(e.target)) closePanel();
  });

  // ── Auto-detect + code sniffing ───────────────────────────────────────
  function syncPrompt() {
    if (!adapter) return;
    const text = adapter.getPrompt().trim();
    if (text) {
      textarea.value = text;
      autoDetectMode(text);
    }
    updateBadge(text);
  }

  function autoDetectMode(text) {
    const isCode = detectCode(text);
    const newMode = isCode ? 'code' : 'prompt';
    if (newMode !== currentMode) {
      setMode(newMode, true); // true = auto-switched
    }
  }

  const debouncedSync = debounce(() => {
    if (!autoCheck.checked || !panelOpen) return;
    syncPrompt();
  }, 600);

  if (adapter) {
    document.addEventListener('input', debouncedSync, true);
    document.addEventListener('keyup', debouncedSync, true);
  }

  autoCheck.addEventListener('change', () => {
    if (autoCheck.checked) syncPrompt();
  });

  // ── Live tracker proxy ─────────────────────────────────────────────────
  function inferTrackerProvider() {
    if (trackerProvider.value !== 'auto') return trackerProvider.value;
    const host = location.hostname.toLowerCase();
    if (host.includes('claude') || host.includes('anthropic')) return 'anthropic';
    if (host.includes('chatgpt') || host.includes('openai')) return 'openai';
    if (host.includes('gemini') || host.includes('google')) return 'gemini';
    if (host.includes('perplexity')) return 'perplexity';
    if (host.includes('grok')) return 'groq';
    return host;
  }

  function loadTrackerPrefs() {
    chrome.storage.local.get(['tokenlens_tracker_provider', 'tokenlens_tracker_model'], (data) => {
      trackerProvider.value = data.tokenlens_tracker_provider || 'auto';
      trackerModel.value = data.tokenlens_tracker_model || 'auto';
    });
  }

  function saveTrackerPrefs() {
    chrome.storage.local.set({
      tokenlens_tracker_provider: trackerProvider.value,
      tokenlens_tracker_model: trackerModel.value,
    });
  }

  function setTrackerLoading(on) {
    trackerBtn.disabled = on;
    trackerBtn.textContent = on ? 'STARTING…' : 'START TRACKER';
  }

  function showTrackerResult(msg, isError = false) {
    trackerResult.textContent = msg;
    trackerResult.classList.toggle('error', isError);
    trackerResult.classList.add('visible');
    trackerStatus.textContent = isError ? 'Error' : 'On';
  }

  async function startLiveTracker() {
    if (!authToken) {
      authGate.classList.add('visible');
      body.style.display = 'none';
      return;
    }

    const apiKey = trackerKey.value.trim();
    if (apiKey.length < 10) {
      showTrackerResult('Add a valid provider API key to start tracking.', true);
      return;
    }

    const prompt = textarea.value.trim() || (adapter ? adapter.getPrompt().trim() : '');
    if (!prompt) {
      showTrackerResult('Enter or auto-detect a prompt before starting the tracker.', true);
      return;
    }

    setTrackerLoading(true);
    trackerStatus.textContent = 'Starting';
    trackerResult.classList.remove('visible', 'error');

    try {
      const res = await fetch('https://tokenlens.live/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          track: true,
          provider: inferTrackerProvider(),
          model: trackerModel.value,
          messages: [{ role: 'user', content: prompt }],
          apiKey
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        chrome.storage.local.remove(['tokenlens_token', 'tokenlens_token_at']);
        authToken = null;
        updateAuthUI();
        throw new Error('Session expired. Please sign in again at tokenlens.live.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to fetch tracker data.');

      const usage = data.usage || {};
      const input = usage.input || 0;
      const output = usage.output || 0;
      session.tokens += input + output;
      session.messages += 1;
      updateSessionUI();
      showTrackerResult('Tracking ' + data.provider + ' / ' + data.model + ': ' + input + ' in, ' + output + ' out.');
    } catch (err) {
      showTrackerResult(err.message || 'Failed to fetch tracker data.', true);
    } finally {
      setTrackerLoading(false);
    }
  }

  trackerProvider.addEventListener('change', saveTrackerPrefs);
  trackerModel.addEventListener('change', saveTrackerPrefs);
  trackerBtn.addEventListener('click', startLiveTracker);

  // Also sniff as user types directly into the widget textarea
  textarea.addEventListener('input', () => {
    updateBadge(textarea.value);
    autoDetectMode(textarea.value);
  });

  // ── Badge ─────────────────────────────────────────────────────────────
  function updateBadge(text) {
    if (!text?.trim()) { badge.classList.remove('visible'); return; }
    badge.textContent = fmt(Math.ceil(text.length / 4));
    badge.classList.add('visible');
  }

  function fmt(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  }

  // ── Copy button ───────────────────────────────────────────────────────
  let optimizedText = '';

  copyBtn.addEventListener('click', () => {
    if (!optimizedText) return;
    navigator.clipboard.writeText(optimizedText).then(() => {
      copyLabel.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyLabel.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = optimizedText;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copyLabel.textContent = 'Copied!';
      setTimeout(() => { copyLabel.textContent = 'Copy'; }, 2000);
    });
  });

  // ── Inject button ─────────────────────────────────────────────────────
  if (injectBtnEl) {
    injectBtnEl.addEventListener('click', () => {
      if (!optimizedText || !adapter) return;
      const ok = adapter.setPrompt(optimizedText);
      if (ok) {
        injectLabel.textContent = 'Injected!';
        injectBtnEl.classList.add('injected');
        setTimeout(() => { injectLabel.textContent = 'Inject'; injectBtnEl.classList.remove('injected'); }, 2000);
      } else {
        injectLabel.textContent = 'Failed';
        setTimeout(() => { injectLabel.textContent = 'Inject'; }, 2000);
      }
    });
  }

  // ── API call ──────────────────────────────────────────────────────────
  async function analyze() {
    if (!authToken) {
      authGate.classList.add('visible');
      body.style.display = 'none';
      return;
    }

    const prompt = textarea.value.trim();
    if (!prompt) { showError('Please enter a prompt first.'); return; }

    setLoading(true);
    hideError();
    results.classList.remove('visible');
    warningEl.style.display = 'none';

    try {
      const res = await fetch('https://tokenlens.live/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        // Send level=deep for code mode so the API uses the code optimizer system prompt
        body: JSON.stringify({ prompt, level: currentMode === 'code' ? 'deep' : 'balanced' })
      });

      if (res.status === 401) {
        chrome.storage.local.remove(['tokenlens_token', 'tokenlens_token_at']);
        authToken = null;
        updateAuthUI();
        showError('Session expired. Please sign in again at tokenlens.live.');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server error: ' + res.status);
      }

      const data = await res.json();
      renderResults(data.results ?? data, prompt);
    } catch (err) {
      showError(err.message || 'Could not reach tokenlens.live.');
    } finally {
      setLoading(false);
    }
  }

  analyzeBtn.addEventListener('click', analyze);
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') analyze();
  });

  // ── Render ────────────────────────────────────────────────────────────
  function renderResults(data, prompt) {
    const beforeTokens = data.estimated_tokens ?? data.token_count ?? data.tokens ?? null;
    const beforeCost   = data.cost_estimate_usd ?? data.estimated_cost ?? data.cost ?? null;
    const afterTokens  = data.efficient_tokens ?? null;
    const savings      = data.savings_percent ?? null;
    const optimized    = data.efficient_prompt ?? data.analysis ?? '';
    const beforeWords  = countWords(prompt);
    const afterWords   = optimized ? countWords(optimized) : null;

    let afterCost = null;
    if (beforeCost != null && beforeTokens && afterTokens) {
      afterCost = beforeCost * (afterTokens / beforeTokens);
    }

    const isHigher = afterTokens != null && beforeTokens != null && afterTokens > beforeTokens;
    if (isHigher) {
      const diff = afterTokens - beforeTokens;
      const pct  = Math.round((diff / beforeTokens) * 100);
      warningText.textContent =
        'The optimized version is ' + diff + ' tokens (' + pct + '%) longer than the original. ' +
        'This can happen when adding missing context, clarifying ambiguous instructions, or specifying ' +
        'output format \u2014 all of which reduce back-and-forth with the model, saving tokens across ' +
        'the full conversation. A slightly longer prompt that gets the right answer first try is almost always cheaper overall.';
      warningEl.style.display = 'flex';
    } else {
      warningEl.style.display = 'none';
    }

    document.getElementById('tl-tokens-before').textContent = beforeTokens != null ? beforeTokens.toLocaleString() + ' tokens' : '\u2014';
    document.getElementById('tl-cost-before').textContent   = beforeCost != null ? formatCost(beforeCost) : '\u2014';
    document.getElementById('tl-words-before').textContent  = beforeWords + ' words';
    document.getElementById('tl-tokens-after').textContent  = afterTokens != null ? afterTokens.toLocaleString() + ' tokens' : '\u2014';
    document.getElementById('tl-cost-after').textContent    = afterCost != null ? formatCost(afterCost) : '\u2014';
    document.getElementById('tl-words-after').textContent   = afterWords != null ? afterWords + ' words' : '\u2014';

    const savingsBadge = document.getElementById('tl-savings-badge');
    if (savings != null) {
      savingsBadge.textContent = isHigher ? '+' + Math.abs(savings) + '%' : '\u2212' + savings + '%';
      savingsBadge.classList.toggle('higher', isHigher);
      savingsBadge.style.display = 'block';
    } else {
      savingsBadge.style.display = 'none';
    }

    const optimizedEl = document.getElementById('tokenlens-optimized');
    const analysisEl  = document.getElementById('tokenlens-analysis');
    if (optimized && optimized !== prompt) {
      optimizedText = optimized;
      analysisEl.textContent = optimized;
      optimizedEl.style.display = 'block';
    } else {
      optimizedText = '';
      optimizedEl.style.display = 'none';
    }

    if (beforeTokens != null) {
      badge.textContent = fmt(beforeTokens);
      badge.classList.add('visible');
    }

    results.classList.add('visible');
  }

  function formatCost(cost) {
    if (typeof cost === 'string') return cost;
    if (cost === 0) return '$0.00000';
    if (cost < 0.00001) return '<$0.00001';
    if (cost < 0.001)   return '$' + cost.toFixed(5);
    return '$' + cost.toFixed(4);
  }

  function countWords(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  // ── UI helpers ────────────────────────────────────────────────────────
  function setLoading(on) {
    analyzeBtn.disabled = on;
    while (analyzeBtn.firstChild) analyzeBtn.removeChild(analyzeBtn.firstChild);
    if (on) {
      const sp = document.createElement('span');
      sp.className = 'tl-spinner';
      analyzeBtn.appendChild(sp);
      analyzeBtn.appendChild(document.createTextNode('ANALYZING'));
    } else {
      analyzeBtn.textContent = 'ANALYZE';
    }
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('visible');
  }

  function hideError() {
    errorBox.classList.remove('visible');
  }

  // ── Init ──────────────────────────────────────────────────────────────
  loadToken();
  loadTrackerPrefs();
  startSessionTracker();

})();
