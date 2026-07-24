import { NextResponse } from "next/server";
import { adminReady } from "@/lib/server/admin";

export const runtime = "nodejs";

/** GET /api/v1/health */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "rentsafe-pro",
    admin: adminReady(),
    time: new Date().toISOString(),
  });
}
