import { NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/auth";
import { runScheduledProcessing } from "@/lib/scheduler";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronRequest(request.headers, request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const stats = await runScheduledProcessing();
    return NextResponse.json({ ok: true, stats }, { status: 200 });
  } catch (error) {
    logger.error("cron_process_failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
