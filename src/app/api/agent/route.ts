import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/repos";
import { runAgentCycle } from "@/lib/agent";

const settingsSchema = z.object({
  agentEnabled: z.boolean().optional(),
  agentKeywords: z.string().optional(),
  runNow: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await findUserById(session.user.id);
  const user = row
    ? { agentEnabled: row.agentEnabled, agentKeywords: row.agentKeywords }
    : null;

  return NextResponse.json({ agent: user });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    parsed.data.agentEnabled !== undefined ||
    parsed.data.agentKeywords !== undefined
  ) {
    await updateUser(session.user.id, {
      ...(parsed.data.agentEnabled !== undefined
        ? { agentEnabled: parsed.data.agentEnabled }
        : {}),
      ...(parsed.data.agentKeywords !== undefined
        ? { agentKeywords: parsed.data.agentKeywords }
        : {}),
    });
  }

  let run = null;
  if (parsed.data.runNow) {
    run = await runAgentCycle();
  }

  const row = await findUserById(session.user.id);
  const user = row
    ? { agentEnabled: row.agentEnabled, agentKeywords: row.agentKeywords }
    : null;

  return NextResponse.json({ agent: user, run });
}
