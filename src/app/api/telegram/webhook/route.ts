import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyWebhookSecret } from "@/lib/auth";
import { handleTelegramUpdate } from "@/lib/bot/dispatcher";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const db = getDb();
    await handleTelegramUpdate(db, body);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    logger.error("webhook_handler_failed", error);
    // Return 200 to avoid Telegram retry storms on malformed payloads while
    // still logging; state-changing validation is handled inside the dispatcher.
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
