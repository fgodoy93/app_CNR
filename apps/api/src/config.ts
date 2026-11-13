import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  /** public base URL of the API, used in PDFs (verification QR) and emails */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8081'),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(30),
  /** 32-byte key (base64 or hex) used for AES-256-GCM encryption of secrets and evidences */
  APP_ENCRYPTION_KEY: z.string().min(32),
  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  STORAGE_DIR: z.string().default('./storage'),
  ENCRYPT_EVIDENCES: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('TerrenoCNR <no-reply@terreno.local>'),
  /** comma separated emails that receive operational alerts (incidents, DLQ, errors) */
  ALERT_EMAILS: z.string().default(''),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
  STT_API_URL: z.string().url().optional(),
  STT_API_KEY: z.string().optional(),
  STT_MODEL: z.string().default('whisper-1'),
  LOG_LEVEL: z.string().default('info'),
  WORKERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof envSchema>;

function load(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida:\n${msg}`);
  }
  return parsed.data;
}

export const config = load();
export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
export const alertEmails = config.ALERT_EMAILS.split(',').map((s) => s.trim()).filter(Boolean);
