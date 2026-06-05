import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.RENDER_GIT_COMMIT ?? null
  });
}
