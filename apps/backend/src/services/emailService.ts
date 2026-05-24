import nodemailer from 'nodemailer';
import { env } from '../env.js';

// Email is optional. Account verification was removed (accounts are usable on
// signup), so the only remaining email is the password-reset link. When SMTP
// isn't configured we degrade gracefully — log the link to the server console
// (convenient in local dev) instead of throwing, so a missing mail provider can
// never break the request that triggered it.
const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
    })
  : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!transporter) {
    console.log(`[email] SMTP not configured — password reset link for ${to}:\n  ${resetUrl}`);
    return;
  }
  await transporter.sendMail({
    from: `"Stakeless" <${env.SMTP_FROM}>`,
    to,
    subject: 'Reset your password',
    text: `Click this link to reset your password: ${resetUrl}\n\nThis link expires in 24 hours and can only be used once.`,
    html: `
      <p>You requested a password reset for your Stakeless account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 24 hours and can only be used once.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}
