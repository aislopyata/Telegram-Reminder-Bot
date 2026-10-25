import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      service: "telegram-reminder-bot",
      docs: "/api/health",
    },
    { status: 200 },
  );
}
