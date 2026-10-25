/**
 * Minimal environment needed by modules imported in unit tests.
 * Integration tests additionally require TEST_DATABASE_URL.
 */
process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:5432/unused";
process.env.TELEGRAM_BOT_TOKEN ??= "123456789:test-token";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-webhook-secret-0123456789";
process.env.CRON_SECRET ??= "test-cron-secret-0123456789";
