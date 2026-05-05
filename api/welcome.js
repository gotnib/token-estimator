export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, plan } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  const planLabel = plan === 'plus' ? 'Plus' : plan === 'pro' ? 'Pro' : 'Free';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:rgb(242,241,233);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:rgb(250,249,244);border-radius:16px;overflow:hidden;border:1px solid rgb(215,213,203);box-shadow:0 4px 24px rgba(60,61,89,0.08);">

    <!-- Header -->
    <div style="background:rgb(250,249,244);padding:24px 40px;border-bottom:1px solid rgb(215,213,203);">
      <span style="font-weight:700;font-size:20px;letter-spacing:-0.02em;color:rgb(60,61,89);">Token</span><span style="font-weight:700;font-size:20px;letter-spacing:-0.02em;color:rgb(123,166,146);">Lens</span>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <h1 style="font-size:22px;font-weight:700;color:rgb(60,61,89);margin:0 0 12px;letter-spacing:-0.02em;">Welcome to TokenLens</h1>
      <p style="font-size:15px;color:rgb(100,101,120);line-height:1.65;margin:0 0 24px;">You're on the <strong style="color:rgb(60,61,89);">${planLabel} plan</strong>. Here's how to get the most out of it.</p>

      <!-- Steps -->
      <div style="background:rgb(235,234,226);border-radius:12px;padding:24px;margin-bottom:24px;">
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgb(123,166,146);margin-bottom:4px;">Step 1</div>
          <div style="font-size:14px;font-weight:600;color:rgb(60,61,89);margin-bottom:4px;">Paste any AI prompt</div>
          <div style="font-size:13px;color:rgb(100,101,120);line-height:1.55;">Copy a prompt you've been using — the longer and wordier, the more we can save you.</div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgb(123,166,146);margin-bottom:4px;">Step 2</div>
          <div style="font-size:14px;font-weight:600;color:rgb(60,61,89);margin-bottom:4px;">See where your tokens go</div>
          <div style="font-size:13px;color:rgb(100,101,120);line-height:1.55;">Get a full breakdown by category, a cost estimate, and an optimized rewrite.</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgb(123,166,146);margin-bottom:4px;">Step 3</div>
          <div style="font-size:14px;font-weight:600;color:rgb(60,61,89);margin-bottom:4px;">Learn the principle behind every change</div>
          <div style="font-size:13px;color:rgb(100,101,120);line-height:1.55;">TokenLens explains why each change was made so your next prompt starts better than your last one ended.</div>
        </div>
      </div>

      ${plan !== 'free' ? `
      <!-- Challenge callout -->
      <div style="border:1px solid rgba(123,166,146,0.4);background:rgba(123,166,146,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-size:14px;font-weight:600;color:rgb(95,138,118);margin-bottom:4px;">🎯 Try Challenge Mode</div>
        <div style="font-size:13px;color:rgb(100,101,120);line-height:1.55;">We give you a deliberately bad prompt. You optimize it. Claude scores your attempt A–F and shows what you missed. It's the fastest way to actually get better at prompting.</div>
      </div>` : ''}

      <!-- CTA -->
      <a href="https://tokenlens.live/app" style="display:block;background:rgb(123,166,146);color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:600;margin-bottom:24px;">Analyze your first prompt →</a>

      <p style="font-size:13px;color:rgb(140,141,158);line-height:1.55;margin:0;">Questions? Reply to this email or visit <a href="https://tokenlens.live/support" style="color:rgb(123,166,146);text-decoration:none;">tokenlens.live/support</a>.</p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;border-top:1px solid rgb(215,213,203);background:rgb(235,234,226);">
      <p style="font-size:11px;color:rgb(140,141,158);margin:0;text-align:center;">© 2026 TokenLens · <a href="https://tokenlens.live/privacy" style="color:rgb(140,141,158);text-decoration:none;">Privacy</a> · <a href="https://tokenlens.live/terms" style="color:rgb(140,141,158);text-decoration:none;">Terms</a></p>
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
