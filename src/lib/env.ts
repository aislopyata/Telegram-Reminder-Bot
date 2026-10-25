import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  APP_BASE_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  REMINDER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
  DELIVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: environment values are read once per process otherwise. */
export function resetEnvCache(): void {
  cached = undefined;
}
