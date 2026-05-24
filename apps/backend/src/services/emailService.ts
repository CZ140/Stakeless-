import nodemailer from 'nodemailer';
import { env } from '../env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await transporter.sendMail({
    from: `"Stakeless" <${env.SMTP_FROM}>`,
    to,
    subject: 'Verify your email address',
    text: `Click this link to verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    html: `
      <p>Welcome to Stakeless!</p>
      <p><a href="${verifyUrl}">Click here to verify your email address</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
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
