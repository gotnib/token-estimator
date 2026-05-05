export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, subject, message, plan } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  if (message.length > 5000) {
    return res.status(400).json({ error: 'Message too long.' });
  }

  try {
    // Internal notification email
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'TokenLens Support <support@tokenlens.live>',
        to: ['support@tokenlens.live'],
        reply_to: email,
        subject: `[${plan || 'Free'}] ${subject}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:rgb(250,249,244);border-radius:16px;overflow:hidden;border:1px solid rgb(215,213,203);">
            <div style="background:rgb(250,249,244);padding:20px 32px;border-bottom:1px solid rgb(215,213,203);">
              <span style="font-weight:700;font-size:18px;letter-spacing:-0.02em;color:rgb(60,61,89);">Token</span><span style="font-weight:700;font-size:18px;letter-spacing:-0.02em;color:rgb(123,166,146);">Lens</span>
              <span style="margin-left:12px;font-size:13px;color:rgb(100,101,120);">Support Request</span>
            </div>
            <div style="padding:32px;">
              <h2 style="margin:0 0 20px;font-size:18px;font-weight:700;color:rgb(60,61,89);letter-spacing:-0.02em;">New message from ${name}</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:24px;background:rgb(235,234,226);border-radius:10px;overflow:hidden;">
                <tr><td style="padding:10px 16px;font-size:12px;color:rgb(100,101,120);width:90px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Name</td><td style="padding:10px 16px;font-size:14px;color:rgb(60,61,89);font-weight:500;">${name}</td></tr>
                <tr style="border-top:1px solid rgb(215,213,203);"><td style="padding:10px 16px;font-size:12px;color:rgb(100,101,120);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Email</td><td style="padding:10px 16px;font-size:14px;"><a href="mailto:${email}" style="color:rgb(123,166,146);text-decoration:none;">${email}</a></td></tr>
                <tr style="border-top:1px solid rgb(215,213,203);"><td style="padding:10px 16px;font-size:12px;color:rgb(100,101,120);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Plan</td><td style="padding:10px 16px;font-size:14px;color:rgb(60,61,89);">${plan || 'Free'}</td></tr>
                <tr style="border-top:1px solid rgb(215,213,203);"><td style="padding:10px 16px;font-size:12px;color:rgb(100,101,120);font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Subject</td><td style="padding:10px 16px;font-size:14px;color:rgb(60,61,89);font-weight:500;">${subject}</td></tr>
              </table>
              <div style="background:rgb(235,234,226);border-radius:10px;padding:20px;margin-bottom:20px;border-left:3px solid rgb(123,166,146);">
                <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgb(123,166,146);">Message</p>
                <p style="margin:0;font-size:14px;color:rgb(60,61,89);line-height:1.7;white-space:pre-wrap;">${message}</p>
              </div>
              <p style="margin:0;font-size:12px;color:rgb(140,141,158);">Reply directly to this email to respond to ${name}.</p>
            </div>
          </div>
        `
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send email');
    }

    // Confirmation email to user
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'TokenLens Support <support@tokenlens.live>',
        to: [email],
        subject: 'We received your message — TokenLens Support',
        html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:rgb(242,241,233);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:rgb(250,249,244);border-radius:16px;overflow:hidden;border:1px solid rgb(215,213,203);box-shadow:0 4px 24px rgba(60,61,89,0.08);">
    <div style="background:rgb(250,249,244);padding:24px 40px;border-bottom:1px solid rgb(215,213,203);">
      <span style="font-weight:700;font-size:20px;letter-spacing:-0.02em;color:rgb(60,61,89);">Token</span><span style="font-weight:700;font-size:20px;letter-spacing:-0.02em;color:rgb(123,166,146);">Lens</span>
    </div>
    <div style="padding:40px;">
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:rgb(60,61,89);letter-spacing:-0.02em;">We got your message, ${name}!</h2>
      <p style="font-size:14px;color:rgb(100,101,120);line-height:1.7;margin:0 0 20px;">Thanks for reaching out. We'll get back to you at <strong style="color:rgb(60,61,89);">${email}</strong> as soon as possible — usually within 24 hours.</p>
      <div style="background:rgb(235,234,226);border-radius:10px;padding:20px;margin-bottom:24px;border-left:3px solid rgb(123,166,146);">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgb(123,166,146);">Your message</p>
        <p style="margin:0;font-size:13px;color:rgb(60,61,89);line-height:1.65;white-space:pre-wrap;">${message}</p>
      </div>
      <p style="font-size:13px;color:rgb(140,141,158);margin:0;">— The TokenLens Team</p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid rgb(215,213,203);background:rgb(235,234,226);">
      <p style="font-size:11px;color:rgb(140,141,158);margin:0;text-align:center;">© 2026 TokenLens · <a href="https://tokenlens.live/privacy" style="color:rgb(140,141,158);text-decoration:none;">Privacy</a> · <a href="https://tokenlens.live/terms" style="color:rgb(140,141,158);text-decoration:none;">Terms</a></p>
    </div>
  </div>
</body>
</html>`
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
}
