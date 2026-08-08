import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listApplications } from "@/lib/repos";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const applications = await listApplications(session.user.id);

  return NextResponse.json({ applications });
}
