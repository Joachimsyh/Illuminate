import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { agentEnabled: true, agentKeywords: true },
  });

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
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(parsed.data.agentEnabled !== undefined
          ? { agentEnabled: parsed.data.agentEnabled }
          : {}),
        ...(parsed.data.agentKeywords !== undefined
          ? { agentKeywords: parsed.data.agentKeywords }
          : {}),
      },
    });
  }

  let run = null;
  if (parsed.data.runNow) {
    run = await runAgentCycle();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { agentEnabled: true, agentKeywords: true },
  });

  return NextResponse.json({ agent: user, run });
}
