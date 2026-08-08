import { NextResponse } from "next/server";
import { pingDb } from "@/lib/db";

export async function GET() {
  try {
    await pingDb();
    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        message: err instanceof Error ? err.message : "db error",
      },
      { status: 503 }
    );
  }
}
