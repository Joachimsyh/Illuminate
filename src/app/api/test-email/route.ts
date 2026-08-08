import { NextResponse } from "next/server";
import { sendTestEmail, TEST_EMAIL_TO } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = await sendTestEmail(TEST_EMAIL_TO);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    id: result.id,
    to: TEST_EMAIL_TO,
  });
}
