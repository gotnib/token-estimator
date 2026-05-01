export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, plan } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const planLabel = plan === 'plus' ? 'Plus' : plan === 'pro' ? 'Pro' : 'Free';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    
    <!-- Header -->
    <div style="background:#1e2d4a;padding:32px 40px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;">
        <span style="color:white;">Token</span><span style="background:linear-gradient(90deg,#5b9fe8,#8b6fe8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Lens</span>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 12px;letter-spacing:-0.02em;">Welcome to TokenLens</h1>
      <p style="font-size:15px;color:#6b7280;line-height:1.65;margin:0 0 24px;">You're on the <strong style="color:#111827;">${planLabel} plan</strong>. Here's how to get the most out of it.</p>

      <!-- Steps -->
      <div style="background:#f8f9fb;border-radius:12px;padding:24px;margin-bottom:24px;">
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px;">Step 1</div>
          <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">Paste any AI prompt</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.55;">Copy a prompt you've been using — the longer and wordier, the more we can save you.</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px;">Step 2</div>
          <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">See where your tokens go</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.55;">Get a full breakdown by category, a cost estimate, and an optimized rewrite.</div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-bottom:4px;">Step 3</div>
          <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">Learn the principle behind every change</div>
          <div style="font-size:13px;color:#6b7280;line-height:1.55;">TokenLens explains why each change was made so your next prompt starts better than your last one ended.</div>
        </div>
      </div>

      ${plan !== 'free' ? `
      <!-- Challenge mode callout -->
      <div style="border:1px solid #c4b5fd;background:#f5f3ff;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:14px;font-weight:600;color:#7c52e0;margin-bottom:4px;">🎯 Try Challenge Mode</div>
        <div style="font-size:13px;color:#6b7280;line-height:1.55;">We give you a deliberately bad prompt. You optimize it. Claude scores your attempt A-F and shows what you missed. It's the fastest way to actually get better at prompting.</div>
      </div>` : ''}

      <!-- CTA -->
      <a href="https://tokenlens.live/app" style="display:block;background:linear-gradient(135deg,#2563eb,#7c52e0);color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;margin-bottom:24px;">Analyze your first prompt →</a>

      <p style="font-size:13px;color:#9ca3af;line-height:1.55;margin:0;">Questions? Reply to this email or visit <a href="https://tokenlens.live/support" style="color:#2563eb;text-decoration:none;">tokenlens.live/support</a>.</p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid #e5e7eb;background:#f8f9fb;">
      <p style="font-size:11px;color:#9ca3af;margin:0;text-align:center;">© 2026 TokenLens · <a href="https://tokenlens.live/privacy" style="color:#9ca3af;">Privacy</a> · <a href="https://tokenlens.live/terms" style="color:#9ca3af;">Terms</a></p>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'TokenLens <support@tokenlens.live>',
        to: email,
        subject: 'Welcome to TokenLens — here\'s how to get started',
        html
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch(err) {
    console.error('Welcome email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
