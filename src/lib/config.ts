import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("Just Flow SSL Monitor"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z.string().default("false").transform(v => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  DEFAULT_ALERT_RECIPIENTS: z.string().default(""),
  DEFAULT_ALERT_THRESHOLDS: z.string().default("30,14,7,3,1,0"),
  MONITORING_TIMEZONE: z.string().default("America/New_York"),
  MONITOR_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).default(365),
  ALLOW_PRIVATE_ORIGIN_HOSTS: z.string().default("false").transform(v => v === "true"),
  ALLOWED_TLS_PORTS: z.string().default("443,8443"),
  DAILY_MONITORING_ENABLED: z.string().default("true").transform(v => v === "true")
});

export type Config = z.infer<typeof schema>;
let cached: Config | undefined;
export function config(): Config {
  cached ??= schema.parse(process.env);
  return cached;
}
