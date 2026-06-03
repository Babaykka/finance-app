import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Draft confirmation is disabled until Task 7 adds action application tests." },
    { status: 501 }
  );
}
