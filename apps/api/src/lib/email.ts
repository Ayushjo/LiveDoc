import { Resend } from 'resend';

// Resend client — null if API key not configured (falls back to console.log)
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.RESEND_FROM_EMAIL ?? 'LiveDoc <noreply@livedoc.app>';

// ─── Base send ────────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resend) {
    // Dev fallback — log the email so it's visible without a real Resend key
    console.log(`\n[Email] To: ${opts.to}`);
    console.log(`[Email] Subject: ${opts.subject}`);
    console.log(`[Email] Preview: ${opts.html.replace(/<[^>]+>/g, ' ').slice(0, 200)}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  if (error) {
    console.error('[Email] send failed:', error);
    // Non-fatal — log but don't throw (caller can decide)
  }
}

// ─── Templated emails ─────────────────────────────────────────────────────────

function baseHtml(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f9fafb; margin:0; padding:40px 20px; }
  .card { background:#fff; border-radius:12px; border:1px solid #e5e7eb; max-width:480px; margin:0 auto; padding:40px; }
  .logo { font-weight:700; font-size:18px; letter-spacing:-0.5px; margin-bottom:32px; }
  h2 { font-size:22px; font-weight:700; margin:0 0 8px; color:#111; }
  p { color:#6b7280; font-size:14px; line-height:1.6; margin:8px 0 24px; }
  .btn { display:inline-block; background:#111; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; }
  .footer { color:#9ca3af; font-size:12px; margin-top:32px; border-top:1px solid #f3f4f6; padding-top:20px; }
</style></head>
<body>
  <div class="card">
    <div class="logo">★ LiveDoc</div>
    ${content}
    <div class="footer">You received this email from LiveDoc. If you didn't request this, you can safely ignore it.</div>
  </div>
</body>
</html>`;
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: 'Reset your LiveDoc password',
    html: baseHtml(`
      <h2>Reset your password</h2>
      <p>Hi ${opts.name || 'there'}, we received a request to reset your LiveDoc password. Click the button below to choose a new one.</p>
      <a href="${opts.resetUrl}" class="btn">Reset Password</a>
      <p style="margin-top:24px">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    `),
  });
}

export async function sendInvitationEmail(opts: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
}): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: `${opts.inviterName} invited you to join ${opts.workspaceName} on LiveDoc`,
    html: baseHtml(`
      <h2>You've been invited</h2>
      <p><strong>${opts.inviterName}</strong> has invited you to join <strong>${opts.workspaceName}</strong> as a <strong>${opts.role.toLowerCase()}</strong> on LiveDoc — the AI-powered knowledge base for your team.</p>
      <a href="${opts.acceptUrl}" class="btn">Accept Invitation</a>
      <p style="margin-top:24px">This invitation expires in 7 days.</p>
    `),
  });
}
