import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().min(1024).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // SMTP is optional — it's only used for the password-reset email. When unset,
  // the email service logs the reset link to the console instead (see
  // services/emailService.ts), so the app boots and works without a mail provider.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().email('SMTP_FROM must be a valid email').default('noreply@stakeless.local'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  // Google OAuth client ID (the public client ID, not a secret). Optional so the
  // app still boots without Google sign-in configured; when unset, POST
  // /api/auth/google returns 503 and the frontend hides the button.
  GOOGLE_CLIENT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`[startup] Environment validation failed:\n${issues}`);
  console.error('[startup] Copy .env.example to .env and fill in the required values.');
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
