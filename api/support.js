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
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
              <h2 style="margin:0;font-size:20px;color:#111827;">New Support Request</h2>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">TokenLens Support</p>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;width:100px;">Name</td><td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${name}</td></tr>
              <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Email</td><td style="padding:8px 0;font-size:14px;color:#111827;"><a href="mailto:${email}" style="color:#2563eb;">${email}</a></td></tr>
              <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Plan</td><td style="padding:8px 0;font-size:14px;color:#111827;">${plan || 'Free'}</td></tr>
              <tr><td style="padding:8px 0;font-size:13px;color:#6b7280;">Subject</td><td style="padding:8px 0;font-size:14px;color:#111827;font-weight:500;">${subject}</td></tr>
            </table>
            <div style="background:#f8f9fb;border-radius:8px;padding:16px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">Message</p>
              <p style="margin:0;font-size:14px;color:#111827;line-height:1.7;white-space:pre-wrap;">${message}</p>
            </div>
            <p style="margin:0;font-size:12px;color:#9ca3af;">Reply directly to this email to respond to ${name}.</p>
          </div>
        `
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send email');
    }

    // Send confirmation to user
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
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <div style="margin-bottom:24px;">
              <span style="font-weight:700;font-size:18px;color:#1e2d4a;">Token</span><span style="font-weight:700;font-size:18px;background:linear-gradient(90deg,#5b9fe8,#8b6fe8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">Lens</span>
            </div>
            <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">We got your message, ${name}!</h2>
            <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 16px;">Thanks for reaching out. We'll get back to you at <strong>${email}</strong> as soon as possible — usually within 24 hours.</p>
            <div style="background:#f8f9fb;border-radius:8px;padding:16px;margin-bottom:24px;border-left:3px solid #2563eb;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6b7280;">Your message</p>
              <p style="margin:0;font-size:13px;color:#111827;line-height:1.65;white-space:pre-wrap;">${message}</p>
            </div>
            <p style="font-size:13px;color:#9ca3af;margin:0;">— The TokenLens Team</p>
          </div>
        `
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
}
