/**
 * Register (or remove) the Telegram webhook used by the Next.js app.
 * Used when BOT_MODE=webhook; the long-polling bot entry (src/bot/index.ts)
 * is used when BOT_MODE=polling.
 *
 *   npm run webhook:set
 *   npm run webhook:delete
 *   npm run webhook:info
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_BASE_URL = process.env.APP_BASE_URL;

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, body) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    console.error(`${method} failed`, payload);
    process.exit(1);
  }
  return payload;
}

const mode = process.argv[2];

if (mode === "--delete") {
  const payload = await call("deleteWebhook");
  console.log("webhook deleted", payload.result);
  process.exit(0);
}

if (mode === "--info") {
  const payload = await call("getWebhookInfo");
  console.log(JSON.stringify(payload.result, null, 2));
  process.exit(0);
}

const url = `${APP_BASE_URL}/api/telegram/webhook`;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  console.error("TELEGRAM_WEBHOOK_SECRET is required for webhook mode");
  process.exit(1);
}
const payload = await call("setWebhook", {
  url,
  secret_token: secret,
});
console.log("webhook set", url, JSON.stringify(payload.result));
