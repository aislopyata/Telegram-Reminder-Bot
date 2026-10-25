import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "telegram-reminder-bot",
      time: new Date().toISOString(),
    },
    { status: 200 },
  );
}
